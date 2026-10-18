/**
 * DUPLICATE, AND A HOST'S OWN CARD-MENU ITEMS (STORY-0065) — the pure edit
 * under plain node, then the lane editor mounted in jsdom (tests/flow_env.mjs).
 *
 *   §1  duplicateStep: a fresh id, a derived label that no other step has, a
 *       DEEP copy of the config, the same lines in (none out), put right after
 *       the original; a join's other lane comes along; the lanes still draw
 *   §2  …refused WITH A REASON, changing nothing: no such step, a type the
 *       catalogue says is not available here
 *   §3  the card menu's Duplicate: a copy with a new id and the same config,
 *       chosen and focused; one undo entry
 *   §4  Ctrl/⌘+D on a focused card duplicates it; Ctrl+Z removes the copy,
 *       Ctrl+Y brings it back
 *   §5  read only: Duplicate greyed WITH the reason; Ctrl+D copies nothing and
 *       says why; a type that cannot be copied is greyed with its own reason
 *   §6  menuItems(step): the host's items after the built-in ones, past a
 *       separator; an item edits a draft and the edit is ONE undoable entry
 *       (`flow:step:menu`); false, no change, a stale draft are not taken; a
 *       host's own refusal and read only grey an item with the reason
 *
 *     node tests/flow_lanes_duplicate.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow lanes — duplicate and host menu items');
const { window, document } = t;
const kit = await import('../src/flow/kit/index.js');
const { createLaneEditor, LANE_ACTIONS, layoutLanes, normalisePipeline, lanePipeline } = await import('../src/flow/lanes/index.js');
const flow = await import('../flow.js');
const { CATEGORIES, MOCK_PIPELINE, SUMMARIES, TYPES } = await import('./fixtures/flow_lanes_fixture.mjs');

const catalogue = kit.createStepCatalogue(TYPES, { categories: CATEGORIES });
const references = { formula: kit.FORMULA_REFERENCES, parameter: kit.PARAMETER_REFERENCES, template: kit.TEMPLATE_REFERENCES };
const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];
const cardOf = (root, id) => $$(root, '.twm-flow-lanes__node').find((n) => n.dataset.step === id);
const buttonOf = (root, id) => $(cardOf(root, id), '.twm-flow-lanes__card');
const ids = (p) => p.nodes.map((n) => n.id);
const into = (p, id) => p.connections.filter((c) => c.targetId === id).map((c) => `${c.id}:${c.sourceId}>${c.targetPort}`);
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(extra = {}, graph = MOCK_PIPELINE) {
    const host = t.host();
    const changes = [];
    const editor = createLaneEditor(host, {
        catalogue, references, summarise: (n) => SUMMARIES[n.id] ?? '',
        clock: { setTimeout: () => 0, clearTimeout() {} },
        onChange: (c) => changes.push(c), ...extra,
    });
    editor.load({ graph });
    return { editor, root: editor.el, changes };
}
function openMenu(root, id) {
    buttonOf(root, id).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return kit.openFlowPopover();
}
const itemOf = (menu, id) => $$(menu, '[role="menuitem"]').find((b) => b.dataset.item === id);

t.section('§1 duplicateStep');
{
    const p = normalisePipeline(MOCK_PIPELINE);
    const before = JSON.stringify(p.nodes.find((n) => n.id === 'intake'));
    const r = lanePipeline.duplicateStep(p, catalogue, 'intake');
    t.check('a copy with a fresh id and a derived label', [r.ok, r.node.id, r.node.label], [true, 'filter', 'This intake only (copy)']);
    t.check('…the same config', r.node.config, { condition: '[intake] = {{intake}}' });
    t.ok('…a DEEP copy: changing it leaves the original alone', (() => {
        r.node.config.condition = 'x';
        return JSON.stringify(p.nodes.find((n) => n.id === 'intake')) === before;
    })());
    t.check('…put right after the original', ids(p), ['src', 'intake', 'filter', 'prog', 'join', 'tidy', 'rename', 'sink']);
    t.check('…the same line in, under the lowest free id, and none out', [into(p, 'filter'), p.connections.filter((c) => c.sourceId === 'filter').length],
            [['c7:src>in'], 0]);
    t.check('…a fork of what fed the original: the lanes still draw', [layoutLanes(p, catalogue).problems, layoutLanes(p, catalogue).lanes.length], [[], 3]);
    const again = lanePipeline.duplicateStep(p, catalogue, 'intake');
    t.check('a second copy: the next id, and a label no step has yet', [again.node.id, again.node.label], ['filter-2', 'This intake only (copy 2)']);
    const join = lanePipeline.duplicateStep(p, catalogue, 'join');
    t.check('a join\'s copy takes both its lines in, the other lane\'s too', into(p, join.node.id), ['c9:intake>in', 'c10:prog>in_right']);
    t.check('…and the flow still draws as lanes', layoutLanes(p, catalogue).problems, []);
    const plain = normalisePipeline({ nodes: [{ id: 'a', type: 'read-table', config: { table: 'T' }, position: { x: 1 }, note: { k: 1 } }] });
    const pr = lanePipeline.duplicateStep(plain, catalogue, 'a');
    t.check('no label: the type\'s, copied; unknown keys kept; the place (position) not', pr.node,
            { id: 'read-table', type: 'read-table', label: 'Read (copy)', config: { table: 'T' }, note: { k: 1 } });
    const said = lanePipeline.duplicateStep(normalisePipeline(MOCK_PIPELINE), catalogue, 'src',
                                            { strings: { copyLabel: (title) => `Copy of ${title}` } });
    t.check('the label\'s words are the consumer\'s to give', said.node.label, 'Copy of Portal applications');
}

t.section('§2 refused, with a reason, changing nothing');
{
    const p = normalisePipeline(MOCK_PIPELINE);
    const text = lanePipeline.serialisePipeline(p);
    const none = lanePipeline.duplicateStep(p, catalogue, 'nope');
    t.check('no such step', [none.ok, none.reason], [false, 'There is no step ‘nope’ to copy.']);
    const q = normalisePipeline({ ...MOCK_PIPELINE, nodes: [...MOCK_PIPELINE.nodes, { id: 'arch', type: 'archive', config: {} }] });
    const qtext = lanePipeline.serialisePipeline(q);
    const off = lanePipeline.duplicateStep(q, catalogue, 'arch');
    t.check('a type that is not available here: the catalogue\'s reason', [off.ok, off.reason],
            [false, '‘Archive’ cannot be copied: Archiving is switched off on this server.']);
    t.check('…and nothing changed either time', [lanePipeline.serialisePipeline(p), lanePipeline.serialisePipeline(q)], [text, qtext]);
    t.ok('the edit is one of LANE_ACTIONS, and so is a host item\'s', LANE_ACTIONS.includes('flow:step:duplicate') && LANE_ACTIONS.includes('flow:step:menu'));
    t.ok('the words are exported from the package entry', flow.LANE_PIPELINE_STRINGS === lanePipeline.PIPELINE_STRINGS
         && typeof flow.lanePipeline.duplicateStep === 'function');
}

t.section('§3 the card menu\'s Duplicate');
{
    const { editor, root, changes } = mount();
    const menu = openMenu(root, 'tidy');
    t.check('the built-in items, Duplicate among them', $$(menu, '[role="menuitem"]').map((b) => b.dataset.item),
            ['settings', 'add', 'duplicate', 'remove']);
    t.press(itemOf(menu, 'duplicate'));
    const g = editor.getGraph();
    const copy = g.nodes.find((n) => n.label === 'Tidy names, emails (copy)');
    t.ok('a copy with a NEW id', copy && copy.id !== 'tidy' && g.nodes.filter((n) => n.id === copy.id).length === 1);
    t.check('…and the same config', copy.config, g.nodes.find((n) => n.id === 'tidy').config);
    t.check('…which is chosen: the editor, its card, its tab', [editor.selected, buttonOf(root, copy.id)?.getAttribute('aria-current'),
            $(root, '[role="tab"][aria-selected="true"]')?.dataset.tab], [copy.id, 'true', copy.id]);
    t.check('…and focused', document.activeElement === buttonOf(root, copy.id), true);
    t.check('…its settings in the panel', $(root, '.twm-flow-panel__title-input').value, 'Tidy names, emails (copy)');
    t.check('one edit, reported as flow:step:duplicate', [changes.length, changes.at(-1).action, editor.history.depth], [1, 'flow:step:duplicate', 1]);
    t.ok('the menu closed', kit.openFlowPopover() === null);
    editor.destroy();
}

t.section('§4 Ctrl+D, Ctrl+Z');
{
    const { editor, root, changes } = mount();
    const before = editor.serialise();
    editor.select('intake');
    buttonOf(root, 'intake').focus();
    const ev = new window.KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true });
    buttonOf(root, 'intake').dispatchEvent(ev);
    t.ok('Ctrl+D on a focused card is the editor\'s (the browser\'s bookmark refused)', ev.defaultPrevented);
    t.check('…and copies that card\'s step', [editor.getGraph().nodes.length, editor.selected], [8, 'filter']);
    t.check('…the copy has its focus', document.activeElement === buttonOf(root, 'filter'), true);
    t.key(buttonOf(root, 'filter'), 'z', { ctrlKey: true });
    t.check('Ctrl+Z removes the copy: the flow is as it was', [editor.serialise() === before, editor.getGraph().nodes.some((n) => n.id === 'filter')],
            [true, false]);
    t.check('…and the copy is no longer chosen', editor.selected !== 'filter', true);
    t.key(root, 'y', { ctrlKey: true });
    t.check('Ctrl+Y brings it back', editor.getGraph().nodes.some((n) => n.id === 'filter'), true);
    t.check('⌘+D duplicates too', (() => {
        buttonOf(root, 'prog').focus();
        t.key(buttonOf(root, 'prog'), 'd', { metaKey: true });
        return editor.getGraph().nodes.some((n) => n.label === 'Programmes (copy)');
    })(), true);
    t.check('Ctrl+D inside a text field is the field\'s', (() => {
        const n = editor.getGraph().nodes.length;
        t.key($(root, '.twm-flow-panel__title-input'), 'd', { ctrlKey: true });
        return editor.getGraph().nodes.length === n;
    })(), true);
    t.check('the actions reported', changes.map((c) => c.action), ['flow:step:duplicate', 'undo', 'redo', 'flow:step:duplicate']);
    editor.destroy();
}

t.section('§5 read only, and a step that cannot be copied');
{
    const { editor, root, changes } = mount();
    editor.setReadOnly({ reason: 'A published version is read only.' });
    const menu = openMenu(root, 'join');
    const dup = itemOf(menu, 'duplicate');
    t.check('Duplicate is greyed', [dup.disabled, dup.getAttribute('aria-disabled'), dup.classList.contains('twm-flow-lanes__menu-item--refused')],
            [true, 'true', true]);
    t.check('…WITH the reason, in its own line', $(dup, '.twm-flow-lanes__menu-reason')?.textContent, 'A published version is read only.');
    t.press(dup);
    t.check('…and pressing it copies nothing', editor.getGraph().nodes.length, 7);
    kit.closeFlowPopovers();
    buttonOf(root, 'join').focus();
    t.key(buttonOf(root, 'join'), 'd', { ctrlKey: true });
    t.check('Ctrl+D copies nothing, and says why', [editor.getGraph().nodes.length, $(root, '.twm-flow-lanes__notice').hidden,
            $(root, '.twm-flow-lanes__notice').textContent], [7, false, 'A published version is read only.']);
    t.check('nothing was reported', changes.length, 0);
    editor.destroy();

    const odd = { ...MOCK_PIPELINE, nodes: [...MOCK_PIPELINE.nodes, { id: 'arch', type: 'archive', label: 'Old rows', config: {} }],
                  connections: [...MOCK_PIPELINE.connections, { id: 'c7', sourceId: 'tidy', sourcePort: 'out', targetId: 'arch', targetPort: 'in' }] };
    const m = mount({}, odd);
    const why = $(itemOf(openMenu(m.root, 'arch'), 'duplicate'), '.twm-flow-lanes__menu-reason')?.textContent;
    t.check('a type the catalogue refuses: greyed with ITS reason', why, '‘Old rows’ cannot be copied: Archiving is switched off on this server.');
    kit.closeFlowPopovers();
    buttonOf(m.root, 'arch').focus();
    t.key(buttonOf(m.root, 'arch'), 'd', { ctrlKey: true });
    t.check('…and Ctrl+D on it says that reason', [m.editor.getGraph().nodes.length, $(m.root, '.twm-flow-lanes__notice').textContent], [8, why]);
    t.key(buttonOf(m.root, 'tidy'), 'd', { ctrlKey: true });
    t.check('…which the next edit clears', $(m.root, '.twm-flow-lanes__notice').hidden, true);
    m.editor.destroy();
}

t.section('§6 a host\'s menu items');
{
    const asked = [];
    let later = null;
    const items = (step) => {
        asked.push(step);
        step.config.mutated = true;      // a copy: this changes nothing in the flow
        return [
            { id: 'tag', label: 'Tag it', icon: 'label', run: ({ step: s, pipeline }) => {
                pipeline.nodes.find((n) => n.id === s.id).config.tag = 'checked';
            } },
            { id: 'later', label: 'Ask first', run: ({ pipeline }) => new Promise((resolve) => {
                later = () => { pipeline.nodes = pipeline.nodes.filter((n) => n.id !== 'tidy'); resolve(); };
            }) },
            { id: 'no', label: 'Changes its mind', run: ({ pipeline }) => { pipeline.nodes = []; return false; } },
            { id: 'look', label: 'Only looks', run: () => {} },
            { id: 'locked', label: 'Locked', disabled: true, reason: 'Only an owner may lock.', run: () => {} },
        ];
    };
    const { editor, root, changes } = mount({ menuItems: items });
    const menu = openMenu(root, 'tidy');
    t.check('after the built-in items, past a separator', $$(menu, '[role="menuitem"], [role="separator"]')
        .map((b) => b.dataset.item ?? b.getAttribute('role')), ['settings', 'add', 'duplicate', 'remove', 'separator', 'tag', 'later', 'no', 'look', 'locked']);
    t.check('asked with the step', asked.map((s) => s.id), ['tidy']);
    t.ok('…a copy of it: the host changed nothing by touching it', !('mutated' in editor.getGraph().nodes.find((n) => n.id === 'tidy').config));
    t.check('the host\'s words and glyph', itemOf(menu, 'tag').textContent, 'labelTag it');
    t.check('a host\'s own refusal: greyed with its reason', [itemOf(menu, 'locked').disabled,
            $(itemOf(menu, 'locked'), '.twm-flow-lanes__menu-reason')?.textContent], [true, 'Only an owner may lock.']);
    t.press(itemOf(menu, 'tag'));
    await flush();
    t.check('its edit is taken', editor.getGraph().nodes.find((n) => n.id === 'tidy').config.tag, 'checked');
    t.check('…as ONE undoable edit, flow:step:menu', [changes.length, changes.at(-1).action, editor.history.depth], [1, 'flow:step:menu', 1]);
    editor.undo();
    t.check('undo puts it back', 'tag' in editor.getGraph().nodes.find((n) => n.id === 'tidy').config, false);
    editor.redo();
    t.check('redo takes it again', editor.getGraph().nodes.find((n) => n.id === 'tidy').config.tag, 'checked');

    t.press(itemOf(openMenu(root, 'tidy'), 'no'));
    await flush();
    t.check('an item that answers false: nothing taken', [editor.getGraph().nodes.length, changes.length], [7, 3]);
    t.press(itemOf(openMenu(root, 'tidy'), 'look'));
    await flush();
    t.check('an item that changes nothing: no edit', changes.length, 3);

    editor.select('tidy');
    t.press(itemOf(openMenu(root, 'tidy'), 'later'));
    await flush();
    later();
    await flush();
    t.check('an item that answers later: its edit taken then (the step removed, another chosen)',
            [editor.getGraph().nodes.some((n) => n.id === 'tidy'), editor.selected !== 'tidy', changes.at(-1).action], [false, true, 'flow:step:menu']);
    editor.undo();
    t.check('…and undone as one', editor.getGraph().nodes.some((n) => n.id === 'tidy'), true);

    t.press(itemOf(openMenu(root, 'tidy'), 'later'));
    await flush();
    editor.select('src');
    t.typeInto($(root, '[data-field="dataset"] input'), 'public.other');
    const n = changes.length;
    later();
    await flush();
    t.check('a draft made before another edit is dropped: that flow is gone', [editor.getGraph().nodes.some((x) => x.id === 'tidy'), changes.length],
            [true, n]);

    editor.setReadOnly({ reason: 'A published version is read only.' });
    const ro = openMenu(root, 'tidy');
    t.check('read only: every host item greyed with the reason', ['tag', 'later', 'no', 'look', 'locked'].map((id) => [itemOf(ro, id).disabled,
            $(itemOf(ro, id), '.twm-flow-lanes__menu-reason')?.textContent]), Array(5).fill([true, 'A published version is read only.']));
    kit.closeFlowPopovers();
    editor.destroy();
}

t.done();
