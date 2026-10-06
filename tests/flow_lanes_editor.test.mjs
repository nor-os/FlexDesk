/**
 * THE LANE EDITOR, MOUNTED (36 §7, §8) — jsdom, through tests/flow_env.mjs.
 * jsdom computes no layout and starts no native drag: where things are DRAWN
 * is checked in headless Edge (demo/flow_lanes_probe.mjs); here, the DOM, the
 * JSON, the history and the callbacks.
 *
 *   §1  the mock, mounted: two lanes named for their first step, seven cards
 *       placed by the layout, six wires and one port dot, "+" on every card
 *       but the sink, a tab per step left to right, the parameters strip
 *   §2  opened and saved with no edit: byte-identical
 *   §3  choosing a card toggles classes and REBUILDS NOTHING (the press lands
 *       on the node it went down on); the tab and the panel follow
 *   §4  "+" opens the step picker without sources and with a refused type
 *       greyed, and splices the chosen step in; one undo entry
 *   §5  Add a source offers sources only and starts a new lane
 *   §6  a join's other lane is a SETTING: "Joined with" rewires it, the
 *       line is redrawn for you; undo and redo
 *   §7  remove: Delete on a card, the panel's button, the card's menu
 *   §8  settings and names: written into the step, the card redrawn in
 *       place, keyed commits merge, a rename asks for no preview
 *   §9  keys: arrows between cards and tabs, Enter, Escape, F2, Ctrl+Z,
 *       Backspace never the editor's
 *   §10 the providers: one request, the cards' counts, the dock's Preview (a
 *       FlexDesk DataTable), Columns from describe, Would be rejected for a
 *       sink — and the NEWEST ANSWER WINS with a provider that answers out of
 *       order; a failure is the provider's sentence and changes nothing else
 *   §11 Steps show: the last run, asked of the consumer once
 *   §12 findings: on the card, under the field, in the strip, Go to it
 *   §13 read only, and a flow that cannot be drawn as lanes
 *   §14 compact: the strip, read only, nothing to press
 *   §15 parameters: add, refuse, change, remove — each one undo entry
 *   §16 destroy leaves nothing behind
 *
 *     node tests/flow_lanes_editor.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow lanes — the editor');
const { document, window } = t;
const kit = await import('../src/flow/kit/index.js');
const { createLaneEditor, LANE_ACTIONS, serialisePipeline, normalisePipeline, placeLanes, layoutLanes } = await import('../src/flow/lanes/index.js');
const { CATEGORIES, MOCK_DESCRIBE, MOCK_PIPELINE, MOCK_PREVIEW, MOCK_RUN, SUMMARIES, TYPES } = await import('./fixtures/flow_lanes_fixture.mjs');

const catalogue = kit.createStepCatalogue(TYPES, { categories: CATEGORIES });
const references = { formula: kit.FORMULA_REFERENCES, parameter: kit.PARAMETER_REFERENCES, template: kit.TEMPLATE_REFERENCES };
const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];
const cardOf = (root, id) => $$(root, '.twm-flow-lanes__node').find((n) => n.dataset.step === id);
const buttonOf = (root, id) => $(cardOf(root, id), '.twm-flow-lanes__card');

/** A clock a test moves by hand, for the preview's debounce. */
function manualClock() {
    let now = 0;
    let next = 1;
    const timers = new Map();
    return {
        setTimeout(fn, ms) { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
        clearTimeout(id) { timers.delete(id); },
        advance(ms) {
            const until = now + ms;
            for (;;) {
                const due = [...timers.entries()].filter(([, x]) => x.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                timers.delete(due[0]);
                now = due[1].at;
                due[1].fn();
            }
            now = until;
        },
    };
}

function mount(extra = {}) {
    const host = t.host();
    host.style.height = '900px';
    const changes = [];
    const selects = [];
    const editor = createLaneEditor(host, {
        catalogue, references, summarise: (n) => SUMMARIES[n.id] ?? '', clock: manualClock(),
        onChange: (c) => changes.push(c), onSelect: (s) => selects.push(s), ...extra,
    });
    if (extra.load !== false) editor.load({ graph: MOCK_PIPELINE });
    return { host, editor, root: editor.el, changes, selects };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

t.section('§1 the mock, mounted');
{
    const { editor, root } = mount();
    const lanes = $$(root, '.twm-flow-lanes__lane');
    t.check('two lanes, each a group named for its first step', lanes.map((l) => [l.getAttribute('role'), l.getAttribute('aria-label')]),
            [['group', 'Lane 1: Portal applications'], ['group', 'Lane 2: Programmes']]);
    t.check('seven cards, in their lanes', lanes.map((l) => $$(l, '.twm-flow-lanes__node').map((n) => n.dataset.step)),
            [['src', 'intake', 'join', 'tidy', 'rename', 'sink'], ['prog']]);
    const placed = placeLanes(layoutLanes(MOCK_PIPELINE, catalogue), 'regular');
    t.ok('every card sits where placeLanes puts it (left; top inside its lane)', placed.cards.every((c) => {
        const n = cardOf(root, c.id);
        return n.style.left === `${c.x}px` && n.style.top === `${c.y - placed.bands[c.lane].top}px`;
    }));
    t.check('the lanes are the bands', lanes.map((l) => [l.style.top, l.style.height]), [['0px', '86px'], ['112px', '86px']]);
    t.check('the surface is the layout\'s size', [$(root, '.twm-flow-lanes__surface').style.width, $(root, '.twm-flow-lanes__surface').style.height],
            ['1374px', '198px']);
    const wires = $$(root, '.twm-flow-lanes__wire');
    t.check('six wires, one a connection, each its kind', wires.map((w) => w.dataset.kind), ['lane', 'lane', 'join', 'lane', 'lane', 'lane']);
    t.check('the join\'s line is drawn for you, and is the layout\'s path', wires[2].getAttribute('d'), 'M438 155H562Q572 155 572 145V74');
    t.check('one port dot, at the join\'s bottom centre', $$(root, '.twm-flow-lanes__port').map((p) => [p.getAttribute('cx'), p.getAttribute('cy')]),
            [['572', '74']]);
    t.check('a card is a button named "Kind: title" — and the step it is', buttonOf(root, 'join').getAttribute('aria-label'),
            'Join: Add the programme');
    t.check('its words: the title, the consumer\'s summary', [$(cardOf(root, 'join'), '.twm-flow-lanes__title').textContent,
                                                             $(cardOf(root, 'join'), '.twm-flow-lanes__sub').textContent],
            ['Add the programme', 'LEFT on programme_code']);
    t.check('shapes and tones from the role and the category',
            ['src', 'intake', 'join', 'sink'].map((id) => [...cardOf(root, id).classList].filter((c) => c.includes('--')).sort()),
            [['twm-flow-lanes__node--source', 'twm-flow-lanes__node--teal', 'twm-flow-lanes__node--selected'].sort(),
             ['twm-flow-lanes__node--indigo', 'twm-flow-lanes__node--transform'],
             ['twm-flow-lanes__node--operation', 'twm-flow-lanes__node--violet'],
             ['twm-flow-lanes__node--amber', 'twm-flow-lanes__node--sink']]);
    t.check('"+" on every card but the sink', $$(root, '.twm-flow-lanes__node').filter((n) => $(n, '.twm-flow-lanes__add')).map((n) => n.dataset.step).sort(),
            ['intake', 'join', 'prog', 'rename', 'src', 'tidy']);
    t.check('"+" says what it adds after', $(cardOf(root, 'intake'), '.twm-flow-lanes__add').getAttribute('aria-label'), 'Add a step after This intake only');
    t.check('cards are one Tab stop (the chosen one), "+" beside it', $$(root, '.twm-flow-lanes__card, .twm-flow-lanes__add').filter((b) => b.tabIndex === 0)
        .map((b) => [b.closest('[data-step]').dataset.step, b.className]), [['src', 'twm-flow-lanes__card'], ['src', 'twm-flow-lanes__add']]);
    const tabs = $$(root, '[role="tab"]');
    t.check('a tab per step, left to right (by column, then lane)', tabs.map((x) => x.textContent),
            ['Portal applications', 'This intake only', 'Programmes', 'Add the programme', 'Tidy names, emails', 'Name the columns', 'Into Applications']);
    t.check('each tab carries its step\'s tone', tabs.map((x) => [...x.classList].find((c) => c.startsWith('twm-flow-lanes__tab--'))),
            ['twm-flow-lanes__tab--teal', 'twm-flow-lanes__tab--indigo', 'twm-flow-lanes__tab--teal', 'twm-flow-lanes__tab--violet',
             'twm-flow-lanes__tab--indigo', 'twm-flow-lanes__tab--indigo', 'twm-flow-lanes__tab--amber']);
    t.check('the first step is chosen: its card, its tab, its settings', [buttonOf(root, 'src').getAttribute('aria-current'),
            tabs[0].getAttribute('aria-selected'), $(root, '.twm-flow-panel__title-input').value], ['true', 'true', 'Portal applications']);
    t.check('the tab list and its panel are wired', [$(root, '[role="tablist"]').getAttribute('aria-label'),
            $(root, '[role="tabpanel"]').getAttribute('aria-labelledby') === tabs[0].id], ['Steps', true]);
    t.check('Undo and Redo, nothing to undo yet', [$(root, '[data-action="undo"]').disabled, $(root, '[data-action="redo"]').disabled], [true, true]);
    t.check('Steps show: The preview, pressed', $$(root, '.twm-flow-lanes__show-btn').map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
            [['The preview', 'true'], ['The last run', 'false']]);
    t.check('the parameters strip: the name and its line', $$(root, '.twm-flow-lanes__param').map((p) => p.textContent), ['intaketext · default 2027']);
    t.check('…and how a step reads one, in the consumer\'s syntax', $(root, '.twm-flow-lanes__params-help').textContent,
            'Steps read it as {{intake}}. Whatever starts the flow supplies it.');
    t.check('Add a source, under the last lane', $(root, '.twm-flow-lanes__add-source').textContent, 'addAdd a source — starts a new lane');
    t.ok('no fetch, no storage: the editor wrote nothing anywhere', !window.localStorage?.length);
    const { LANE_STRINGS } = await import('../src/flow/lanes/index.js');
    t.check('the lane editor ADDS words: none of its keys re-defines one of the kit\'s',
            Object.keys(LANE_STRINGS).filter((k) => k in kit.FLOW_STRINGS), []);
    editor.destroy();
}

t.section('§2 opened and saved with no edit: byte-identical');
{
    const { editor, changes } = mount();
    t.check('serialise() is the text it was given', editor.serialise(), serialisePipeline(MOCK_PIPELINE));
    t.check('getGraph() is a copy, deep-equal', JSON.stringify(editor.getGraph()), JSON.stringify(normalisePipeline(MOCK_PIPELINE)));
    editor.getGraph().nodes[0].label = 'changed';
    t.check('…a copy: changing it changes nothing', editor.serialise(), serialisePipeline(MOCK_PIPELINE));
    editor.select('join');
    editor.select('sink');
    t.check('choosing steps is no edit: no change reported', changes.length, 0);
    t.check('the editor records exactly its closed list of actions', [...editor.history.actions], [...LANE_ACTIONS]);
    editor.destroy();
}

t.section('§3 choosing a card rebuilds nothing');
{
    const { editor, root, selects } = mount();
    const before = cardOf(root, 'join');
    const btn = buttonOf(root, 'join');
    t.press(btn);
    t.check('pressed: chosen', [cardOf(root, 'join').classList.contains('twm-flow-lanes__node--selected'), btn.getAttribute('aria-current')], [true, 'true']);
    t.ok('THE SAME NODE: the press rebuilt no card', cardOf(root, 'join') === before && btn.isConnected);
    t.check('the one before is no longer chosen', [buttonOf(root, 'src').getAttribute('aria-current'),
            cardOf(root, 'src').classList.contains('twm-flow-lanes__node--selected')], ['false', false]);
    t.check('onSelect', selects.at(-1), { kind: 'step', id: 'join' });
    t.check('its tab follows', $$(root, '[role="tab"]').find((x) => x.getAttribute('aria-selected') === 'true').textContent, 'Add the programme');
    const fields = $$(root, '.twm-flow-field').map((f) => f.dataset.field);
    t.check('the join\'s settings: This lane and Joined with FIRST, then its own', fields.slice(0, 4), ['__input:in', '__input:in_right', 'how', 'on']);
    const joined = $(root, '[data-field="__input:in_right"] select');
    t.check('Joined with names the lane the step is in', [...joined.options].map((o) => o.textContent),
            ['Choose…', 'Portal applications — this lane', 'This intake only — this lane', 'Programmes — the lane below']);
    t.check('…and holds Programmes', joined.options[joined.selectedIndex].textContent, 'Programmes — the lane below');
    t.check('…required', $(root, '[data-field="__input:in_right"] .twm-flow-field__required') !== null, true);
    t.check('a step with one input shows no "This lane"', (editor.select('tidy'), $$(root, '.twm-flow-field').map((f) => f.dataset.field)), ['columns']);
    t.press($$(root, '[role="tab"]').find((x) => x.textContent === 'Programmes'));
    t.check('a tab chooses its card', [buttonOf(root, 'prog').getAttribute('aria-current'), editor.selected], ['true', 'prog']);
    editor.destroy();
}

t.section('§4 "+" adds the next step');
{
    const { editor, root, changes } = mount();
    const add = $(cardOf(root, 'intake'), '.twm-flow-lanes__add');
    t.press(add);
    const pop = kit.openFlowPopover();
    t.ok('the kit\'s step picker opens from the "+"', pop && pop.getAttribute('role') === 'dialog');
    t.check('it says where the step lands', $(pop, '.twm-flow-picker__where').textContent, 'after This intake only');
    const labels = $$(pop, '[role="option"]').map((o) => o.dataset.entry);
    t.ok('no source is offered after a step', !labels.includes('read-system') && !labels.includes('read-table'));
    t.check('grouped by the consumer\'s categories, in order', $$(pop, '.twm-flow-picker__group-label').map((g) => g.textContent), ['Change', 'Combine', 'Write']);
    const refused = $$(pop, '[role="option"]').find((o) => o.dataset.entry === 'archive');
    t.check('a type the server refuses is greyed WITH its sentence, never hidden', [refused.getAttribute('aria-disabled'),
            $(refused, '.twm-flow-picker__refusal').textContent], ['true', 'Archiving is switched off on this server.']);
    t.press($$(pop, '[role="option"]').find((o) => o.dataset.entry === 'rename'));
    await flush();
    t.check('spliced in: intake → the new step → the join', $$(root, '.twm-flow-lanes__lane')[0].querySelectorAll('.twm-flow-lanes__node').length, 7);
    t.check('…in lane order', $$($$(root, '.twm-flow-lanes__lane')[0], '.twm-flow-lanes__node').map((n) => n.dataset.step),
            ['src', 'intake', 'rename-2', 'join', 'tidy', 'rename', 'sink']);
    t.check('the new step is chosen, and has the focus', [editor.selected, document.activeElement === buttonOf(root, 'rename-2')], ['rename-2', true]);
    t.check('one change, its action, its text', [changes.length, changes[0].action, changes[0].text === editor.serialise()], [1, 'flow:step:add', true]);
    t.check('the text: a new line c7 where the moved one was', JSON.parse(changes[0].text).connections.slice(0, 3).map((c) => c.id), ['c1', 'c7', 'c2']);
    t.check('Undo is enabled', $(root, '[data-action="undo"]').disabled, false);
    t.press($(root, '[data-action="undo"]'));
    t.check('one undo takes it all back, byte for byte', editor.serialise(), serialisePipeline(MOCK_PIPELINE));
    t.check('…reported as an undo, so the consumer saves it', changes.at(-1).action, 'undo');
    t.press($(root, '[data-action="redo"]'));
    t.check('redo puts it back', editor.getGraph().nodes.length, 8);
    t.check('a sink has no "+", even after an edit', $(cardOf(root, 'sink'), '.twm-flow-lanes__add'), null);
    editor.destroy();
}

t.section('§5 Add a source');
{
    const { editor, root, changes } = mount();
    t.press($(root, '.twm-flow-lanes__add-source'));
    const pop = kit.openFlowPopover();
    t.check('it offers sources only, under its own title', [$(pop, '.twm-flow-picker__title').textContent,
            $$(pop, '[role="option"]').map((o) => o.dataset.entry)], ['Add a source', ['read-system', 'read-table']]);
    t.check('…and says it starts a new lane', $(pop, '.twm-flow-picker__where').textContent, 'starts a new lane');
    t.press($$(pop, '[role="option"]').find((o) => o.dataset.entry === 'read-table'));
    await flush();
    const lanes = $$(root, '.twm-flow-lanes__lane');
    t.check('a third lane, at the bottom, holding the new source', [lanes.length, $$(lanes[2], '.twm-flow-lanes__node').map((n) => n.dataset.step)],
            [3, ['read-table']]);
    t.check('its action', changes.at(-1).action, 'flow:source:add');
    editor.destroy();
}

t.section('§6 a join\'s other lane is a setting');
{
    const { editor, root, changes } = mount();
    editor.select('join');
    const select = $(root, '[data-field="__input:in_right"] select');
    const option = [...select.options].find((o) => o.textContent.startsWith('Portal applications'));
    t.change(select, option.value);
    t.check('Joined with → Portal applications: the line is rewritten, its id kept',
            editor.getGraph().connections.find((c) => c.targetPort === 'in_right'), { id: 'c3', sourceId: 'src', sourcePort: 'out', targetId: 'join', targetPort: 'in_right' });
    t.check('its action', changes.at(-1).action, 'flow:join:set');
    t.check('the line is redrawn for you, from the new lane', $$(root, '.twm-flow-lanes__wire').find((w) => w.dataset.kind === 'join').dataset.from, 'src');
    t.check('Programmes is now a lane of its own, at the bottom', $$(root, '.twm-flow-lanes__lane').map((l) => l.getAttribute('aria-label')),
            ['Lane 1: Portal applications', 'Lane 2: Programmes']);
    t.check('the panel is drawn again and holds the new choice',
            (() => { const s = $(root, '[data-field="__input:in_right"] select'); return s.options[s.selectedIndex].textContent; })(),
            'Portal applications — this lane');
    editor.undo();
    t.check('undo: Programmes again', editor.getGraph().connections.find((c) => c.targetPort === 'in_right').sourceId, 'prog');
    t.change($(root, '[data-field="__input:in_right"] select'), '');
    t.check('Choose… leaves the input unconnected', editor.getGraph().connections.some((c) => c.targetPort === 'in_right'), false);
    t.check('…and Programmes is a lane that feeds nothing', $$(root, '.twm-flow-lanes__wire').filter((w) => w.dataset.kind === 'join').length, 0);
    editor.destroy();
}

t.section('§7 remove');
{
    const { editor, root, changes } = mount();
    editor.select('tidy');
    buttonOf(root, 'tidy').focus();
    t.key(buttonOf(root, 'tidy'), 'Delete');
    t.check('Delete on a card removes the step', editor.getGraph().nodes.some((n) => n.id === 'tidy'), false);
    t.check('…and its lane closes up: the join leads to the renaming now',
            editor.getGraph().connections.find((c) => c.targetId === 'rename'), { id: 'c5', sourceId: 'join', sourcePort: 'out', targetId: 'rename', targetPort: 'in' });
    t.check('…its action, and the step before it chosen', [changes.at(-1).action, editor.selected], ['flow:step:remove', 'join']);
    t.check('…with the focus on that card', document.activeElement === buttonOf(root, 'join'), true);
    editor.select('rename');
    t.press($(root, '.twm-flow-panel__action[data-action="remove"]'));
    t.check('the panel\'s Remove step', editor.getGraph().nodes.some((n) => n.id === 'rename'), false);
    const card = buttonOf(root, 'intake');
    card.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = kit.openFlowPopover();
    t.check('a card\'s menu', $$(menu, '[role="menuitem"]').map((m) => m.textContent), ['tuneOpen its settings', 'addAdd a step after it', 'deleteRemove step']);
    t.press($$(menu, '[role="menuitem"]').at(-1));
    t.check('…whose Remove step removes it', [editor.getGraph().nodes.some((n) => n.id === 'intake'), kit.openFlowPopover()], [false, null]);
    t.check('a removed source leaves its lane NOT CONNECTED, flagged', (() => {
        editor.select('src');
        t.key(buttonOf(root, 'src'), 'Delete');
        const lane = $$(root, '.twm-flow-lanes__lane')[0];
        return [lane.classList.contains('twm-flow-lanes__lane--unconnected'), $(lane, '.twm-flow-lanes__flag')?.textContent];
    })(), [true, 'Not connected']);
    editor.select('join');
    t.check('…and the step it fed offers "This lane", to connect it again', $$(root, '.twm-flow-field').map((f) => f.dataset.field).slice(0, 2),
            ['__input:in', '__input:in_right']);
    editor.destroy();
}

t.section('§8 settings and names');
{
    const requests = [];
    const clock = manualClock();
    const { editor, root, changes } = mount({ clock, preview: (q) => { requests.push(q); return new Promise(() => {}); } });
    clock.advance(0);
    const asked = requests.length;
    const before = cardOf(root, 'src');
    const box = $(root, '[data-field="dataset"] input');
    t.typeInto(box, 'public.applicants');
    t.check('a field writes into the step\'s config', editor.getGraph().nodes[0].config.dataset, 'public.applicants');
    t.check('…as flow:step:config, keyed by the step and the field', [changes.at(-1).action, changes.at(-1).key], ['flow:step:config', 'config:src:dataset']);
    t.typeInto(box, 'public.applicants2');
    t.check('typing on is ONE undo entry', editor.history.depth, 1);
    t.ok('the card was redrawn IN PLACE', cardOf(root, 'src') === before);
    clock.advance(800);
    t.check('a setting asks for a preview, 800 ms on', requests.length, asked + 1);
    const title = $(root, '.twm-flow-panel__title-input');
    t.typeInto(title, 'Applications');
    t.check('a name is the step\'s top-level label, never inside its config', [editor.getGraph().nodes[0].label, 'displayName' in editor.getGraph().nodes[0].config],
            ['Applications', false]);
    t.check('…drawn on the card and on its tab', [$(cardOf(root, 'src'), '.twm-flow-lanes__title').textContent,
            $$(root, '[role="tab"]')[0].textContent], ['Applications', 'Applications']);
    t.check('…flow:step:label', changes.at(-1).action, 'flow:step:label');
    clock.advance(800);
    t.check('a name changes no row: no preview asked for it', requests.length, asked + 1);
    t.typeInto(title, '');
    t.check('an empty name is no label: the type\'s is drawn', ['label' in editor.getGraph().nodes[0], $(cardOf(root, 'src'), '.twm-flow-lanes__title').textContent],
            [false, 'Read']);
    editor.destroy();
}

t.section('§9 keys');
{
    const { editor, root } = mount();
    const heard = [];
    const onWindow = (ev) => heard.push(ev.key);
    window.addEventListener('keydown', onWindow);
    buttonOf(root, 'src').focus();
    t.key(buttonOf(root, 'src'), 'ArrowRight');
    t.check('→ moves to the next card in the lane, and chooses it', [editor.selected, document.activeElement === buttonOf(root, 'intake')], ['intake', true]);
    t.key(buttonOf(root, 'intake'), 'ArrowDown');
    t.check('↓ moves to the nearest card in the lane below', editor.selected, 'prog');
    t.key(buttonOf(root, 'prog'), 'ArrowUp');
    t.check('↑ back up', editor.selected, 'intake');
    t.key(buttonOf(root, 'intake'), 'ArrowLeft');
    t.check('← back along', editor.selected, 'src');
    t.key(buttonOf(root, 'src'), 'ArrowLeft');
    t.check('← at a lane\'s start stays', editor.selected, 'src');
    t.key(buttonOf(root, 'src'), 'Enter');
    t.check('Enter opens the step\'s settings and focuses their FIRST FIELD', document.activeElement === $(root, '[data-field="dataset"] input'), true);
    t.key(document.activeElement, 'Escape');
    t.check('Escape goes back to the card', document.activeElement === buttonOf(root, 'src'), true);
    t.key(buttonOf(root, 'src'), 'F2');
    t.check('F2: the name', document.activeElement === $(root, '.twm-flow-panel__title-input'), true);
    const bs = t.key(buttonOf(root, 'src'), 'Backspace');
    t.check('Backspace on a card is NOT the editor\'s: nothing removed, nothing prevented', [editor.getGraph().nodes.length, bs], [7, true]);
    t.ok('…and it goes on up to the host', heard.includes('Backspace'));
    editor.select('tidy');
    t.key(buttonOf(root, 'tidy'), 'Delete');
    heard.length = 0;
    t.key(buttonOf(root, 'join'), 'z', { ctrlKey: true });
    t.check('Ctrl+Z undoes the removal', editor.getGraph().nodes.some((n) => n.id === 'tidy'), true);
    t.check('…and stops at the editor: a tile beside it never hears it', heard.includes('z'), false);
    t.typeInto($(root, '.twm-flow-panel__title-input'), 'x');
    t.key($(root, '.twm-flow-panel__title-input'), 'z', { ctrlKey: true });
    t.check('Ctrl+Z in a text field is the field\'s own — the editor does not undo', editor.getGraph().nodes.find((n) => n.id === editor.selected)?.label, 'x');
    t.check('…and still never reaches the window', heard.includes('z'), false);
    buttonOf(root, 'sink').focus();
    t.key(buttonOf(root, 'sink'), 'Enter');
    t.check('Enter on a card that has the focus but is not chosen opens THAT card', [editor.selected,
            document.activeElement === $(root, '[data-field="table"] input')], ['sink', true]);
    const tabs = $$(root, '[role="tab"]');
    tabs[0].focus();
    t.key(tabs[0], 'ArrowRight');
    t.check('→ in the step tabs chooses the next tab', [editor.selected, document.activeElement?.textContent], ['intake', 'This intake only']);
    t.key(document.activeElement, 'Enter');
    t.ok('Enter on a tab opens its settings', $(root, '.twm-flow-panel').contains(document.activeElement));
    window.removeEventListener('keydown', onWindow);
    editor.destroy();
}

t.section('§10 the providers — and the newest answer wins');
{
    const clock = manualClock();
    const calls = [];
    const dcalls = [];
    const preview = (q) => new Promise((resolve, reject) => calls.push({ q, resolve, reject }));
    const describe = (q) => new Promise((resolve) => dcalls.push({ q, resolve }));
    const { editor, root } = mount({ clock, preview, describe });
    clock.advance(0);
    t.check('after load: one request each, for the whole flow', [calls.length, dcalls.length, calls[0].q.text], [1, 1, serialisePipeline(MOCK_PIPELINE)]);
    t.check('…carrying the parameters and a signal', [calls[0].q.parameters, typeof calls[0].q.signal.aborted], [{ intake: { type: 'text', default: '2027' } }, 'boolean']);
    t.check('while it is out, a card says so', $(cardOf(root, 'join'), '.twm-flow-lanes__line').textContent, '…');
    calls[0].resolve(MOCK_PREVIEW);
    dcalls[0].resolve(MOCK_DESCRIBE);
    await flush();
    const line = (id) => [$(cardOf(root, id), '.twm-flow-lanes__line').textContent, [...$(cardOf(root, id), '.twm-flow-lanes__line').classList].pop()];
    t.check('each card\'s count, in its tone', ['src', 'intake', 'prog', 'sink'].map(line),
            [['1,000 rows', 'twm-flow-lanes__line--ok'], ['318 rows', 'twm-flow-lanes__line--ok'], ['18 rows', 'twm-flow-lanes__line--ok'],
             ['2 rejected', 'twm-flow-lanes__line--warning']]);
    t.check('the card\'s name carries its count', buttonOf(root, 'join').getAttribute('aria-label'), 'Join: Add the programme, 318 rows');
    editor.select('join');
    t.check('the dock: Preview and Columns for a step', $$(root, '.twm-flow-lanes__datatab').map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
            [['Preview', 'true'], ['Columns · 12', 'false']]);
    t.check('the provider\'s caption', $(root, '.twm-flow-lanes__caption').textContent,
            'First 6 of 318 rows. Three columns arrive from the Programmes lane; its Code is dropped.');
    const table = $(root, '.twm-flow-lanes__table');
    t.check('the rows are a FlexDesk DataTable — every one of them', [$$(table, 'tbody tr').length, $$(table, 'thead th').length], [6, 12]);
    t.ok('…the columns the description marks new are marked', $$(table, 'td.twm-flow-lanes__cell--new').length === 18);
    t.check('the state: preview on, 800 ms', $(root, '.twm-flow-lanes__datastate').textContent, 'Preview on · refreshed 800 ms after your last change');
    $$(root, '.twm-flow-lanes__datatab')[1].focus();
    t.press($$(root, '.twm-flow-lanes__datatab')[1]);
    t.check('Columns: from the description, with where each comes from', [$(root, '.twm-flow-lanes__caption').textContent,
            $$(root, '.twm-flow-lanes__column').length, $$(root, '.twm-flow-lanes__column')[9].textContent],
            ['12 columns, from the step’s description — no run needed.', 12, 'Programmetext · newfrom Programmes']);
    t.check('the Columns tab keeps the focus across its own redraw', document.activeElement?.dataset?.data ?? document.activeElement?.tagName, 'columns');
    editor.select('sink');
    t.check('a sink adds Would be rejected', $$(root, '.twm-flow-lanes__datatab').map((b) => b.textContent),
            ['Preview', 'Columns · 7', 'Would be rejected · 2']);
    t.press($$(root, '.twm-flow-lanes__datatab')[2]);
    t.check('…each reject with its reason', $$(root, '.twm-flow-lanes__reject').map((r) => r.textContent),
            ['APP-1042Jonas PetitProgramme: “Robotics MSc” is not one of the column’s choices.',
             'APP-1046Wei ZhangProgramme: “Robotics MSc” is not one of the column’s choices.']);
    editor.select('rename');
    t.check('an upstream-columns widget reads the step\'s INPUT columns (the description of the step before it)',
            $$(root, '[data-field="keep"] .twm-flow-chip, [data-field="keep"] [role="checkbox"], [data-field="keep"] button')
                .map((b) => b.textContent).filter(Boolean).slice(0, 3), ['application_id', 'first_name', 'last_name']);
    t.check('editor.inputColumns says the same', editor.inputColumns('rename').length, 13);

    // ── OUT OF ORDER ────────────────────────────────────────────────
    editor.select('src');
    t.typeInto($(root, '[data-field="dataset"] input'), 'public.a');
    clock.advance(800);
    const slow = calls.at(-1);
    t.typeInto($(root, '[data-field="dataset"] input'), 'public.b');
    t.check('a newer edit aborts the request in flight', slow.q.signal.aborted, true);
    clock.advance(800);
    const fast = calls.at(-1);
    t.ok('…and a new one is sent, with a later sequence number', fast !== slow && fast.q.seq > slow.q.seq);
    const answer = (rows) => ({ nodes: { ...MOCK_PREVIEW.nodes, src: { ...MOCK_PREVIEW.nodes.src, rows } } });
    fast.resolve(answer(42));
    await flush();
    t.check('the newest answers first and is drawn', $(cardOf(root, 'src'), '.twm-flow-lanes__line').textContent, '42 rows');
    slow.resolve(answer(999));
    await flush();
    t.check('THE STALE ANSWER ARRIVES LATE AND IS DROPPED', $(cardOf(root, 'src'), '.twm-flow-lanes__line').textContent, '42 rows');

    // ── a failure ─────────────────────────────────────────────────
    t.typeInto($(root, '[data-field="dataset"] input'), 'public.c');
    clock.advance(800);
    calls.at(-1).reject(new Error('The system did not answer: connection refused.'));
    await flush();
    t.check('a failure is the provider\'s sentence, in the dock', $(root, '.twm-flow-lanes__error').textContent, 'The system did not answer: connection refused.');
    t.check('…and changes nothing else: the cards keep the last answer', $(cardOf(root, 'src'), '.twm-flow-lanes__line').textContent, '42 rows');
    editor.destroy();
}

t.section('§11 Steps show: the last run');
{
    let asked = 0;
    const shows = [];
    const { editor, root } = mount({ lastRun: async () => { asked += 1; return MOCK_RUN; }, onStepsShow: (m) => shows.push(m) });
    t.press($$(root, '.twm-flow-lanes__show-btn')[1]);
    await flush();
    t.check('The last run, pressed; the consumer asked once', [$$(root, '.twm-flow-lanes__show-btn')[1].getAttribute('aria-pressed'), asked, shows], ['true', 1, ['run']]);
    const line = (id) => [$(cardOf(root, id), '.twm-flow-lanes__line').textContent, [...$(cardOf(root, id), '.twm-flow-lanes__line').classList].pop()];
    t.check('each card says what the run did, in the consumer\'s words and tones', ['src', 'prog', 'sink'].map(line),
            [['1,284 · 2.1 s', 'twm-flow-lanes__line--ok'], ['18 · cached', 'twm-flow-lanes__line--muted'], ['409 · 3 rejected', 'twm-flow-lanes__line--warning']]);
    t.check('…under the consumer\'s banner', $(root, '.twm-flow-lanes__banner').textContent, 'Drawn on version 2, the version the last run used.');
    t.press($$(root, '.twm-flow-lanes__show-btn')[0]);
    t.press($$(root, '.twm-flow-lanes__show-btn')[1]);
    await flush();
    t.check('flipping back and forth asks no more', asked, 1);
    editor.setRunOverlay(null);
    t.check('no run: each card says so', $(cardOf(root, 'src'), '.twm-flow-lanes__line').textContent, 'No run to show');
    editor.destroy();
}

t.section('§12 findings');
{
    const { editor, root } = mount();
    editor.setFindings([{ code: 'required', node_id: 'join', field: 'how', message: 'Keep needs a value.', severity: 'error' },
                        { code: 'unused', message: 'The parameter region is never read.', severity: 'warning' }]);
    t.check('on the card: its status line is the message, in the error tone', [cardOf(root, 'join').classList.contains('twm-flow-lanes__node--error'),
            $(cardOf(root, 'join'), '.twm-flow-lanes__line').textContent, [...$(cardOf(root, 'join'), '.twm-flow-lanes__line').classList].pop()],
            [true, 'Keep needs a value.', 'twm-flow-lanes__line--error']);
    const strip = $(root, '.twm-flow-strip');
    t.check('in the strip: both, each with Go to it', [strip.hidden, $$(strip, '.twm-flow-strip__line').length, $(strip, '.twm-flow-strip__title').textContent],
            [false, 2, '1 thing to fix before this can be published.']);
    t.press($(strip, '.twm-flow-strip__go'));
    t.check('Go to it chooses the step and focuses the field', [editor.selected, document.activeElement?.closest('[data-field]')?.dataset.field], ['join', 'how']);
    t.ok('…where the finding is drawn under it', $(root, '[data-field="how"] .twm-flow-field__error').textContent.includes('Keep needs a value.'));
    editor.setFindings([]);
    t.check('cleared', [cardOf(root, 'join').classList.contains('twm-flow-lanes__node--error'), $(root, '.twm-flow-strip').hidden], [false, true]);
    editor.destroy();
}

t.section('§13 read only');
{
    const { editor, root, changes } = mount();
    editor.setReadOnly({ reason: 'A published version is read only.' });
    t.check('the reason, on the screen', $(root, '.twm-flow-lanes__readonly').textContent, 'A published version is read only.');
    t.check('no "+", no Add a source, no Add parameter', [$$(root, '.twm-flow-lanes__add').length, $(root, '.twm-flow-lanes__add-source').hidden,
            $(root, '.twm-flow-lanes__param-add')], [0, true, null]);
    t.key(buttonOf(root, 'src'), 'Delete');
    t.check('Delete removes nothing', editor.getGraph().nodes.length, 7);
    t.check('the panel is read only too', [$(root, '[data-field="dataset"] input').readOnly, $(root, '.twm-flow-panel__action[data-action="remove"]').disabled], [true, true]);
    t.check('nothing was reported', changes.length, 0);
    editor.setReadOnly(false);
    t.check('and back', [$$(root, '.twm-flow-lanes__add').length, $(root, '.twm-flow-lanes__readonly').hidden], [6, true]);

    const bad = { ...MOCK_PIPELINE, connections: [...MOCK_PIPELINE.connections, { id: 'c9', sourceId: 'prog', sourcePort: 'out', targetId: 'tidy', targetPort: 'in' }] };
    editor.load({ graph: bad });
    t.check('a flow that cannot be drawn as lanes opens read only, saying why', $(root, '.twm-flow-lanes__readonly').textContent,
            '‘Tidy names, emails’ takes its lane from two steps at once, so the flow cannot be drawn as lanes.');
    t.check('…drawn as best it can be', $$(root, '.twm-flow-lanes__node').length, 7);
    t.check('…and NEVER repaired: saved as it came', editor.serialise(), serialisePipeline(bad));
    editor.destroy();
}

t.section('§14 compact: the strip');
{
    const host = t.host();
    const strip = createLaneEditor(host, { catalogue, compact: true });
    strip.load({ graph: MOCK_PIPELINE });
    const root = strip.el;
    t.check('compact, at the strip\'s size', [root.classList.contains('twm-flow-lanes--compact'), root.classList.contains('twm-flow-lanes--strip')], [true, true]);
    t.check('no toolbar, tabs, dock, parameters or Add a source',
            ['.twm-flow-lanes__toolbar', '[role="tablist"]', '.twm-flow-lanes__dock', '.twm-flow-lanes__params', '.twm-flow-lanes__add-source'].map((s) => $(root, s)),
            [null, null, null, null, null]);
    t.check('nothing to press', $$(root, 'button, input, select, textarea, [tabindex]').length, 0);
    t.check('each card a picture named for its step', $$(root, '.twm-flow-lanes__node').map((n) => [n.getAttribute('role'), n.getAttribute('aria-label')]).slice(2, 4),
            [['img', 'Join: Add the programme'], ['img', 'Add columns: Tidy names, emails']]);
    t.check('placed at the strip\'s 92 × 26, 102 apart', [cardOf(root, 'intake').style.left, cardOf(root, 'prog').style.left,
            $$(root, '.twm-flow-lanes__lane')[1].style.top], ['102px', '102px', '40px']);
    t.check('the wires, and no port dot', [$$(root, '.twm-flow-lanes__wire').length, $$(root, '.twm-flow-lanes__port').length], [6, 0]);
    t.check('read only, whatever it is told', strip.readOnly, true);
    strip.destroy();
}

t.section('§15 parameters');
{
    const { editor, root, changes } = mount();
    t.press($(root, '.twm-flow-lanes__param-add'));
    let form = kit.openFlowPopover();
    t.check('Add parameter: a form in the kit\'s popover, the name focused', [form.getAttribute('aria-label'),
            document.activeElement === $(form, '[data-field="name"]')], ['Add parameter', true]);
    $(form, '[data-field="name"]').value = '2region';
    form.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    t.check('a name a reference cannot spell is refused, in words, the form kept open',
            [$(form, '.twm-flow-lanes__form-refusal').textContent, kit.openFlowPopover() === form],
            ['A name starts with a letter or _ and goes on with letters, digits or _.', true]);
    $(form, '[data-field="name"]').value = 'intake';
    form.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    t.check('…and a name already taken', $(form, '.twm-flow-lanes__form-refusal').textContent, 'There is already a parameter called intake.');
    $(form, '[data-field="name"]').value = 'year';
    t.change($(form, '[data-field="type"]'), 'integer');
    $(form, '[data-field="default"]').value = '20.5';
    form.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    t.check('an integer default must be a whole number', $(form, '.twm-flow-lanes__form-refusal').textContent, 'The default must be a whole number.');
    $(form, '[data-field="default"]').value = '2027';
    form.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    t.check('saved: the parameter, typed', editor.getGraph().parameters.year, { type: 'integer', default: 2027 });
    t.check('…a chip for it, which has the focus', [$$(root, '.twm-flow-lanes__param').map((p) => p.dataset.parameter), document.activeElement?.dataset.parameter],
            [['intake', 'year'], 'year']);
    t.check('…flow:parameter:add', changes.at(-1).action, 'flow:parameter:add');
    t.press($$(root, '.twm-flow-lanes__param')[0]);
    form = kit.openFlowPopover();
    t.check('a chip opens its own parameter', [$(form, '[data-field="name"]').value, $(form, '[data-field="default"]').value], ['intake', '2027']);
    $(form, '[data-field="default"]').value = '2028';
    form.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    t.check('changed, in place', [Object.keys(editor.getGraph().parameters), editor.getGraph().parameters.intake.default, changes.at(-1).action],
            [['intake', 'year'], '2028', 'flow:parameter:change']);
    t.press($$(root, '.twm-flow-lanes__param')[1]);
    form = kit.openFlowPopover();
    t.press($$(form, 'button').find((b) => b.textContent === 'Remove parameter'));
    t.check('removed', [Object.keys(editor.getGraph().parameters), changes.at(-1).action], [['intake'], 'flow:parameter:remove']);
    editor.undo();
    editor.undo();
    editor.undo();
    t.check('three undos: back to the mock\'s, byte for byte', editor.serialise(), serialisePipeline(MOCK_PIPELINE));
    editor.destroy();
}

t.section('§16 destroy');
{
    const clock = manualClock();
    let asked = 0;
    const { editor, host } = mount({ clock, preview: () => { asked += 1; return new Promise(() => {}); } });
    t.press($(host, '.twm-flow-lanes__add-source'));
    t.ok('a picker is open', kit.openFlowPopover() !== null);
    editor.destroy();
    t.check('destroyed: the editor and its popover are gone', [host.children.length, kit.openFlowPopover()], [0, null]);
    clock.advance(5000);
    t.check('…and its preview asks nothing', asked, 0);
}

void window;
t.done();
