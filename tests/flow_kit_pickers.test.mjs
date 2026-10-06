/**
 * THE STEP PICKER AND INSERT A VALUE (36 §3.5, §3.7) — two popovers.
 *
 *   §1  the step picker: a dialog holding a listbox, the search box focused,
 *       grouped by category in order, a grid category drawn as a grid, the
 *       "where" line
 *   §2  search over label, sub, description and id; "Nothing matches"
 *   §3  ↑ ↓ step OVER a refused entry; Enter adds; a refused entry is drawn
 *       with its sentence and cannot be chosen — never hidden
 *   §4  paste: the footer, and Ctrl+V in the EMPTY box (with text, the box's)
 *   §5  dismissal: Escape and an outside press resolve null and FOCUS GOES
 *       BACK TO THE ANCHOR; the anchor again toggles; a second picker closes
 *       the first; closeFlowPopovers() closes whatever is open
 *   §6  Insert a value: a grid group with types, chip groups, an empty group's
 *       sentence, the consumer's note, and what the active option inserts
 *   §7  "body ›" opens a level: the whole value first, Back and Escape climb
 *       (Escape there does not close), a child is picked as its own ref
 *   §8  the search filters every level at once
 *
 *     node tests/flow_kit_pickers.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow kit — pickers');
const { openStepPicker } = await import('../src/flow/kit/step_picker.js');
const { openValuePicker } = await import('../src/flow/kit/value_picker.js');
const { closeFlowPopovers, openFlowPopover } = await import('../src/flow/kit/dom.js');
const { document, window } = t;

const anchor = document.createElement('button');
anchor.textContent = '+';
document.body.appendChild(anchor);
const CATEGORIES = [{ id: 'control', label: 'Flow' }, { id: 'data', label: 'Data', layout: 'grid' },
                    { id: 'integration', label: 'Integration' }];
const ENTRIES = [
    { id: 'if', label: 'If … otherwise', sub: 'Condition', description: 'Ask a yes-or-no question.', category: 'control', tone: 'violet', icon: 'call_split' },
    { id: 'loop', label: 'For each row', sub: 'Loop over rows', description: 'Run the steps inside it once for every row.', category: 'control', tone: 'violet' },
    { id: 'end', label: 'End the run', sub: 'End', category: 'control', refusal: 'Nothing may follow an End step.' },
    { id: 'parallel', label: 'At the same time', sub: 'Parallel + Merge', category: 'control' },
    { id: 'read', label: 'Read rows', category: 'data', tone: 'teal' },
    { id: 'upsert', label: 'Insert or update rows', category: 'data', tone: 'teal' },
    { id: 'http-request', label: 'HTTP request', category: 'integration', tone: 'amber' },
    { id: 'misc', label: 'Misc', category: 'elsewhere' },
];
const key = (el, k, init = {}) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
const visible = (pop) => [...pop.querySelectorAll('[role="option"]')].filter((o) => !o.hidden && !o.closest('[hidden]'));
const activeOf = (pop) => pop.querySelector(`#${pop.querySelector('[role="combobox"]').getAttribute('aria-activedescendant')}`);

t.section('§1 the step picker');
{
    anchor.focus();
    const picked = openStepPicker({ anchor, entries: ENTRIES, categories: CATEGORIES,
                                    where: 'inside For each new application, after Check eligibility' });
    const pop = openFlowPopover();
    t.ok('a dialog on the page, named', pop?.getAttribute('role') === 'dialog' && pop.getAttribute('aria-label') === 'Add a step');
    t.ok('holding a listbox', pop.querySelector('[role="listbox"]') !== null);
    t.ok('the search box has focus', document.activeElement === pop.querySelector('input[type="search"]'));
    t.check('groups in the categories\' order, an unlisted one after', [...pop.querySelectorAll('.twm-flow-picker__group-label')]
            .map((g) => g.textContent), ['Flow', 'Data', 'Integration', 'elsewhere']);
    t.ok('a grid category is drawn as a grid', pop.querySelectorAll('.twm-flow-picker__items--grid').length === 1);
    t.check('the where line', pop.querySelector('.twm-flow-picker__where').textContent,
            'inside For each new application, after Check eligibility');
    t.ok('a list entry shows its description; a grid one does not',
         pop.querySelector('[data-entry="if"] .twm-flow-picker__description') !== null
         && pop.querySelector('[data-entry="read"] .twm-flow-picker__description') === null);
    t.ok('the tone is on the entry\'s chip', pop.querySelector('[data-entry="if"] .twm-flow-picker__chip--violet') !== null);
    t.check('the first option is active', activeOf(pop)?.dataset.entry, 'if');
    key(pop.querySelector('input'), 'Enter');
    const r = await picked;
    t.check('Enter adds the active entry', r?.entry?.id, 'if');
    t.ok('the picker is gone and focus is back on the anchor', openFlowPopover() === null && document.activeElement === anchor);
}

t.section('§2 search');
{
    const picked = openStepPicker({ anchor, entries: ENTRIES, categories: CATEGORIES });
    const pop = openFlowPopover();
    const box = pop.querySelector('input');
    t.typeInto(box, 'rows');
    t.check('over label, sub and description', visible(pop).map((o) => o.dataset.entry), ['loop', 'read', 'upsert']);
    t.ok('a group with nothing left is hidden', [...pop.querySelectorAll('.twm-flow-picker__group')].filter((g) => !g.hidden).length === 2);
    t.typeInto(box, 'http-req');
    t.check('over the id', visible(pop).map((o) => o.dataset.entry), ['http-request']);
    t.typeInto(box, 'each  row');
    t.check('every word must match', visible(pop).map((o) => o.dataset.entry), ['loop']);
    t.typeInto(box, 'zebra');
    t.check('nothing matches, and it says so', [visible(pop).length, pop.querySelector('.twm-flow-picker__empty').textContent],
            [0, 'Nothing matches “zebra”.']);
    key(box, 'Enter');
    t.ok('Enter with nothing to choose chooses nothing', openFlowPopover() === pop);
    key(box, 'Escape');
    t.check('Escape: null', await picked, null);
}

t.section('§3 refused entries');
{
    const picked = openStepPicker({ anchor, entries: ENTRIES, categories: CATEGORIES });
    const pop = openFlowPopover();
    const box = pop.querySelector('input');
    const end = pop.querySelector('[data-entry="end"]');
    t.ok('a refused entry is drawn, greyed, with its sentence', !end.hidden && end.getAttribute('aria-disabled') === 'true'
         && end.textContent.includes('Nothing may follow an End step.'));
    key(box, 'ArrowDown');
    t.check('↓ to the second', activeOf(pop).dataset.entry, 'loop');
    key(box, 'ArrowDown');
    t.check('↓ steps OVER the refused one', activeOf(pop).dataset.entry, 'parallel');
    key(box, 'ArrowUp');
    t.check('↑ steps over it too', activeOf(pop).dataset.entry, 'loop');
    t.press(end);
    t.ok('a click on a refused entry chooses nothing', openFlowPopover() === pop);
    t.press(pop.querySelector('[data-entry="read"]'));
    t.check('a click on an entry adds it', (await picked)?.entry?.id, 'read');
}

t.section('§4 paste');
{
    const none = openStepPicker({ anchor, entries: ENTRIES });
    t.ok('no paste offered: no footer button', openFlowPopover().querySelector('.twm-flow-picker__paste') === null);
    closeFlowPopovers();
    t.check('closeFlowPopovers() resolves it null', await none, null);
    const picked = openStepPicker({ anchor, entries: ENTRIES, paste: {} });
    const pop = openFlowPopover();
    t.check('the footer', pop.querySelector('.twm-flow-picker__paste').textContent, 'Paste a copied step · Ctrl+V');
    const box = pop.querySelector('input');
    t.typeInto(box, 'abc');
    key(box, 'v', { ctrlKey: true });
    t.ok('Ctrl+V with text in the box is the box\'s', openFlowPopover() === pop);
    t.typeInto(box, '');
    key(box, 'v', { ctrlKey: true });
    t.check('Ctrl+V in the empty box pastes the step', await picked, { paste: true });
    const clicked = openStepPicker({ anchor, entries: ENTRIES, paste: { label: 'Paste “Check eligibility”' } });
    t.press(openFlowPopover().querySelector('.twm-flow-picker__paste'));
    t.check('the footer button pastes too, in the consumer\'s words', await clicked, { paste: true });
}

t.section('§5 dismissal and focus');
{
    anchor.focus();
    const a = openStepPicker({ anchor, entries: ENTRIES });
    key(openFlowPopover().querySelector('input'), 'Escape');
    t.check('Escape: null', await a, null);
    t.ok('focus back on the anchor', document.activeElement === anchor);
    const b = openStepPicker({ anchor, entries: ENTRIES });
    await t.tick(5);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    t.mouse('pointerdown', outside);
    t.check('an outside press: null', await b, null);
    const c = openStepPicker({ anchor, entries: ENTRIES });
    await t.tick(5);
    t.mouse('pointerdown', anchor);
    t.ok('a press on the anchor itself does not dismiss', openFlowPopover() !== null);
    const toggled = await openStepPicker({ anchor, entries: ENTRIES });
    t.ok('opening from the same anchor toggles it shut', toggled === null && openFlowPopover() === null);
    t.check('…and the first resolves null', await c, null);
    const other = document.createElement('button');
    document.body.appendChild(other);
    const d = openStepPicker({ anchor, entries: ENTRIES });
    const e = openStepPicker({ anchor: other, entries: ENTRIES });
    t.check('a second picker closes the first', await d, null);
    t.ok('one at a time', document.querySelectorAll('.twm-flow-popover').length === 1);
    closeFlowPopovers();
    t.check('closeFlowPopovers()', await e, null);
}

const GROUPS = [
    { id: 'row', label: 'This row', sub: 'For each new application', layout: 'grid', items: [
        { label: 'Applicant id', type: 'text', ref: '${row.applicant_id}' },
        { label: 'Email', type: 'text', ref: '${row.email}' },
        { label: 'Its position', type: 'number', ref: '${row.index}' }] },
    { id: 'check', label: 'Check eligibility', sub: 'the step before this one', items: [
        { label: 'status code', ref: '${steps.check.status_code}' },
        { label: 'body', ref: '${steps.check.body}', children: [
            { label: 'items', ref: '${steps.check.body.items}' }, { label: 'total', ref: '${steps.check.body.total}' }] }] },
    { id: 'vars', label: 'Variables', items: [], empty: 'none yet; a Set variable step makes them.' },
];

t.section('§6 Insert a value');
{
    const picks = [];
    const picked = openValuePicker({ anchor, groups: GROUPS, onPick: (it) => picks.push(it.ref),
                                     note: 'Only steps that always run before this one are listed.' });
    const pop = openFlowPopover();
    t.ok('a dialog named Insert a value, its search focused', pop.getAttribute('aria-label') === 'Insert a value'
         && document.activeElement === pop.querySelector('input'));
    t.check('a grid group lists label and type', [...pop.querySelectorAll('.twm-flow-values__grid [role="option"]')]
            .map((o) => o.textContent), ['Applicant idtext', 'Emailtext', 'Its positionnumber']);
    t.check('a chip group, a value with children marked ›', [...pop.querySelectorAll('.twm-flow-values__chips [role="option"]')]
            .map((o) => o.textContent), ['status code', 'body ›']);
    t.ok('an empty group says so', pop.textContent.includes('none yet; a Set variable step makes them.'));
    t.ok('the consumer\'s note is under the list', pop.querySelector('.twm-flow-values__note').textContent.startsWith('Only steps'));
    t.check('what the active option inserts', pop.querySelector('.twm-flow-values__inserts').textContent,
            'Inserts ${row.applicant_id} — shown as a chip, kept as text.');
    const box = pop.querySelector('input');
    key(box, 'ArrowDown');
    t.ok('↓ moves, and the line follows', pop.querySelector('.twm-flow-values__inserts').textContent.includes('${row.email}'));
    key(box, 'Enter');
    t.check('Enter picks: the promise and onPick have the item', [(await picked)?.ref, picks], ['${row.email}', ['${row.email}']]);
}

t.section('§7 a level down');
{
    const picked = openValuePicker({ anchor, groups: GROUPS });
    const pop = openFlowPopover();
    t.press([...pop.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'body ›'));
    t.ok('a crumb with Back and the path', !pop.querySelector('.twm-flow-values__crumb').hidden
         && pop.querySelector('.twm-flow-values__path').textContent === 'body');
    t.check('the whole value first, then its children', [...pop.querySelectorAll('[role="option"]')].map((o) => o.textContent),
            ['All of body', 'items', 'total']);
    const box = pop.querySelector('input');
    key(box, 'Escape');
    t.ok('Escape at a level climbs, and does not close', openFlowPopover() === pop
         && pop.querySelector('.twm-flow-values__crumb').hidden);
    t.press([...pop.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'body ›'));
    t.press(pop.querySelector('.twm-flow-values__back'));
    t.ok('Back climbs', pop.querySelector('.twm-flow-values__crumb').hidden);
    t.press([...pop.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'body ›'));
    t.press([...pop.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'total'));
    t.check('a child is picked as its own reference', (await picked)?.ref, '${steps.check.body.total}');
    const whole = openValuePicker({ anchor, groups: GROUPS });
    const p2 = openFlowPopover();
    t.press([...p2.querySelectorAll('[role="option"]')].find((o) => o.textContent === 'body ›'));
    key(p2.querySelector('input'), 'Enter');
    t.check('the whole value is the parent\'s ref', (await whole)?.ref, '${steps.check.body}');
}

t.section('§8 the search filters every level');
{
    const picked = openValuePicker({ anchor, groups: GROUPS });
    const pop = openFlowPopover();
    t.typeInto(pop.querySelector('input'), 'total');
    t.check('a child found from the top, with its path', [...pop.querySelectorAll('[role="option"]')].map((o) => o.textContent),
            ['body › total']);
    key(pop.querySelector('input'), 'Enter');
    t.check('and picked directly', (await picked)?.ref, '${steps.check.body.total}');
    const none = openValuePicker({ anchor, groups: GROUPS });
    t.typeInto(openFlowPopover().querySelector('input'), 'zebra');
    t.ok('nothing matches, and it says so', openFlowPopover().textContent.includes('Nothing matches “zebra”.'));
    closeFlowPopovers();
    t.check('closed: null', await none, null);
    const empty = openValuePicker({ anchor, groups: [] });
    t.ok('no groups at all: a sentence, not an empty box', openFlowPopover().textContent.includes('Nothing to insert here yet.'));
    closeFlowPopovers();
    await empty;
}

t.done();
