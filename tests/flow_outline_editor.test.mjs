/**
 * THE OUTLINE EDITOR, MOUNTED (36 §6) — against the kit's real components, in
 * jsdom. What jsdom cannot see (where a row is drawn, a real drag, a real
 * key) is settled in headless Edge by `demo/flow_outline_probe.mjs`.
 *
 *   §1   I2 — a graph opened and saved with no edit is the same text, byte for
 *        byte; loading is a baseline and says nothing through onChange
 *   §2   what is drawn: the flow row, steps, arms in their tones, feet, add
 *        rows, at the depths the tree says — the Main mock's outline
 *   §3   ARIA: a tree of treeitems with levels, a block expanded, an arm a
 *        group labelled by its words, a foot not focusable, one tab stop
 *   §4   a press SELECTS and rebuilds nothing (the node the press went down
 *        on is the node the click lands on); the panel follows
 *   §5   ports drawn as settings: an arm on and off, its exit inside a loop,
 *        the parallel's join — each an operation on the graph, each undoable
 *   §6   a setting and a rename: one row redrawn in place, the action named
 *   §7   "+" and the add rows open the step picker naming where the step
 *        lands; blocks are offered as blocks; a refused entry says why
 *   §8   the step menu: its refusals in their own line, move, wrap, duplicate,
 *        copy and paste, cut, rename, remove
 *   §9   keys on the editor's root — and Ctrl+Z stops there, Backspace is
 *        never the editor's
 *   §10  history: every verb an entry of the closed list; undo and redo put
 *        the bytes back; a refused verb is no entry
 *   §11  findings on the row, under the field and in the strip; Go to it
 *   §12  the run overlay: pills, taken and untaken arms, counts, a banner —
 *        and it rebuilds no field
 *   §13  READ ONLY: a graph that is not block-shaped is refused with its
 *        sentence, listed in run order, and never written; a consumer's
 *        read-only stops every verb
 *   §14  folding and find
 *   §15  the grip drag: pointer events and a ghost after 4 px, a drop line
 *        naming the place or the refusal; never draggable, never captured
 *   §16  Insert a value is asked with the steps that always run before,
 *        and the arms the step is inside — a step's error arm by its port
 *   §17  destroy leaves nothing behind
 *
 *     node tests/flow_outline_editor.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow outline — the editor');
const { BLOCKS, catalogue, entry } = await import('./flow_outline_fixtures.mjs');
const kit = await import('../src/flow/kit/index.js');
const outline = await import('../src/flow/outline/index.js');
const { createOutlineEditor, OUTLINE_ACTIONS, OUTLINE_INDENT } = outline;
const { document, window } = t;

const cat = catalogue();
const nodesRef = kit.createReferenceSyntax({ name: 'template', pattern: kit.TEMPLATE_REFERENCES.pattern,
                                             format: kit.TEMPLATE_REFERENCES.format, stepScope: 'nodes' });
const formulaRef = kit.createReferenceSyntax({ name: 'formula', pattern: kit.FORMULA_REFERENCES.pattern,
                                               format: kit.FORMULA_REFERENCES.format, stepScope: 'nodes' });
const SYNC = entry('sync-applications').graph;

// A fake layout: every row drawn is 40px under the one before, in document order.
const ROW_H = 40;
let layoutHost = null;
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height,
                                              x: left, y: top, toJSON() {} });
const shownRows = () => [...(layoutHost?.querySelectorAll('.twm-flow-outline__row') || [])]
    .filter((r) => !r.closest('[hidden]'));
const realRect = window.HTMLElement.prototype.getBoundingClientRect;
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (layoutHost && layoutHost.contains(this)) {
        if (this.classList.contains('twm-flow-outline__row')) {
            const i = shownRows().indexOf(this);
            return rect(0, i * ROW_H, 440, ROW_H);
        }
        if (this.classList.contains('twm-flow-outline__tree')) return rect(0, 0, 440, 2000);
    }
    return realRect.call(this);
};
let captures = 0;
window.HTMLElement.prototype.setPointerCapture = () => { captures += 1; };

function mount(graph = SYNC, opts = {}) {
    const host = t.host();
    const log = { changes: [], selects: [], folds: [], values: [] };
    const ed = createOutlineEditor(host, {
        catalogue: cat, widgets: kit.createWidgetRegistry(), blocks: BLOCKS,
        references: { template: nodesRef, formula: formulaRef },
        values: async (q) => { log.values.push(q); return { groups: [{ id: 'g', label: 'G', items: [{ label: 'x', ref: '${x}' }] }] }; },
        summarise: (n, type) => (n.type === 'start' ? 'Run or the API'
            : n.type === 'condition' ? { text: n.config.expression, mono: true } : `${type?.label ?? n.type} summary`),
        summariseReads: (n) => `Later steps read it as \${nodes.${n.id}.…}`,
        onChange: (c) => log.changes.push(c), onSelect: (s) => log.selects.push(s),
        onFoldChange: (f) => log.folds.push(f), ...opts,
    });
    if (graph) ed.load({ graph: structuredClone(graph) });
    const item = (id) => host.querySelector(`[role="treeitem"][data-step="${id}"]`);
    const row = (id) => item(id)?.querySelector(':scope > .twm-flow-outline__row');
    return { ed, host, log, root: ed.el, item, row, panel: () => host.querySelector('.twm-flow-panel') };
}

/** The drawn outline: `kind[tone] text @depth`, one line a row, hidden rows left out. */
function drawn(host) {
    return [...host.querySelectorAll('.twm-flow-outline__row')].filter((r) => !r.closest('[hidden]')).map((r) => {
        const kind = ['flow', 'step', 'arm', 'foot', 'add'].find((k) => r.classList.contains(`twm-flow-outline__row--${k}`));
        const tone = ['then', 'else', 'fail'].find((k) => r.classList.contains(`twm-flow-outline__row--${k}`));
        const text = r.querySelector('.twm-flow-outline__title, .twm-flow-outline__arm-label, .twm-flow-outline__foot-label, '
                                     + '.twm-flow-outline__add-label')?.textContent ?? '';
        return `${kind}${tone ? `[${tone}]` : ''} ${text} @${r.style.getPropertyValue('--twm-outline-depth')}`;
    });
}
const serial = (g) => kit.serialise(g);
const conns = (g) => g.connections.map((c) => `${c.source}.${c.sourcePort}>${c.target}.${c.targetPort}`).sort();
const popover = () => kit.openFlowPopover();
const optionFor = (id) => popover()?.querySelector(`[role="option"][data-entry="${id}"]`);
const menuItem = (id) => popover()?.querySelector(`[role="menuitem"][data-item="${id}"]`);

// ═════════════════════════════════════════════════════════════════════════
t.section('§1 I2 — opened and saved with no edit, the same text');
for (const name of ['sync-applications', 'enrolment-health', 'failing-grades', 'close-applications',
                    'withdrawn-still-enrolled', 'nested-loops', 'data-line-kept']) {
    const g = entry(name).graph;
    const m = mount(g);
    t.check(`${name}: serialise(getGraph()) is the text it was loaded from`, m.ed.serialise(), serial(g));
    t.ok(`${name}: the connections are in the order they were drawn`,
         JSON.stringify(m.ed.getGraph().connections) === JSON.stringify(structuredClone(g).connections));
    t.ok(`${name}: opens editable`, m.ed.refusal === null && !m.root.classList.contains('twm-flow-outline--readonly'));
    t.check(`${name}: loading says nothing through onChange`, m.log.changes.length, 0);
    t.ok(`${name}: and leaves nothing to undo`, !m.ed.history.canUndo);
    m.ed.destroy();
}
{
    // Selecting, folding and opening every panel is no edit either.
    const m = mount();
    for (const n of SYNC.nodes) m.ed.select(n.id);
    m.ed.setFolds(['each', 'anynew']);
    m.ed.setFolds([]);
    m.ed.select('flow');
    t.check('selecting every step and folding is no edit', m.ed.serialise(), serial(SYNC));
    t.check('…and nothing was emitted', m.log.changes.length, 0);
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§2 what is drawn — the Main mock\'s outline');
{
    const m = mount();
    t.check('the rows, their tones and their depths', drawn(m.host), [
        'flow When it runs @0',
        'step Fetch new applications @0',
        'arm[fail] If the request fails @1',
        'step Stop: the portal is down @1',
        'step Save the applications @0',
        'step Anything new? @0',
        'arm[then] Then @1',
        'step For each new application @1',
        'step Check eligibility @2',
        'arm[fail] If the request fails @3',
        'step Note it and move on @3',
        'foot Go on with the next row @3',
        'step Send the invitation @2',
        'add Add a step to the loop @2',
        'foot Next row @2',
        'step At the same time @1',
        'arm Branch 1 @2',
        'step Tell admissions @2',
        'arm Branch 2 @2',
        'step Write a summary @2',
        'add Add a branch @2',
        'foot Then wait for every branch @2',
        'step Finish @1',
        'arm[else] Otherwise @1',
        'step Stop: nothing new @1',
    ]);
    t.check('an arm left unconnected is drawn as nothing (Send the invitation\'s error port)',
            m.item('invite').querySelector('.twm-flow-outline__inside'), null);
    t.ok('no top-level add row where the end of the top level is the end of Then',
         !drawn(m.host).some((l) => l.startsWith('add Add a step @0')));
    t.check('the count says the steps, not the Start or the Merge', m.host.querySelector('.twm-flow-outline__count').textContent,
            '13 steps');
    const fetchRow = m.row('fetch');
    t.check('a step row: its title, its type, its summary',
            [fetchRow.querySelector('.twm-flow-outline__title').textContent, fetchRow.querySelector('.twm-flow-outline__type').textContent,
             fetchRow.querySelector('.twm-flow-outline__summary').textContent],
            ['Fetch new applications', 'HTTP request', 'HTTP request summary']);
    t.ok('…its chip in its category\'s tone', fetchRow.querySelector('.twm-flow-outline__chip--amber'));
    t.ok('…a grip, a fold for a block, a menu', fetchRow.querySelector('.twm-flow-outline__grip')
         && fetchRow.querySelector('.twm-flow-outline__fold') && fetchRow.querySelector('.twm-flow-outline__menu'));
    t.ok('a step with nothing inside has no fold', !m.row('save').querySelector('.twm-flow-outline__fold')
         && m.row('save').querySelector('.twm-flow-outline__fold-space'));
    t.check('a summary that is code is drawn in the code face', [m.row('anynew').querySelector('.twm-flow-outline__summary').textContent,
            m.row('anynew').querySelector('.twm-flow-outline__summary--mono') !== null], ['[nodes.save.inserted] > 0', true]);
    t.check('the flow row carries the start step\'s summary', m.host.querySelector('.twm-flow-outline__row--flow .twm-flow-outline__summary').textContent,
            'Run or the API');
    t.check('depth is indentation: the stylesheet\'s 22px is OUTLINE_INDENT', OUTLINE_INDENT, 22);
    t.check('guides: one per level', m.row('checkfail').querySelectorAll('.twm-flow-outline__guide').length, 3);
    t.check('the keys line', m.host.querySelector('.twm-flow-outline__keys').textContent,
            'Alt+↑ ↓ moves a step · Ctrl+D duplicates · Del removes · Ctrl+Z undoes');
    m.ed.destroy();
}
{
    // An empty flow: the flow row and one add row.
    const m = mount(entry('empty-flow').graph);
    t.check('an empty flow: the flow row and Add a step', drawn(m.host), ['flow When it runs @0', 'add Add a step @0']);
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§3 ARIA');
{
    const m = mount();
    const tree = m.host.querySelector('[role="tree"]');
    t.ok('the outline is a tree', tree && tree.getAttribute('aria-label'));
    t.check('a top-level step is level 1 and the loop\'s body level 3',
            [m.item('fetch').getAttribute('aria-level'), m.item('check').getAttribute('aria-level')], ['1', '3']);
    t.check('a block says it is expanded; a plain step says nothing',
            [m.item('each').getAttribute('aria-expanded'), m.item('save').hasAttribute('aria-expanded')], ['true', false]);
    const arm = m.item('fetch').querySelector('[role="group"]');
    t.check('an arm is a group labelled by its words',
            document.getElementById(arm.getAttribute('aria-labelledby'))?.textContent, 'If the request fails');
    t.ok('a foot is not focusable (the only control on one is the "+" after its block)',
         [...m.host.querySelectorAll('.twm-flow-outline__row--foot')]
             .every((f) => !f.hasAttribute('tabindex') && [...f.querySelectorAll('button')]
                 .every((b) => b.classList.contains('twm-flow-outline__gap'))));
    const stops = [...m.host.querySelectorAll('[role="treeitem"]')].filter((x) => x.tabIndex === 0);
    t.check('one treeitem is a tab stop: the selection (the flow row)', stops.map((x) => x.dataset.step ?? 'flow'), ['flow']);
    t.ok('the selected treeitem is aria-selected', m.host.querySelector('[data-flow]').getAttribute('aria-selected') === 'true');
    t.ok('the panel is a region named Settings', m.panel().getAttribute('role') === 'region'
         && m.panel().getAttribute('aria-label') === 'Settings');
    t.ok('the strip is polite', m.host.querySelector('.twm-flow-strip').getAttribute('aria-live') === 'polite');
    m.ed.select('save');
    const own = m.row('save');
    t.check('the selected row\'s menu and "+" are its tab stops',
            [own.querySelector('.twm-flow-outline__menu').tabIndex, own.querySelector('.twm-flow-outline__gap')?.tabIndex],
            [0, 0]);
    t.check('another row\'s are not', m.row('fetch').querySelector('.twm-flow-outline__menu').tabIndex, -1);
    m.ed.select('check');
    const stopsOfCheck = [...m.item('check').querySelectorAll('.twm-flow-outline__gap')]
        .filter((b) => b.closest('[role="treeitem"]') === m.item('check'));
    t.ok('a block\'s "+" on its arm row and after its last row are its tab stops too',
         stopsOfCheck.length === 2 && stopsOfCheck.every((b) => b.tabIndex === 0));
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§4 a press selects and rebuilds nothing');
{
    const m = mount();
    const before = m.row('check');
    const words = before.querySelector('.twm-flow-outline__words');
    t.press(words);
    t.ok('the row the press went down on is still in the document', before.isConnected && m.row('check') === before);
    t.ok('it is selected', m.item('check').getAttribute('aria-selected') === 'true'
         && before.classList.contains('twm-flow-outline__row--selected'));
    t.check('onSelect was told', m.log.selects.at(-1), { kind: 'step', id: 'check' });
    t.ok('focus is on its treeitem', document.activeElement === m.item('check'));
    const title = m.panel().querySelector('[data-twm-flow-title]');
    t.check('the panel shows its settings: the name', title?.value, 'Check eligibility');
    t.check('…where it is', m.panel().querySelector('.twm-flow-panel__where').textContent,
            'Inside Anything new? › Then › For each new application');
    t.check('…and how later steps read it', m.panel().querySelector('.twm-flow-panel__id').textContent,
            'Later steps read it as ${nodes.check.…}');
    t.press(m.host.querySelector('.twm-flow-outline__row--flow'));
    t.check('the flow row selects the flow', m.log.selects.at(-1), { kind: 'flow', id: null });
    t.ok('…and the panel shows the flow (no title to rename)', !m.panel().querySelector('[data-twm-flow-title]'));
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§5 ports drawn as settings');
{
    const m = mount();
    m.ed.select('check');
    const field = () => m.panel().querySelector('[data-field="__arm:error"]');
    t.ok('the error arm is a choice field', field());
    const radios = () => [...field().querySelectorAll('input[type="radio"]')];
    const choices = (box) => [...box.querySelectorAll('.twm-flow-choice__label')].map((l) => l.textContent);
    t.check('…its two choices in the mapping\'s words', choices(field()),
            ['Fail the run', 'Run the steps under “If the request fails”']);
    t.ok('…the connected one chosen', radios()[1].checked);
    const exit = m.panel().querySelector('[data-field="__exit:error"]');
    t.ok('inside a loop, where the arm goes after its steps is a setting too', exit);
    t.check('…carry on with the next step, or go on with the next row', choices(exit),
            ['Carry on with “Send the invitation”', 'Go on with the next row']);
    radios()[0].checked = true;
    t.fire(radios()[0], 'change');
    let g = m.ed.getGraph();
    t.ok('"Fail the run": the port is unconnected and its steps are gone',
         !g.connections.some((c) => c.source === 'check' && c.sourcePort === 'error') && !g.nodes.some((n) => n.id === 'checkfail'));
    t.check('…recorded as flow:arm', m.log.changes.at(-1)?.action, 'flow:arm');
    t.check('…and the outline no longer draws the arm', m.item('check').querySelector('.twm-flow-outline__inside'), null);
    m.ed.undo();
    g = m.ed.getGraph();
    t.ok('undo puts the arm and its step back', g.nodes.some((n) => n.id === 'checkfail'));
    t.check('…byte for byte', m.ed.serialise(), serial(SYNC));

    // The arm's exit: go on with the next row → carry on with Send the invitation.
    m.ed.select('check');
    const exitRadios = [...m.panel().querySelectorAll('[data-field="__exit:error"] input[type="radio"]')];
    exitRadios[0].checked = true;
    t.fire(exitRadios[0], 'change');
    g = m.ed.getGraph();
    t.ok('"Carry on": the arm\'s last step goes to Send the invitation instead of the next row',
         g.connections.some((c) => c.source === 'checkfail' && c.target === 'invite')
         && !g.connections.some((c) => c.source === 'checkfail' && c.target === 'each'));
    t.ok('…and the foot "Go on with the next row" is gone', !drawn(m.host).includes('foot Go on with the next row @3'));
    m.ed.undo();

    // The parallel's join, written to its merge step.
    m.ed.select('report');
    const join = m.panel().querySelector('[data-field="__join"]');
    t.check('the parallel carries its join\'s setting', choices(join),
            ['Wait for every branch', 'Go on when the first one finishes']);
    const any = join.querySelectorAll('input[type="radio"]')[1];
    any.checked = true;
    t.fire(any, 'change');
    t.check('…written to the merge step\'s config', m.ed.getGraph().nodes.find((n) => n.id === 'merged').config.join, 'any');
    t.ok('…and the foot says so', drawn(m.host).includes('foot Then go on when the first finishes @2'));
    m.ed.undo();
    t.check('undone', m.ed.serialise(), serial(SYNC));

    // An empty port: Read rows' "No rows" — off by default, its meaning "stop".
    const r = mount(entry('withdrawn-still-enrolled').graph);
    const reader = r.ed.getGraph().nodes.find((n) => n.type === 'table-read')?.id;
    r.ed.select(reader);
    const empty = r.panel().querySelector('[data-field="__arm:empty"]');
    t.check('an empty port\'s setting reads Stop here / Run the steps under …',
            [...empty.querySelectorAll('.twm-flow-choice__label')].map((l) => l.textContent),
            ['Stop here', 'Run the steps under “If there are no rows”']);
    r.ed.destroy();
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§6 a setting and a rename');
{
    const m = mount();
    m.ed.select('save');
    const otherRow = m.row('fetch');
    const table = m.panel().querySelector('[data-field="table"] input');
    table.focus();
    t.typeInto(table, 'Applicants');
    t.check('a setting is flow:step:config', m.log.changes.at(-1)?.action, 'flow:step:config');
    t.check('…written to the step\'s config', m.ed.getGraph().nodes.find((n) => n.id === 'save').config.table, 'Applicants');
    t.ok('…and no other row was rebuilt', otherRow.isConnected);
    t.ok('…the field keeps the focus', document.activeElement === table || m.panel().contains(document.activeElement));
    const title = m.panel().querySelector('[data-twm-flow-title]');
    title.focus();
    t.typeInto(title, 'Keep the applications');
    t.check('a rename is flow:step:label', m.log.changes.at(-1)?.action, 'flow:step:label');
    t.check('…and the row says the new name', m.row('save').querySelector('.twm-flow-outline__title').textContent,
            'Keep the applications');
    t.ok('…while the title keeps the focus', document.activeElement === title);
    t.typeInto(title, '');
    t.ok('an emptied name removes the label (the type\'s name is drawn)',
         !('label' in m.ed.getGraph().nodes.find((n) => n.id === 'save'))
         && m.row('save').querySelector('.twm-flow-outline__title').textContent === 'Insert or update rows');
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§7 "+" and the step picker');
{
    const m = mount();
    const gapAt = (anchor) => m.host.querySelector(`.twm-flow-outline__gap[data-gap='${JSON.stringify(anchor)}']`);
    const plus = gapAt({ before: 'invite' });
    t.ok('a "+" sits on the last row before the place it adds to (here the foot of Check eligibility\'s arm)',
         plus && plus.parentElement.classList.contains('twm-flow-outline__row--foot'));
    t.check('…named by where the step lands', plus.getAttribute('aria-label'),
            'Add a step here — inside Anything new? › Then › For each new application, after Check eligibility');
    t.press(plus);
    await t.tick();
    const pop = popover();
    t.ok('the step picker opens', pop && pop.querySelector('.twm-flow-picker'));
    t.check('…saying where the step lands', pop.querySelector('.twm-flow-picker__where').textContent,
            'inside Anything new? › Then › For each new application, after Check eligibility');
    const labels = [...pop.querySelectorAll('.twm-flow-picker__group')][0].querySelectorAll('.twm-flow-picker__label');
    t.check('the Flow group offers the blocks by their entries, then End',
            [...labels].map((l) => l.firstChild.textContent),
            ['If … otherwise', 'For each row', 'At the same time', 'End the run']);
    t.ok('no Start and no Merge are offered', !optionFor('start') && !optionFor('merge'));
    t.check('an End where a step follows is refused, with why', optionFor('end').querySelector('.twm-flow-picker__refusal')
        ?.textContent, '‘End’ ends the run, so it can only be the last step here.');
    t.check('…its words the mapping\'s, its sub the type\'s', optionFor('end').querySelector('.twm-flow-picker__sub').textContent.trim(), 'End');
    t.check('a type the consumer marked unavailable is refused with its sentence',
            optionFor('send-email').querySelector('.twm-flow-picker__refusal').textContent, 'Sending email is not built yet.');
    t.press(optionFor('log'));
    await t.tick();
    let g = m.ed.getGraph();
    t.ok('the step lands after Check eligibility, before Send the invitation',
         g.connections.some((c) => c.source === 'check' && c.sourcePort === 'out' && c.target === 'log')
         && g.connections.some((c) => c.source === 'log' && c.target === 'invite'));
    t.check('…recorded as flow:step:add', m.log.changes.at(-1)?.action, 'flow:step:add');
    t.check('…and is selected', m.ed.selection, { kind: 'step', id: 'log' });
    t.check('…at (0, 0)', g.nodes.find((n) => n.id === 'log').position, { x: 0, y: 0 });
    t.ok('focus came back to the "+"', document.activeElement === plus || m.host.contains(document.activeElement));

    // A block arrives with its arms empty, straight to what follows.
    const plus2 = m.row('save').querySelector(':scope > .twm-flow-outline__gap');
    t.press(plus2);
    await t.tick();
    t.press(optionFor('condition'));
    await t.tick();
    g = m.ed.getGraph();
    t.check('"If … otherwise" writes a Condition with both arms going on to Anything new?',
            g.connections.filter((c) => c.source === 'condition').map((c) => `${c.sourcePort}>${c.target}`).sort(),
            ['false>anynew', 'true>anynew']);
    t.ok('…drawn as a block with Then and Otherwise', drawn(m.host).includes('arm[then] Then @1')
         && m.item('condition').querySelectorAll('[role="group"]').length === 2);

    // "At the same time" is one entry and two steps.
    const plus3 = gapAt({ before: 'save' });
    t.ok('the "+" after a block is on its last row, at the block\'s own depth',
         plus3.parentElement === m.row('portaldown') && plus3.style.getPropertyValue('--twm-outline-depth') === '0');
    t.press(plus3);
    await t.tick();
    t.check('the "+" after a step with an arm adds after the block', popover().querySelector('.twm-flow-picker__where').textContent,
            'at the top level, after Fetch new applications');
    t.press(optionFor('parallel'));
    await t.tick();
    g = m.ed.getGraph();
    t.ok('"At the same time" writes a Parallel and a Merge', g.nodes.some((n) => n.id === 'parallel')
         && g.nodes.some((n) => n.type === 'merge' && n.id !== 'merged'));
    t.ok('…drawn as ONE block with its wait-for foot', m.item('parallel').querySelector('.twm-flow-outline__row--foot'));

    // The loop's add row; the parallel's Add a branch.
    const addInLoop = [...m.host.querySelectorAll('.twm-flow-outline__add')].find((b) => b.textContent.includes('Add a step to the loop'));
    t.press(addInLoop);
    await t.tick();
    t.check('"Add a step to the loop" lands at the end of the body', popover().querySelector('.twm-flow-picker__where').textContent,
            'inside Anything new? › Then › For each new application, after Send the invitation');
    t.press(optionFor('set-variable'));
    await t.tick();
    g = m.ed.getGraph();
    t.ok('…between Send the invitation and the loop\'s next', g.connections.some((c) => c.source === 'invite' && c.target === 'set-variable')
         && g.connections.some((c) => c.source === 'set-variable' && c.target === 'each' && c.targetPort === 'next'));
    const addBranch = [...m.item('report').querySelectorAll('.twm-flow-outline__add')].find((b) => b.textContent.includes('Add a branch'));
    t.press(addBranch);
    await t.tick();
    t.check('"Add a branch" says what it does', popover().querySelector('.twm-flow-picker__title').textContent, 'Add a branch');
    t.press(optionFor('log'));
    await t.tick();
    t.check('a third branch', m.item('report').querySelectorAll(':scope > .twm-flow-outline__inside > .twm-flow-outline__arm').length, 3);
    const x = m.item('report').querySelectorAll('.twm-flow-outline__arm-remove')[2];
    t.press(x);
    t.check('its × removes it again (flow:branch:remove)', m.log.changes.at(-1)?.action, 'flow:branch:remove');
    t.check('two branches again', m.item('report').querySelectorAll(':scope > .twm-flow-outline__inside > .twm-flow-outline__arm').length, 2);
    // Escape closes the picker and adds nothing.
    const count = m.ed.getGraph().nodes.length;
    t.press(m.row('save').querySelector(':scope > .twm-flow-outline__gap'));
    await t.tick();
    t.key(popover().querySelector('input'), 'Escape');
    await t.tick();
    t.ok('Escape closes the picker and adds nothing', !popover() && m.ed.getGraph().nodes.length === count);
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§8 the step menu');
{
    const m = mount();
    const open = (id) => { t.press(m.row(id).querySelector('.twm-flow-outline__menu')); };
    open('invite');
    t.check('the menu is named by its step', popover().querySelector('[role="menu"]').getAttribute('aria-label'), 'Send the invitation');
    t.check('opening it selects its step', m.ed.selection, { kind: 'step', id: 'invite' });
    t.check('a refused verb says why in its own line', menuItem('down').textContent,
            'Move down — already last in For each new applicationAlt+↓');
    t.ok('…and cannot be chosen', menuItem('down').disabled);
    t.check('Move out names the block', menuItem('out').querySelector('.twm-flow-outline__menu-label').textContent,
            'Move out of For each new application');
    t.ok('the keys are drawn beside each verb', menuItem('duplicate').textContent.endsWith('Ctrl+D'));
    t.ok('nothing copied: Paste after says so', /nothing is copied/.test(menuItem('paste').textContent));
    t.key(menuItem('up'), 'ArrowDown');
    t.ok('↓ steps over the refused line', document.activeElement === menuItem('out'));
    t.press(menuItem('up'));
    let g = m.ed.getGraph();
    t.ok('Move up: Send the invitation now runs before Check eligibility',
         g.connections.some((c) => c.source === 'each' && c.sourcePort === 'body' && c.target === 'invite')
         && g.connections.some((c) => c.source === 'invite' && c.target === 'check'));
    t.check('…recorded as flow:step:move', m.log.changes.at(-1)?.action, 'flow:step:move');
    m.ed.undo();

    open('invite');
    t.press(menuItem('wrap'));
    const sub = popover().querySelector('.twm-flow-outline__menu-sub');
    t.check('Wrap in opens the blocks', [...sub.querySelectorAll('.twm-flow-outline__menu-label')].map((l) => l.textContent),
            ['If … otherwise', 'For each row', 'At the same time']);
    t.press(sub.querySelector('[data-item="wrap:condition"]'));
    g = m.ed.getGraph();
    t.ok('Wrap in If … otherwise: the step is the Then arm of a new Condition',
         g.connections.some((c) => c.source === 'condition' && c.sourcePort === 'true' && c.target === 'invite'));
    t.check('…recorded as flow:step:wrap', m.log.changes.at(-1)?.action, 'flow:step:wrap');
    m.ed.undo();
    t.check('…undone byte for byte', m.ed.serialise(), serial(SYNC));

    open('save');
    t.press(menuItem('duplicate'));
    g = m.ed.getGraph();
    t.ok('Duplicate: a copy right after it, under a new id', g.nodes.some((n) => n.id === 'save-2')
         && g.connections.some((c) => c.source === 'save' && c.target === 'save-2'));
    m.ed.undo();

    open('fetch');
    t.press(menuItem('copy'));
    open('save');
    t.ok('after a copy, Paste after is offered', !menuItem('paste').disabled);
    t.press(menuItem('paste'));
    g = m.ed.getGraph();
    t.ok('Paste after: the copied step and its arm, after Save', g.nodes.some((n) => n.id === 'fetch-2')
         && g.nodes.some((n) => n.id === 'portaldown-2') && g.connections.some((c) => c.source === 'save' && c.target === 'fetch-2'));
    t.ok('…its reference to its own arm\'s step renamed, nothing else',
         g.nodes.find((n) => n.id === 'portaldown-2').config.message.includes('${nodes.fetch-2.error.message}')
         && g.nodes.find((n) => n.id === 'fetch-2').config.url.includes('${input.since}'));
    m.ed.undo();

    open('tell');
    t.press(menuItem('cut'));
    g = m.ed.getGraph();
    t.ok('Cut removes the step', !g.nodes.some((n) => n.id === 'tell'));
    t.check('…as a removal', m.log.changes.at(-1)?.action, 'flow:step:remove');
    open('summary');
    t.press(menuItem('paste'));
    t.ok('…and it pastes after another step', m.ed.getGraph().nodes.some((n) => n.id === 'tell'));
    m.ed.undo();
    m.ed.undo();

    open('save');
    t.press(menuItem('rename'));
    t.ok('Rename puts the focus in the panel\'s title', document.activeElement === m.panel().querySelector('[data-twm-flow-title]'));

    open('anynew');
    t.press(menuItem('remove'));
    g = m.ed.getGraph();
    t.ok('Remove takes a block with everything inside it', !['anynew', 'each', 'check', 'nothing', 'done'].some((id) => g.nodes.some((n) => n.id === id)));
    t.ok('…and what arrived goes on to nothing: Save is the last step', !g.connections.some((c) => c.source === 'save'));
    m.ed.undo();
    t.check('…undone byte for byte', m.ed.serialise(), serial(SYNC));
    open('done');
    t.ok('an End cannot be duplicated, and says why', /Nothing runs after/.test(menuItem('duplicate').textContent));
    t.key(menuItem('up'), 'Escape');
    await t.tick();
    t.ok('Escape closes the menu and gives the focus back to its button', !popover()
         && document.activeElement === m.row('done').querySelector('.twm-flow-outline__menu'));
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§9 keys');
{
    const m = mount();
    let heard = 0;
    const onWin = (ev) => { if (ev.key === 'z' || ev.key === 'y') heard += 1; };
    window.addEventListener('keydown', onWin);
    m.ed.select('save');
    m.ed.focus();
    t.ok('focus() puts the focus on the selection', document.activeElement === m.item('save'));
    t.key(m.item('save'), 'ArrowDown');
    t.check('↓ selects the next row', m.ed.selection.id, 'anynew');
    t.key(m.item('anynew'), 'ArrowUp');
    t.check('↑ the one before', m.ed.selection.id, 'save');
    t.key(m.item('save'), 'ArrowUp', { altKey: true });
    let g = m.ed.getGraph();
    t.ok('Alt+↑ moves the step up', g.connections.some((c) => c.source === 'start' && c.target === 'save'));
    t.ok('…and it is still the selection, with the focus', m.ed.selection.id === 'save' && document.activeElement === m.item('save'));
    t.key(m.item('save'), 'z', { ctrlKey: true });
    t.check('Ctrl+Z undoes it', m.ed.serialise(), serial(SYNC));
    t.check('…and stops at the editor\'s root: the window never heard it', heard, 0);
    t.key(m.item('save'), 'y', { ctrlKey: true });
    t.ok('Ctrl+Y redoes it', m.ed.getGraph().connections.some((c) => c.source === 'start' && c.target === 'save'));
    t.key(m.item('save'), 'z', { ctrlKey: true });
    m.ed.select('invite');
    m.ed.focus();
    t.key(m.item('invite'), 'ArrowLeft', { altKey: true });
    g = m.ed.getGraph();
    t.ok('Alt+← moves it out of the loop, after it', g.connections.some((c) => c.source === 'each' && c.sourcePort === 'done' && c.target === 'invite'));
    t.key(m.item('invite'), 'z', { ctrlKey: true });
    m.ed.select('check');
    m.ed.focus();
    t.key(m.item('check'), 'ArrowLeft', { altKey: true });
    t.check('a step whose arm goes on with the next row cannot leave its loop, and says why',
            m.host.querySelector('.twm-flow-outline__message').textContent,
            '‘Check eligibility’ goes on with the next item of a loop, so it can only go inside one.');
    m.ed.select('save');
    m.ed.focus();
    t.key(m.item('save'), 'd', { ctrlKey: true });
    t.ok('Ctrl+D duplicates', m.ed.getGraph().nodes.some((n) => n.id === 'save-2'));
    t.check('…and selects the copy', m.ed.selection.id, 'save-2');
    t.key(m.item('save-2'), 'Delete');
    t.ok('Delete removes the selection', !m.ed.getGraph().nodes.some((n) => n.id === 'save-2'));
    t.ok('…back to the graph it was loaded from (a line remade is drawn last)', outline.outlineGraphsEqual(m.ed.getGraph(), SYNC));
    m.ed.select('save');
    m.ed.focus();
    t.key(m.item('save'), 'c', { ctrlKey: true });
    m.ed.select('fetch');
    m.ed.focus();
    t.key(m.item('fetch'), 'v', { ctrlKey: true });
    g = m.ed.getGraph();
    t.ok('Ctrl+C then Ctrl+V pastes after the selection',
         g.connections.some((c) => c.source === 'fetch' && c.sourcePort === 'out' && c.target === 'save-2'));
    t.key(m.item('save-2'), 'z', { ctrlKey: true });
    m.ed.select('tell');
    m.ed.focus();
    t.key(m.item('tell'), 'x', { ctrlKey: true });
    t.ok('Ctrl+X cuts', !m.ed.getGraph().nodes.some((n) => n.id === 'tell'));
    m.ed.undo();
    m.ed.select('save');
    m.ed.focus();
    t.key(m.item('save'), 'F2');
    t.ok('F2 renames: the focus is in the title', document.activeElement === m.panel().querySelector('[data-twm-flow-title]'));
    m.ed.focus();
    t.key(m.item('save'), 'Enter');
    t.ok('Enter opens the settings: the focus is in the first field', m.panel().querySelector('.twm-flow-panel__fields')
        .contains(document.activeElement));
    // In a text field, Ctrl+Z is the field's — stopped at the root all the same.
    const changesBefore = m.log.changes.length;
    const input = m.panel().querySelector('[data-field="table"] input');
    input.focus();
    const ev = new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    t.ok('Ctrl+Z in a text field is left to the field (not prevented)', !ev.defaultPrevented);
    t.check('…the editor undid nothing', m.log.changes.length, changesBefore);
    t.check('…and the window never heard it', heard, 0);
    // Backspace is never the editor's.
    m.ed.select('save');
    m.ed.focus();
    const bs = new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    let windowHeardBackspace = false;
    const onBs = (e) => { if (e.key === 'Backspace') windowHeardBackspace = true; };
    window.addEventListener('keydown', onBs);
    m.item('save').dispatchEvent(bs);
    t.ok('Backspace removes nothing', m.ed.getGraph().nodes.some((n) => n.id === 'save'));
    t.ok('…is not prevented, and goes on to the host', !bs.defaultPrevented && windowHeardBackspace);
    window.removeEventListener('keydown', onBs);
    // ← → fold and unfold a block.
    m.ed.select('each');
    m.ed.focus();
    t.key(m.item('each'), 'ArrowLeft');
    t.ok('← folds a block', m.item('each').getAttribute('aria-expanded') === 'false');
    t.check('…and the consumer is told', m.log.folds.at(-1), ['each']);
    t.key(m.item('each'), 'ArrowRight');
    t.ok('→ unfolds it', m.item('each').getAttribute('aria-expanded') === 'true');
    t.key(m.item('each'), 'ArrowRight');
    t.check('→ again steps into it', m.ed.selection.id, 'check');
    t.key(m.item('check'), 'ArrowLeft');
    t.key(m.item('check'), 'ArrowLeft');
    t.check('← from a folded step goes to its parent', m.ed.selection.id, 'each');
    // A refused key verb says why, and changes nothing.
    m.ed.setFolds([]);
    m.ed.select('invite');
    m.ed.focus();
    const n0 = m.log.changes.length;
    t.key(m.item('invite'), 'ArrowDown', { altKey: true });
    t.check('a refused Alt+↓ changes nothing', m.log.changes.length, n0);
    t.check('…and says why under the list', m.host.querySelector('.twm-flow-outline__message').textContent,
            'already last in For each new application');
    window.removeEventListener('keydown', onWin);
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§10 history');
{
    t.check('the closed list is 36 §6.6\'s', [...OUTLINE_ACTIONS], ['flow:step:add', 'flow:step:remove', 'flow:step:move',
        'flow:step:wrap', 'flow:step:duplicate', 'flow:step:paste', 'flow:step:label', 'flow:step:config', 'flow:arm',
        'flow:branch:add', 'flow:branch:remove', 'flow:settings']);
    const m = mount();
    t.check('the editor\'s history uses it', [...m.ed.history.actions], [...OUTLINE_ACTIONS]);
    m.ed.select('save');
    m.ed.focus();
    t.key(m.item('save'), 'ArrowUp', { altKey: true });
    t.key(m.item('save'), 'd', { ctrlKey: true });
    const after = m.ed.serialise();
    t.check('two edits, two entries', m.ed.history.depth, 2);
    m.ed.undo();
    m.ed.undo();
    t.check('undone twice: the loaded bytes', m.ed.serialise(), serial(SYNC));
    t.check('…each undo told the consumer', m.log.changes.slice(-2).map((c) => c.action), ['undo', 'undo']);
    t.check('…with the graph\'s text', m.log.changes.at(-1).text, serial(SYNC));
    m.ed.redo();
    m.ed.redo();
    t.check('redone: the edited bytes', m.ed.serialise(), after);
    // Typing a label is one entry.
    const n = m.ed.history.depth;
    m.ed.select('fetch');
    const title = m.panel().querySelector('[data-twm-flow-title]');
    title.focus();
    for (const s of ['F', 'Fe', 'Fet', 'Fetc']) t.typeInto(title, s);
    t.check('a label typed letter by letter is one entry', m.ed.history.depth, n + 1);
    // A refused verb is no entry.
    m.ed.select('done');
    m.ed.focus();
    const d = m.ed.history.depth;
    t.key(m.item('done'), 'd', { ctrlKey: true });
    t.check('a refused duplicate is no entry', m.ed.history.depth, d);
    // The flow's own settings are flow:settings.
    const fs = mount(SYNC, { flowSettings: { schema: { type: 'object', properties: { name: { type: 'string', title: 'Name' } } },
                                              value: { name: 'A' } } });
    const name = fs.panel().querySelector('[data-field="name"] input');
    t.typeInto(name, 'B');
    t.check('a flow setting is flow:settings', fs.log.changes.at(-1)?.action, 'flow:settings');
    t.check('…and onChange carries the flow settings', fs.log.changes.at(-1)?.flowSettings, { name: 'B' });
    fs.ed.undo();
    t.check('undone', fs.ed.getFlowSettings(), { name: 'A' });
    t.ok('…and the field shows it', fs.panel().querySelector('[data-field="name"] input').value === 'A');
    fs.ed.destroy();
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§11 findings');
{
    const m = mount();
    m.ed.setFindings([
        { code: 'required', message: 'Url needs a value.', severity: 'error', node_id: 'invite', field: 'url' },
        { code: 'slow', message: 'A long timeout holds a worker.', severity: 'warning', node_id: 'check', field: 'timeout_seconds' },
        { code: 'gone', message: 'A step that is not here.', severity: 'error', node_id: 'nobody' },
        { code: 'flow', message: 'The flow has no description.', severity: 'warning' },
    ]);
    const summary = m.row('invite').querySelector('.twm-flow-outline__summary');
    t.check('on the row: the summary line is the message, in the error tone', [summary.textContent,
            summary.classList.contains('twm-flow-outline__summary--error')], ['Url needs a value.', true]);
    t.ok('…and a mark', m.row('invite').querySelector('.twm-flow-outline__badge'));
    t.ok('a warning is drawn in the warning tone', m.row('check').querySelector('.twm-flow-outline__summary--warning'));
    const strip = m.host.querySelector('.twm-flow-strip');
    t.ok('the strip is shown', !strip.hidden);
    t.check('…counting what must be fixed', strip.querySelector('.twm-flow-strip__title').textContent,
            '2 things to fix before this can be published.');
    t.ok('…a finding naming a step the graph no longer has is in the strip', [...strip.querySelectorAll('li')]
        .some((li) => li.textContent.includes('A step that is not here.')));
    t.ok('…the flow\'s own finding on the flow row', m.host.querySelector('.twm-flow-outline__row--flow .twm-flow-outline__badge'));
    const go = [...strip.querySelectorAll('li')].find((li) => li.dataset.node === 'invite').querySelector('button');
    m.ed.setFolds(['each']);
    t.press(go);
    await t.tick();
    t.check('Go to it selects the step', m.ed.selection, { kind: 'step', id: 'invite' });
    t.ok('…unfolding the blocks around it', !m.ed.folds.includes('each') && !m.item('invite').closest('[hidden]'));
    t.ok('…and focuses the field it names', m.panel().querySelector('[data-field="url"]').contains(document.activeElement));
    t.ok('under the field: the message', m.panel().querySelector('[data-field="url"]').textContent.includes('Url needs a value.'));
    m.ed.setFindings([]);
    t.ok('cleared: the strip hides, the summary comes back', strip.hidden
         && m.row('invite').querySelector('.twm-flow-outline__summary').textContent === 'HTTP request summary');
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§12 the run overlay');
{
    const m = mount();
    m.ed.select('save');
    const input = m.panel().querySelector('[data-field="table"] input');
    input.focus();
    m.ed.setRunOverlay({
        banner: 'Drawn on version 4, the version this run used.',
        steps: { fetch: { state: 'completed', line: 'completed · 200' }, portaldown: { state: 'skipped' },
                 anynew: { state: 'completed', line: 'true → Then' }, check: { state: 'completed', line: 'completed ×63' },
                 checkfail: { state: 'completed', line: 'completed ×2', tone: 'warn' }, nothing: { state: 'skipped' },
                 tell: { state: 'failed', line: 'failed · 503' }, merged: { state: 'completed', line: 'both finished' } },
        ports: { fetch: { error: { taken: false } }, anynew: { true: { taken: true }, false: { taken: false } },
                 check: { error: { taken: true, count: 2 } }, each: { next: { count: 63 } } },
    });
    const pill = (id) => m.row(id).querySelector('.twm-flow-outline__run');
    t.check('a step\'s status beside its title, in the consumer\'s words', pill('check').textContent, 'completed ×63');
    t.ok('…toned by its state', pill('fetch').classList.contains('twm-flow-outline__run--ok')
         && pill('tell').classList.contains('twm-flow-outline__run--fail')
         && pill('checkfail').classList.contains('twm-flow-outline__run--warn'));
    t.check('…and the state\'s own word when no line is given', pill('portaldown').textContent, 'skipped');
    const armRow = (id, n = 0) => m.item(id).querySelectorAll(':scope > .twm-flow-outline__inside .twm-flow-outline__row--arm')[n];
    t.check('an untaken arm says so', armRow('fetch').querySelector('.twm-flow-outline__arm-note').textContent, 'not taken');
    t.ok('…and it and its steps are dimmed', armRow('fetch').classList.contains('twm-flow-outline__row--off')
         && m.row('portaldown').classList.contains('twm-flow-outline__row--off'));
    t.check('a taken arm says so', armRow('anynew', 0).querySelector('.twm-flow-outline__arm-note').textContent, 'taken');
    t.check('an arm taken twice counts', armRow('check').querySelector('.twm-flow-outline__arm-note').textContent, '×2');
    const feet = [...m.host.querySelectorAll('.twm-flow-outline__row--foot')];
    t.check('the loop\'s foot counts its rows', feet.find((f) => f.textContent.includes('Next row'))
        .querySelector('.twm-flow-outline__foot-note').textContent, '×63');
    t.check('the parallel\'s foot says how it ended', feet.find((f) => f.textContent.includes('wait for every'))
        .querySelector('.twm-flow-outline__foot-note').textContent, 'both finished');
    t.check('the consumer\'s banner', m.host.querySelector('.twm-flow-outline__banner-text').textContent,
            'Drawn on version 4, the version this run used.');
    t.ok('the overlay rebuilt no field: the one being typed in keeps its control and the focus',
         input.isConnected && document.activeElement === input);
    t.check('…and the graph is untouched', m.ed.serialise(), serial(SYNC));
    m.ed.setRunOverlay(null);
    t.ok('cleared: no pill, no banner', !m.host.querySelector('.twm-flow-outline__run')
         && m.host.querySelector('.twm-flow-outline__banner').hidden);
    // A refresh that arrives while a press is held waits for the click: a
    // browser fires one only when press and release land on the same node.
    const held = m.row('save');
    const ev = (type, target) => target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    ev('pointerdown', held);
    ev('mousedown', held);
    m.ed.setRunOverlay({ steps: { save: { state: 'running', line: 'running' } } });
    t.ok('a run refreshed under a held press rebuilds nothing yet', held.isConnected && !held.querySelector('.twm-flow-outline__run'));
    ev('pointerup', document);
    ev('mouseup', held);
    t.press(held);
    t.check('…so the click lands on the row it went down on', m.ed.selection, { kind: 'step', id: 'save' });
    await t.tick();
    t.check('…and the refresh is drawn straight after', m.row('save').querySelector('.twm-flow-outline__run')?.textContent, 'running');
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§13 read only');
{
    const g = entry('refuse-jump-between-branches').graph;
    const before = serial(g);
    const m = mount(g);
    t.check('a graph that is not block-shaped is refused with its code', m.ed.refusal?.code, 'outline_jump_out');
    t.check('…and its sentence is on the screen', m.host.querySelector('.twm-flow-outline__readonly-text').textContent,
            'This flow is shown as a list in the order it runs, and cannot be edited here: A line from ‘H’ leaves its block for ‘A’.');
    t.ok('…as a flat list: every step at depth 0', drawn(m.host).slice(1).every((l) => l.endsWith('@0')));
    t.check('…in the order it runs', [...m.host.querySelectorAll('[role="treeitem"][data-step]')].map((x) => x.dataset.step),
            outline.outlineFlatOrder(g, cat, BLOCKS).filter((id) => id !== g.nodes.find((n) => n.type === 'start').id));
    t.ok('…with no menu, no "+", no add row and no grip to drag', !m.host.querySelector('.twm-flow-outline__menu, .twm-flow-outline__gap, '
         + '.twm-flow-outline__add') && m.host.querySelector('.twm-flow-outline__grip--off'));
    t.ok('Undo, Fold all are disabled', m.host.querySelector('[data-action="undo"]').disabled
         && [...m.host.querySelectorAll('.twm-flow-outline__fold-all')].every((b) => b.disabled));
    const first = m.host.querySelector('[role="treeitem"][data-step]');
    m.ed.select(first.dataset.step);
    m.ed.focus();
    for (const [k, mod] of [['Delete', {}], ['d', { ctrlKey: true }], ['ArrowUp', { altKey: true }], ['v', { ctrlKey: true }]]) {
        t.key(document.activeElement, k, mod);
    }
    t.check('no key writes anything', m.log.changes.length, 0);
    t.check('getGraph() is the graph as it came', m.ed.serialise(), before);
    t.ok('the panel is read only', [...m.panel().querySelectorAll('input, select, textarea')].every((x) => x.disabled || x.readOnly));
    m.ed.destroy();
}
{
    const m = mount(SYNC, { readOnly: { reason: 'Run 57 is drawn as it ran.' } });
    t.check('a consumer\'s read-only shows its reason', m.host.querySelector('.twm-flow-outline__readonly-text').textContent,
            'Run 57 is drawn as it ran.');
    t.ok('…the outline is drawn as blocks, with nothing to add', drawn(m.host).includes('arm[then] Then @1')
         && !m.host.querySelector('.twm-flow-outline__gap, .twm-flow-outline__add'));
    m.ed.select('save');
    m.ed.focus();
    t.key(m.item('save'), 'Delete');
    t.check('Delete does nothing', m.log.changes.length, 0);
    t.press(m.row('save').querySelector('.twm-flow-outline__menu'));
    t.ok('the menu opens, and every verb says why it is refused', [...popover().querySelectorAll('[role="menuitem"]')]
        .filter((b) => b.dataset.item !== 'copy').every((b) => b.disabled && b.textContent.includes('Run 57 is drawn as it ran.')));
    kit.closeFlowPopovers();
    m.ed.setReadOnly(false);
    t.ok('setReadOnly(false) gives the verbs back', m.host.querySelector('.twm-flow-outline__gap')
         && m.host.querySelector('.twm-flow-outline__readonly').hidden);
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§14 folding and find');
{
    const m = mount(SYNC, { initialFolds: ['check'] });
    t.ok('initialFolds are folded', m.item('check').getAttribute('aria-expanded') === 'false'
         && m.item('checkfail').closest('[hidden]'));
    t.check('a folded block says how many steps it holds', m.row('check').querySelector('.twm-flow-outline__note').textContent,
            '1 step inside');
    t.press(m.row('check').querySelector('.twm-flow-outline__fold'));
    t.ok('its chevron unfolds it', m.item('check').getAttribute('aria-expanded') === 'true');
    t.check('…and the consumer keeps the folds', m.log.folds.at(-1), []);
    t.press([...m.host.querySelectorAll('.twm-flow-outline__fold-all')][0]);
    t.check('Fold all folds every block', [...m.ed.folds].sort(), ['anynew', 'check', 'each', 'fetch', 'report']);
    t.check('…leaving the top level', drawn(m.host), ['flow When it runs @0', 'step Fetch new applications @0',
            'step Save the applications @0', 'step Anything new? @0']);
    t.check('…Anything new? holds ten steps', m.row('anynew').querySelector('.twm-flow-outline__note').textContent, '9 steps inside');
    t.press([...m.host.querySelectorAll('.twm-flow-outline__fold-all')][1]);
    t.check('Unfold all', m.ed.folds, []);
    m.ed.setFolds(['anynew', 'check']);
    m.ed.select('checkfail');
    t.ok('select() unfolds the blocks around the step, so it is on the screen',
         !m.item('checkfail').closest('[hidden]') && m.item('checkfail').getAttribute('aria-selected') === 'true');
    t.check('…and tells the consumer', m.log.folds.at(-1), []);
    const find = m.host.querySelector('.twm-flow-outline__find');
    t.typeInto(find, 'invitation');
    const shown = [...m.host.querySelectorAll('[role="treeitem"][data-step]')].filter((x) => !x.closest('[hidden]'));
    t.check('find shows the match and the blocks around it', shown.map((x) => x.dataset.step), ['anynew', 'each', 'invite']);
    t.ok('…the blocks dimmed as context, the match not', m.item('each').classList.contains('twm-flow-outline__item--context')
         && !m.item('invite').classList.contains('twm-flow-outline__item--context'));
    t.ok('…with no "+" while finding', !m.host.querySelector('.twm-flow-outline__gap'));
    t.key(find, 'Enter');
    t.check('Enter in the box selects the first match', m.ed.selection.id, 'invite');
    t.typeInto(find, 'zebra');
    t.check('nothing found says so', m.host.querySelector('.twm-flow-outline__message').textContent, 'No step matches “zebra”.');
    t.key(find, 'Escape');
    t.ok('Escape clears the box', find.value === '' && drawn(m.host).length > 20);
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§15 the grip drag');
{
    const m = mount();
    layoutHost = m.host;
    let dragstarts = 0;
    document.addEventListener('dragstart', () => { dragstarts += 1; }, true);
    const pointer = (type, target, x, y) => target.dispatchEvent(new window.MouseEvent(type, {
        bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
    const yOf = (r) => r.getBoundingClientRect().bottom;
    const grip = m.row('tell').querySelector('.twm-flow-outline__grip');
    const y0 = yOf(m.row('tell')) - 20;
    pointer('pointerdown', grip, 10, y0);
    pointer('pointermove', document, 12, y0 + 2);
    t.ok('under 4 px nothing has started', !document.querySelector('.twm-flow-outline__ghost'));
    // Over the gap after "Write a summary" (the end of Branch 2).
    const target = yOf(m.row('summary'));
    pointer('pointermove', document, 60, target - 2);
    const ghost = document.querySelector('.twm-flow-outline__ghost');
    t.ok('past 4 px a ghost follows the pointer, on document.body', ghost && ghost.parentElement === document.body);
    t.check('…naming the step', ghost.querySelector('.twm-flow-outline__ghost-title').textContent, 'Tell admissions');
    m.ed.setFindings([{ code: 'x', message: 'Arrives mid-drag.', severity: 'warning', node_id: 'save' }]);
    pointer('pointermove', document, 60, target - 2);
    const line = m.host.querySelector('.twm-flow-outline__drop');
    t.ok('a drop line is drawn', line && !line.hidden);
    t.ok('findings arriving mid-drag wait for the drop: nothing under the pointer is rebuilt',
         !m.row('save').querySelector('.twm-flow-outline__badge') && m.row('summary').isConnected);
    t.check('…labelled by where the step would go', line.textContent, 'Into Branch 2 · after Write a summary');
    t.ok('the dragged row is marked', m.row('tell').classList.contains('twm-flow-outline__row--dragging'));
    pointer('pointerup', document, 60, target - 2);
    const selectedAfterDrop = m.ed.selection.id;
    t.press(m.row('save'));
    t.check('the click the release makes is swallowed', m.ed.selection.id, selectedAfterDrop);
    await t.tick();
    const g = m.ed.getGraph();
    t.ok('dropped: Tell admissions runs after Write a summary, in Branch 2',
         g.connections.some((c) => c.source === 'summary' && c.target === 'tell')
         && g.connections.some((c) => c.source === 'tell' && c.target === 'merged'));
    t.check('…recorded as flow:step:move', m.log.changes.at(-1)?.action, 'flow:step:move');
    t.ok('the ghost and the line are gone', !document.querySelector('.twm-flow-outline__ghost')
         && !m.host.querySelector('.twm-flow-outline__drop'));
    t.ok('…and the findings that waited are drawn', m.row('save').querySelector('.twm-flow-outline__badge'));
    m.ed.setFindings([]);
    t.press(m.row('save'));
    t.check('…and only that one: the next press selects as usual', m.ed.selection.id, 'save');
    m.ed.undo();

    // A refused place: inside itself.
    const g1 = m.ed.serialise();
    const loopGrip = m.row('each').querySelector('.twm-flow-outline__grip');
    pointer('pointerdown', loopGrip, 10, yOf(m.row('each')) - 20);
    pointer('pointermove', document, 80, yOf(m.row('check')) - 2);
    const l2 = m.host.querySelector('.twm-flow-outline__drop');
    t.ok('a step is never offered a place inside itself', !l2 || l2.hidden || !/Into For each new application/.test(l2.textContent));
    pointer('pointerup', document, 80, yOf(m.row('check')) - 2);
    await t.tick();
    m.ed.undo();
    const checkGrip = m.row('check').querySelector('.twm-flow-outline__grip');
    pointer('pointerdown', checkGrip, 10, yOf(m.row('check')) - 20);
    pointer('pointermove', document, 30, yOf(m.row('portaldown')) - 2);
    const l3 = m.host.querySelector('.twm-flow-outline__drop');
    const why = '‘Check eligibility’ goes on with the next item of a loop, so it can only go inside one.';
    t.ok('a place the move would break is drawn refused', l3.classList.contains('twm-flow-outline__drop--refused'));
    t.check('…saying why', l3.textContent, why);
    pointer('pointerup', document, 30, yOf(m.row('portaldown')) - 2);
    await t.tick();
    t.check('…and dropping there changes nothing', m.ed.serialise(), g1);
    t.check('…and says why under the list', m.host.querySelector('.twm-flow-outline__message').textContent, why);

    // Escape and pointercancel take the ghost away.
    pointer('pointerdown', m.row('save').querySelector('.twm-flow-outline__grip'), 10, yOf(m.row('save')) - 20);
    pointer('pointermove', document, 40, yOf(m.row('save')) + 30);
    t.ok('a second drag has its ghost', document.querySelector('.twm-flow-outline__ghost'));
    t.key(document.body, 'Escape');
    t.ok('Escape takes the ghost away', !document.querySelector('.twm-flow-outline__ghost'));
    pointer('pointerup', document, 40, yOf(m.row('save')) + 30);
    await t.tick();
    t.check('…and moves nothing', m.ed.serialise(), g1);
    pointer('pointerdown', m.row('save').querySelector('.twm-flow-outline__grip'), 10, yOf(m.row('save')) - 20);
    pointer('pointermove', document, 40, yOf(m.row('save')) + 30);
    pointer('pointercancel', document, 40, yOf(m.row('save')) + 30);
    t.ok('pointercancel takes it away', !document.querySelector('.twm-flow-outline__ghost'));
    pointer('pointerdown', m.row('save').querySelector('.twm-flow-outline__grip'), 10, yOf(m.row('save')) - 20);
    pointer('pointermove', document, 40, yOf(m.row('save')) + 30);
    m.ed.destroy();
    t.ok('destroy takes it away', !document.querySelector('.twm-flow-outline__ghost'));
    t.check('no element is draggable', document.querySelectorAll('[draggable]').length, 0);
    t.check('no pointer is ever captured', captures, 0);
    t.check('no native drag started', dragstarts, 0);
    layoutHost = null;
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§16 Insert a value');
{
    const m = mount();
    m.ed.select('invite');
    const field = m.panel().querySelector('[data-field="body"]');
    const glyph = field.querySelector('.twm-flow-refbox__insert, button[aria-label="Insert a value"]');
    t.ok('a reference field offers "{ }"', glyph);
    t.press(glyph);
    await t.tick();
    await t.tick();
    const q = m.log.values.at(-1);
    t.ok('the consumer is asked', q && q.stepId === 'invite');
    t.check('…with the steps that always run before, nearest first', q.before,
            ['check', 'each', 'anynew', 'save', 'fetch', 'start']);
    t.ok('…never the step that ends the run on the other arm', !q.before.includes('portaldown') && !q.before.includes('checkfail'));
    t.check('…and the loops it is inside', q.loops, ['each']);
    t.check('…and the arms it is inside, each with its port, innermost first — none of them an error arm', q.arms,
            [{ head: 'each', port: 'body' }, { head: 'anynew', port: 'true' }]);
    t.check('…which field asks', q.field, 'body');
    t.ok('the picker opens with the consumer\'s groups', popover()?.querySelector('.twm-flow-values'));
    kit.closeFlowPopovers();
    m.ed.select('report');
    m.ed.select('summary');
    const msg = m.panel().querySelector('[data-field="message"]');
    t.press(msg.querySelector('button[aria-label="Insert a value"]'));
    await t.tick();
    await t.tick();
    t.check('after the loop, nothing of its body runs before', m.log.values.at(-1).before.includes('check'), false);
    t.ok('…but the loop does', m.log.values.at(-1).before.includes('each'));
    t.check('…and a parallel\'s branch is an arm of it', m.log.values.at(-1).arms,
            [{ head: 'report', port: 'out' }, { head: 'anynew', port: 'true' }]);
    kit.closeFlowPopovers();
    // Under "If the request fails" the request ran and FAILED: the consumer is
    // told the step sits in its error arm, so it can offer the request's error
    // output and never its data output, which on a failure is empty (36 §3.7).
    m.ed.select('checkfail');
    t.press(m.panel().querySelector('[data-field="message"] button[aria-label="Insert a value"]'));
    await t.tick();
    await t.tick();
    const failed = m.log.values.at(-1);
    t.ok('in the error arm: the failed step still runs before', failed.stepId === 'checkfail' && failed.before[0] === 'check');
    t.check('…and the innermost arm is ITS error port', failed.arms[0], { head: 'check', port: 'error' });
    t.check('…then the loop\'s body and Then', failed.arms.slice(1),
            [{ head: 'each', port: 'body' }, { head: 'anynew', port: 'true' }]);
    kit.closeFlowPopovers();
    m.ed.destroy();
}

// ═════════════════════════════════════════════════════════════════════════
t.section('§17 destroy');
{
    const m = mount();
    t.press(m.row('save').querySelector('.twm-flow-outline__menu'));
    t.ok('a menu is open', popover());
    const host = m.host;
    m.ed.destroy();
    t.ok('destroy closes it', !popover());
    t.ok('…and removes the editor', !host.querySelector('.twm-flow-outline'));
    m.ed.destroy();
    t.ok('a second destroy is harmless', true);
}

t.done();
