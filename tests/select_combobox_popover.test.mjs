/**
 * 0.18.0 `createSelect`, `createCombobox`, `openPopover`, `positionAnchored`, and
 * what `createTagInput` and `openForm` draw with them.
 *
 *   §1  positionAnchored: below, above, scrolling, the end edge; ActionDropdown agrees
 *   §2  createSelect: rows (glyph, second line, hint, group), value, keys, search
 *   §3  createSelect: allowNew, an unlisted value, a function of options, `name`
 *   §4  createCombobox: the box holds the value, normalise, Enter and Escape, validate
 *   §5  createCombobox: async options, stale answers, loading and failure
 *   §6  openPopover: focus, toggle, one at a time, outside press, nesting, Escape
 *   §7  a layer inside a window: Escape closes the list, not the window
 *   §7b chains of layers and modals: Escape, what a layer owns, Tab
 *   §7c an anchor that is not on the page; a carrier of your own
 *   §8  createTagInput: suggestions and normalise
 *   §9  openForm: a `create` select is a combobox
 *   §10 the barrel and the stylesheet
 *
 *     node tests/select_combobox_popover.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const T = await dataTableEnv('select, combobox, popover');
const { check, ok, section, click, key, mouse, tick, css, done, window } = T;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
const { createSelect } = await import('../src/ui/components/select.js');
const { createCombobox } = await import('../src/ui/components/combobox.js');
const { openPopover } = await import('../src/ui/components/popover.js');
const { positionAnchored, openAnchoredLayer } = await import('../src/ui/components/anchored_layer.js');
const { ActionDropdown } = await import('../src/ui/components/action_dropdown.js');
const { createTagInput } = await import('../src/ui/components/tag_input.js');
const { openForm, setModalHost } = await import('../src/ui/components/modal.js');
const { ManagedWindow } = await import('../src/ui/components/managed_window.js');
const { openPopover: openFlowKitPopover, openFlowPopover } = await import('../src/flow/kit/dom.js');
const { openStepPicker } = await import('../src/flow/kit/step_picker.js');

const panel = () => document.querySelector('.twm-option-panel');
const rows = () => [...document.querySelectorAll('.twm-option-panel [role="option"]')];
const labels = () => rows().map((r) => r.querySelector('.twm-option-list__label').textContent);
const activeLabel = () => document.querySelector('.twm-option-list__row--active .twm-option-list__label')?.textContent ?? null;
const put = (el) => { document.body.appendChild(el); return el; };
const type = (input, text) => {
    input.value = text;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const box = (node, r) => { node.getBoundingClientRect = () => ({ width: r.right - r.left, height: r.bottom - r.top, ...r }); };
const button = () => { const b = document.createElement('button'); return put(b); };

section('§1 positionAnchored');
{
    window.innerWidth = 1000;
    window.innerHeight = 600;
    const a = button();
    const p = put(document.createElement('div'));
    box(a, { left: 100, right: 200, top: 100, bottom: 120 });
    box(p, { left: 0, right: 150, top: 0, bottom: 200 });
    positionAnchored(a, p, { gap: 4 });
    check('under the anchor, by the gap', [p.style.position, p.style.top, p.style.left], ['fixed', '124px', '100px']);

    box(a, { left: 100, right: 200, top: 500, bottom: 520 });
    positionAnchored(a, p);
    check('above when it does not fit below', p.style.top, '292px');

    box(a, { left: 100, right: 200, top: 300, bottom: 320 });
    box(p, { left: 0, right: 150, top: 0, bottom: 500 });
    positionAnchored(a, p);
    check('on the side with more room, scrolling, when it fits neither',
          [p.style.top, p.style.maxHeight, p.style.overflowY], ['8px', '284px', 'auto']);

    box(a, { left: 900, right: 990, top: 100, bottom: 120 });
    box(p, { left: 0, right: 150, top: 0, bottom: 100 });
    positionAnchored(a, p);
    check('its right edge on the anchor\'s when its left would run off', p.style.left, '840px');

    box(a, { left: 300, right: 400, top: 100, bottom: 120 });
    positionAnchored(a, p, { align: 'end' });
    check('align: end lines up the right edges', p.style.left, '250px');
    ActionDropdown.position(a, p, { align: 'end' });
    check('ActionDropdown.position places the same way', [p.style.left, p.style.top], ['250px', '128px']);

    positionAnchored(a, p, { matchWidth: true });
    check('matchWidth: at least as wide as the anchor', p.style.minWidth, '100px');
    a.remove();
    p.remove();
}

section('§2 createSelect: rows, value, keys, search');
{
    const seen = [];
    const options = [
        { value: 'a', label: 'Alpha', icon: 'star', description: 'The first', hint: 'A1' },
        { group: 'More', options: [
            { value: 'b', label: 'Beta', keywords: 'second-letter' },
            { value: 'c', label: 'Gamma', disabled: true, reason: 'not yet' },
            { value: 4, label: 'Four' },
        ] },
    ];
    const s = createSelect({ options, value: 'a', onChange: (v, o) => seen.push([v, o]) });
    put(s.el);
    check('the trigger shows the chosen label', s.el.querySelector('.twm-select__label').textContent, 'Alpha');
    check('and its glyph', s.el.querySelector('.twm-select__icon').textContent, 'star');
    check('closed, nothing is on the page', panel(), null);
    check('closed, aria-expanded says so', s.el.getAttribute('aria-expanded'), 'false');

    click(s.el);
    ok('a click opens it', panel() && s.isOpen);
    check('expanded', s.el.getAttribute('aria-expanded'), 'true');
    check('every option is a row', labels(), ['Alpha', 'Beta', 'Gamma', 'Four']);
    const first = rows()[0];
    check('a row\'s glyph', first.querySelector('.twm-option-list__glyph').textContent, 'star');
    check('its second line', first.querySelector('.twm-option-list__description').textContent, 'The first');
    check('its hint', first.querySelector('.twm-option-list__hint').textContent, 'A1');
    check('the current value is aria-selected', first.getAttribute('aria-selected'), 'true');
    ok('a row with no glyph keeps the column', rows()[1].querySelector('.twm-option-list__glyph'));
    check('a group is headed', panel().querySelector('.twm-option-list__section').getAttribute('aria-label'), 'More');
    check('a disabled row is marked', rows()[2].getAttribute('aria-disabled'), 'true');
    check('with its reason', rows()[2].querySelector('.twm-choice__reason').textContent, 'not yet');
    check('no search box for a short list', panel().querySelector('.twm-option-panel__search').hidden, true);
    check('the highlight starts on the value', activeLabel(), 'Alpha');
    check('aria-activedescendant names it', s.el.getAttribute('aria-activedescendant'), first.id);

    key(s.el, 'ArrowDown');
    check('down', activeLabel(), 'Beta');
    key(s.el, 'ArrowDown');
    check('down skips a disabled row', activeLabel(), 'Four');
    key(s.el, 'ArrowDown');
    check('down wraps', activeLabel(), 'Alpha');
    key(s.el, 'ArrowUp');
    check('up wraps', activeLabel(), 'Four');
    key(s.el, 'Home');
    check('Home', activeLabel(), 'Alpha');
    key(s.el, 'End');
    check('End', activeLabel(), 'Four');
    key(s.el, 'b');
    check('a letter walks to the label it begins', activeLabel(), 'Beta');

    click(rows()[2]);
    ok('a click on a disabled row does nothing', s.isOpen && seen.length === 0);
    const pressed = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    rows()[1].dispatchEvent(pressed);
    ok('a press on a row does not take focus', pressed.defaultPrevented);

    const entered = key(s.el, 'Enter');
    ok('Enter takes the row, and is swallowed', entered === false);
    check('it is the value', s.value, 'b');
    check('onChange hears the value and the entry as given', seen[0], ['b', options[1].options[0]]);
    check('it closes', panel(), null);
    check('and the trigger follows', s.el.querySelector('.twm-select__label').textContent, 'Beta');
    check('no glyph for an option with none', s.el.querySelector('.twm-select__icon').hidden, true);

    key(s.el, 'ArrowDown');
    ok('a key opens it', s.isOpen);
    click(rows()[3]);
    check('a click takes the row; a value keeps its type', s.value, 4);
    check('onChange heard it', seen.length, 2);
    click(s.el);
    key(s.el, 'Enter');
    check('choosing the value it holds reports nothing', seen.length, 2);

    click(s.el);
    key(s.el, 'Tab');
    ok('Tab closes it and is left alone', !s.isOpen);
    click(s.el);
    click(s.el);
    ok('a second click closes it', !s.isOpen);

    s.value = 'a';
    check('value = repaints', s.el.querySelector('.twm-select__label').textContent, 'Alpha');
    check('and reports nothing', seen.length, 2);
    s.setOptions([{ value: 'z', label: 'Zed' }]);
    check('setOptions leaves the value alone', s.value, 'a');
    s.setOptions([{ value: 'z', label: 'Zed' }], 'z');
    check('or takes a new one', s.value, 'z');
    s.setDisabled(true);
    click(s.el);
    ok('disabled: no list', !s.isOpen);
    s.setDisabled(false);
    click(s.el);
    s.setDisabled(true);
    ok('disabling closes it', !s.isOpen);
    s.setDisabled(false);
    s.destroy();
    ok('destroy takes the trigger off', !s.el.isConnected);

    // Glyph off on the trigger; a placeholder that changes.
    const quiet = createSelect({ options: [{ value: 'a', label: 'A', icon: 'star' }], value: 'a', showIcon: false });
    check('showIcon: false draws no glyph on the trigger', quiet.el.querySelector('.twm-select__icon').hidden, true);
    quiet.value = null;
    check('nothing chosen shows the placeholder', quiet.el.querySelector('.twm-select__label').textContent, 'Choose…');
    ok('and is marked', quiet.el.classList.contains('twm-select--empty'));
    quiet.setPlaceholder('Loading…');
    check('setPlaceholder', quiet.el.querySelector('.twm-select__label').textContent, 'Loading…');

    // A search box: by count, narrowing on label, value, description and keywords.
    const long = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}`, keywords: i === 3 ? 'needle' : '' }));
    const f = createSelect({ options: long, value: 'v1' });
    put(f.el);
    click(f.el);
    const search = panel().querySelector('.twm-option-panel__search-input');
    check('more than seven: a search box', panel().querySelector('.twm-option-panel__search').hidden, false);
    check('which takes focus', document.activeElement, search);
    check('the search box names the active row', search.getAttribute('aria-activedescendant'), rows()[1].id);
    type(search, 'needle');
    check('keywords are searched, and never drawn', labels(), ['Item 3']);
    type(search, 'item 7');
    check('the label', labels(), ['Item 7']);
    check('the matched run is marked', panel().querySelector('.twm-option-list__match').textContent, 'Item 7');
    type(search, 'nope');
    check('nothing matching says so', panel().querySelector('.twm-option-list__message').textContent, 'Nothing matches “nope”.');
    check('and Enter takes nothing', key(search, 'Enter') === false && f.value, 'v1');
    type(search, '8');
    key(search, 'Enter');
    check('Enter in the box takes the first row showing', f.value, 'v8');
    check('focus goes back to the trigger', document.activeElement, f.el);
    click(f.el);
    check('the search is fresh on every open', panel().querySelector('.twm-option-panel__search-input').value, '');
    check('…and shows them all', labels().length, 9);
    f.destroy();
    check('destroy takes an open list off the page', panel(), null);

    const off = createSelect({ options: long, search: false });
    put(off.el);
    click(off.el);
    check('search: false, none', panel().querySelector('.twm-option-panel__search').hidden, true);
    off.destroy();
    const on = createSelect({ options: ['a'], search: { placeholder: 'Find one' } });
    put(on.el);
    click(on.el);
    check('search: { placeholder }', panel().querySelector('.twm-option-panel__search-input').placeholder, 'Find one');
    on.destroy();

    // HTML in a label is text.
    const esc = createSelect({ options: [{ value: 'x', label: '<b>bold</b>' }], value: 'x' });
    put(esc.el);
    click(esc.el);
    check('a label is text on the trigger', esc.el.querySelector('.twm-select__label').querySelector('b'), null);
    check('and in the list', rows()[0].querySelector('b'), null);
    esc.destroy();
}

section('§3 createSelect: allowNew, an unlisted value, a function of options, name');
{
    const seen = [];
    let vocabulary = ['Alpha', 'Beta'];
    const s = createSelect({ options: () => vocabulary, allowNew: true, value: 'Alpha', onChange: (v, o) => seen.push([v, o]) });
    put(s.el);
    click(s.el);
    const search = panel().querySelector('.twm-option-panel__search-input');
    ok('allowNew: a search box whatever the count', !panel().querySelector('.twm-option-panel__search').hidden);
    type(search, 'alpha');
    check('a typed name that exists is no new value', labels(), ['Alpha']);
    type(search, 'Delta');
    check('one that does not is offered', labels(), ['Use “Delta”']);
    check('…with the glyph', rows()[0].querySelector('.twm-option-list__glyph').textContent, 'add');
    check('…active, so Enter takes it', activeLabel(), 'Use “Delta”');
    key(search, 'Enter');
    check('it is the value', s.value, 'Delta');
    check('with no entry behind it', seen[0], ['Delta', null]);
    check('an unlisted value reads as itself', s.el.querySelector('.twm-select__label').textContent, 'Delta');

    vocabulary = ['Alpha', 'Beta', 'Delta'];
    click(s.el);
    check('a function is read at open', labels(), ['Alpha', 'Beta', 'Delta']);
    check('…and the value is found in it', rows()[2].getAttribute('aria-selected'), 'true');
    s.destroy();

    const worded = createSelect({ options: [], allowNew: true, newLabel: (t) => `Add ${t}`, notFound: (v) => `${v} (gone)`, value: 'old' });
    put(worded.el);
    check('notFound words an unlisted value, which stays the value',
          [worded.el.querySelector('.twm-select__label').textContent, worded.value], ['old (gone)', 'old']);
    click(worded.el);
    type(panel().querySelector('.twm-option-panel__search-input'), 'x');
    check('newLabel words the row', labels(), ['Add x']);
    worded.destroy();

    const shut = createSelect({ options: [{ value: 'a', label: 'A', disabled: true, reason: 'no' }, 'b'], value: 'a' });
    put(shut.el);
    check('a stored value naming a disabled option stays, and is shown',
          [shut.value, shut.el.querySelector('.twm-select__label').textContent], ['a', 'A']);
    click(shut.el);
    check('the highlight starts on the first that may be chosen', activeLabel(), 'b');
    shut.destroy();

    const loose = createSelect({ options: [{ value: 2, label: 'Two' }], value: '2', loose: true });
    check('loose: a stored \'2\' names option 2', loose.el.querySelector('.twm-select__label').textContent, 'Two');
    const strict = createSelect({ options: [{ value: 2, label: 'Two' }], value: '2' });
    check('otherwise it does not', strict.el.querySelector('.twm-select__label').textContent, '2');

    const changes = [];
    const form = put(document.createElement('form'));
    form.addEventListener('change', (ev) => changes.push(ev.target.name));
    const named = createSelect({ options: ['a', 'b'], value: 'a', name: 'kind' });
    form.appendChild(named.el);
    check('name: a hidden input carries the value', form.elements.kind.value, 'a');
    check('…and it is the handle\'s input', named.input, form.elements.kind);
    named.el.querySelector('.twm-select').click();
    click(rows()[1]);
    check('…follows the choice', form.elements.kind.value, 'b');
    check('…and fires a bubbling change', changes, ['kind']);
    named.value = 'a';
    check('…follows value =', form.elements.kind.value, 'a');
    named.destroy();
    form.remove();
}

section('§4 createCombobox: the box holds the value');
{
    const seen = [];
    const options = [
        { value: 'GBP', label: 'GBP · £', description: 'Pound sterling' },
        { value: 'CAD', label: 'CAD · $', description: 'Canadian dollar', keywords: 'loonie' },
        { value: 'SEK', label: 'SEK · kr', description: 'Swedish krona' },
    ];
    const upper = (t) => t.toUpperCase();
    const c = createCombobox({
        options, value: 'gbp', normalise: upper, onChange: (v, o) => seen.push([v, o]),
        isCandidate: (t) => /^[A-Z]{3}$/.test(t),
        validate: (v) => (/^[A-Z]{3}$/.test(v) ? null : 'Three letters.'),
    });
    put(c.el);
    const { input } = c;
    check('a handed value is normalised', [input.value, c.value], ['GBP', 'GBP']);
    check('…and reported once, since the model holds the other', seen, [['GBP', null]]);
    createCombobox({ value: 'GBP', normalise: upper, onChange: () => seen.push('again') });
    check('a well-formed value reports nothing', seen.length, 1);
    check('the input is a combobox', [input.getAttribute('role'), input.getAttribute('aria-expanded')], ['combobox', 'false']);

    click(input);
    check('a click shows everything', labels(), ['GBP · £', 'CAD · $', 'SEK · kr']);
    check('the value\'s row is marked', rows()[0].getAttribute('aria-selected'), 'true');
    check('nothing active: Enter keeps the text', activeLabel(), null);

    type(input, 'pound');
    check('the description is searched', labels(), ['GBP · £']);
    check('each keystroke is reported, normalised', seen[seen.length - 1], ['POUND', null]);
    check('the box is not rewritten while typing', input.value, 'pound');
    check('autoHighlight: the row Enter would take', activeLabel(), 'GBP · £');
    check('aria-activedescendant names it', input.getAttribute('aria-activedescendant'), rows()[0].id);
    key(input, 'Enter');
    check('Enter puts the row\'s VALUE in the box', input.value, 'GBP');
    check('…reported with its entry', seen[seen.length - 1], ['GBP', options[0]]);
    check('…and closes', panel(), null);

    type(input, 'lOoNie');
    check('keywords are searched', labels(), ['CAD · $']);
    type(input, 'zzz');
    check('nothing to suggest, nothing to show', panel(), null);
    check('…and the text is still the value', c.value, 'ZZZ');

    type(input, 'nad');
    check('a code inside another row\'s words matches it', labels(), ['CAD · $']);
    check('…but a well-formed value is not completed (isCandidate)', activeLabel(), null);
    let handed = key(input, 'Enter');
    check('Enter keeps it, and is swallowed', [input.value, c.value, handed], ['NAD', 'NAD', false]);
    check('…and closes', panel(), null);
    handed = key(input, 'Enter');
    check('with the list closed Enter is the dialog\'s', handed, true);

    type(input, 'cad');
    check('the typed text IS a row: that row', activeLabel(), 'CAD · $');

    const escape = key(input, 'Escape');
    ok('Escape closes the list and is swallowed', escape === false && panel() === null);
    check('Escape leaves the value', c.value, 'CAD');
    check('with the list closed Escape is the dialog\'s', key(input, 'Escape'), true);

    key(input, 'ArrowDown');
    check('down opens and walks', activeLabel(), 'GBP · £');
    key(input, 'ArrowUp');
    check('up wraps', activeLabel(), 'SEK · kr');
    click(rows()[1]);
    check('a click takes a row', input.value, 'CAD');
    check('…and the box keeps focus', document.activeElement, input);

    type(input, 'ab');
    check('no complaint while typing', c.error, null);
    input.dispatchEvent(new window.Event('blur'));
    check('settled: the box takes the canonical text', input.value, 'AB');
    check('…and says what is wrong', c.error, 'Three letters.');
    check('…where the reader sees it', input.getAttribute('aria-invalid'), 'true');
    check('…and the value is still the value', c.value, 'AB');
    type(input, 'abc');
    check('typing clears it', c.error, null);
    c.value = 'x';
    check('value = settles', [input.value, c.error], ['X', 'Three letters.']);

    c.setOptions(['ONE', 'TWO']);
    click(input);
    check('setOptions replaces the list', labels(), ['ONE', 'TWO']);
    c.setOptions(['THREE']);
    check('…an open one too', labels(), ['THREE']);
    c.destroy();
    check('destroy takes everything off', [c.el.isConnected, panel()], [false, null]);
}

section('§5 createCombobox: async options');
{
    const calls = [];
    const gates = [];
    const c = createCombobox({
        debounce: 0,
        options: (q, { signal }) => {
            calls.push([q, signal]);
            return new Promise((resolve, reject) => gates.push({ resolve, reject }));
        },
        autoHighlight: false,
    });
    put(c.el);
    const { input } = c;
    type(input, 'a');
    check('asked with what was typed', calls[0][0], 'a');
    check('a list that is still coming says so', panel().querySelector('.twm-option-list__message').textContent, 'Loading…');
    type(input, 'ab');
    ok('a newer question aborts the older', calls[0][1].aborted && !calls[1][1].aborted);
    gates[1].resolve([{ value: 'abc', label: 'ABC' }]);
    await tick();
    check('the answer is drawn', labels(), ['ABC']);
    gates[0].resolve([{ value: 'stale', label: 'STALE' }]);
    await tick();
    check('a stale answer is dropped', labels(), ['ABC']);

    type(input, 'abd');
    check('rows stay until the answer', labels(), ['ABC']);
    gates[2].resolve([]);
    await tick();
    check('no rows closes it', panel(), null);
    type(input, 'abe');
    gates[3].resolve([{ value: 'abe', label: 'ABE' }]);
    await tick();
    check('an answer with rows opens it again', labels(), ['ABE']);

    const warn = console.warn;
    console.warn = () => {};
    type(input, 'abf');
    gates[4].reject(new Error('down'));
    await tick();
    console.warn = warn;
    check('a failure says so', panel().querySelector('.twm-option-list__message').textContent, 'Could not load the options.');
    check('…and the text is still the value', c.value, 'abf');

    type(input, 'abg');
    key(input, 'Escape');
    gates[5].resolve([{ value: 'late', label: 'LATE' }]);
    await tick();
    check('an answer after Escape does not reopen it', panel(), null);

    click(input);
    check('a click asks at once, with nothing', calls[calls.length - 1][0], '');
    c.destroy();

    let asked = 0;
    const slow = createCombobox({ options: () => { asked += 1; return []; }, debounce: 20 });
    put(slow.el);
    type(slow.input, 'a');
    type(slow.input, 'ab');
    type(slow.input, 'abc');
    check('debounce: not asked yet', asked, 0);
    await tick(40);
    check('debounce: asked once, for the last', asked, 1);
    slow.destroy();
}

section('§6 openPopover');
{
    const anchor = button();
    const content = document.createElement('div');
    const inner = content.appendChild(document.createElement('button'));
    const closes = [];
    const h = openPopover({ anchor, content, label: 'Share', className: 'mine', onClose: (r) => closes.push(r) });
    check('a dialog, with its name', [h.el.getAttribute('role'), h.el.getAttribute('aria-label')], ['dialog', 'Share']);
    ok('classes', h.el.classList.contains('twm-popover') && h.el.classList.contains('mine'));
    check('on the body', h.el.parentNode, document.body);
    check('focus moves in', document.activeElement, h.el);
    check('the anchor says so', [anchor.getAttribute('aria-expanded'), anchor.classList.contains('twm-is-open')], ['true', true]);
    await tick();

    mouse('mousedown', inner);
    ok('a press inside leaves it', h.el.isConnected);
    mouse('mousedown', anchor);
    ok('a press on the anchor is the anchor\'s', h.el.isConnected);

    const again = openPopover({ anchor, content: document.createElement('div') });
    ok('from the anchor that holds it: a toggle', again.toggled && again.el === null && !h.el.isConnected);
    check('…with a reason', closes, ['toggle']);
    check('…and focus back on the anchor', document.activeElement, anchor);
    check('…and the anchor says so', [anchor.getAttribute('aria-expanded'), anchor.classList.contains('twm-is-open')], ['false', false]);
    await h.closed;

    const one = openPopover({ anchor, content: document.createElement('div') });
    const other = button();
    const two = openPopover({ anchor: other, content: document.createElement('div') });
    ok('one at a time', !one.el.isConnected && two.el.isConnected);
    await tick();
    mouse('mousedown', document.body);
    ok('a press outside closes it', !two.el.isConnected);

    // Nesting: a select in a popover hangs its own panel, and that is not outside.
    const body = document.createElement('div');
    const select = createSelect({ options: ['a', 'b'] });
    body.appendChild(select.el);
    const pop = openPopover({ anchor, content: body });
    await tick();
    click(select.el);
    await tick();
    ok('a select inside opens without closing the popover', select.isOpen && pop.el.isConnected);
    mouse('mousedown', rows()[0]);
    ok('a press in its list is inside both', select.isOpen && pop.el.isConnected);
    key(select.el, 'Escape');
    ok('Escape closes the top one only', !select.isOpen && pop.el.isConnected);
    key(pop.el, 'Escape');
    ok('…and the next, the popover', !pop.el.isConnected);

    const pop2 = openPopover({ anchor, content: (() => { const d = document.createElement('div'); d.appendChild(select.el); return d; })() });
    click(select.el);
    pop2.close();
    ok('closing a layer closes what hangs from it', !select.isOpen && !pop2.el.isConnected);

    // Content may answer Escape first.
    const answering = document.createElement('div');
    answering.tabIndex = -1;
    answering.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') ev.stopPropagation(); });
    const pop3 = openPopover({ anchor, content: answering, focus: answering });
    key(answering, 'Escape');
    ok('content that answers Escape keeps it open', pop3.el.isConnected);
    pop3.close();

    // A foreign float, and the caller's own.
    const menuTrigger = button();
    const menu = new ActionDropdown({ trigger: menuTrigger, options: [{ type: 'x', label: 'X' }], onSelect() {} });
    const own = put(document.createElement('div'));
    own.className = 'my-float';
    const pop4 = openPopover({ anchor, content: document.createElement('div'), inside: '.my-float' });
    await tick();
    menu.open();
    mouse('mousedown', menu.menuEl);
    ok('a press in an ActionDropdown menu is not outside', pop4.el.isConnected);
    key(document.body, 'Escape');
    ok('…and an open one has Escape first', pop4.el.isConnected && !menu.isOpen);
    mouse('mousedown', own);
    ok('`inside` names a float of your own', pop4.el.isConnected);
    key(document.body, 'Escape');
    ok('Escape from outside the panel closes it', !pop4.el.isConnected);
    menu.destroy();
    own.remove();

    // Placed again, and gone with its anchor.
    const moving = button();
    box(moving, { left: 50, right: 90, top: 10, bottom: 30 });
    const pop5 = openPopover({ anchor: moving, content: document.createElement('div') });
    box(moving, { left: 60, right: 90, top: 40, bottom: 60 });
    window.dispatchEvent(new window.Event('resize'));
    check('a resize places it again', pop5.el.style.left, '60px');
    box(moving, { left: 70, right: 90, top: 40, bottom: 60 });
    document.body.dispatchEvent(new window.Event('scroll'));
    check('a scroll outside places it again', pop5.el.style.left, '70px');
    moving.remove();
    window.dispatchEvent(new window.Event('resize'));
    ok('an anchor gone from the page closes it', !pop5.el.isConnected);

    // The modal host.
    const host = put(document.createElement('div'));
    setModalHost(host);
    const pop6 = openPopover({ anchor, content: document.createElement('div') });
    check('the modal host holds it, when there is one', pop6.el.parentNode, host);
    pop6.close();
    setModalHost(null);
    host.remove();

    // The building block.
    const raw = put(document.createElement('div'));
    raw.remove();
    const layer = openAnchoredLayer({ anchor, el: raw });
    ok('openAnchoredLayer mounts what it is given', raw.isConnected);
    layer.close();
    ok('and takes it off', !raw.isConnected);
}

section('§7 in a window');
{
    const inner = document.createElement('div');
    const select = createSelect({ options: ['a', 'b'] });
    const combo = createCombobox({ options: ['a', 'b'] });
    inner.append(select.el, combo.el);
    let closed = 0;
    const win = new ManagedWindow({ id: 'w-in-layer', title: 'W', content: inner, modal: true, onClose: () => { closed += 1; } });
    win.show();
    await tick();
    click(select.el);
    check('a select in a modal opens over it, on the body', panel().parentNode, document.body);
    key(select.el, 'Escape');
    check('Escape closes the list and not the window', [select.isOpen, closed], [false, 0]);
    click(combo.input);
    key(combo.input, 'Escape');
    check('…for a combobox too', [combo.isOpen, closed], [false, 0]);
    win.close({ force: true });
}

section('§7b chains of layers and modals');
{
    const settled = (promise) => {
        const state = { done: false };
        promise.then(() => { state.done = true; });
        return state;
    };
    const lastForm = () => [...document.querySelectorAll('.twm-modal__form')].at(-1);
    const seen = (el) => { box(el, { left: 10, right: 110, top: 10, bottom: 30 }); return el; };

    // A popover anchored in a form, a select and a combobox inside the popover.
    for (const make of [
        () => { const c = createSelect({ options: ['a', 'b'] }); return { c, press: c.el, keyAt: c.el }; },
        () => { const c = createCombobox({ options: ['a', 'b'] }); return { c, press: c.input, keyAt: c.input }; },
    ]) {
        const form = settled(openForm({ fields: [{ name: 'f', label: 'F', type: 'text' }] }));
        await tick();
        const field = lastForm().querySelector('[name="f"]');
        const { c, press, keyAt } = make();
        const body = document.createElement('div');
        body.appendChild(c.el);
        const pop = openPopover({ anchor: field, content: body });
        await tick();
        click(press);
        ok('a list in a popover in a form opens', c.isOpen);
        key(keyAt, 'Escape');
        await tick();
        check('Escape: the list closes, the popover and the form stay',
              [c.isOpen, pop.el.isConnected, form.done], [false, true, false]);
        key(pop.el, 'Escape');
        await tick();
        check('Escape again: the popover, and the form stays', [pop.el.isConnected, form.done], [false, false]);
        key(field, 'Escape');
        await tick();
        check('Escape again: the form', form.done, true);
    }

    // Two modals: a list in the top one.
    const lower = new ManagedWindow({ id: 'w-lower', title: 'L', content: document.createElement('div'), modal: true });
    lower.show();
    const upperBody = document.createElement('div');
    const upperSelect = createSelect({ options: ['a', 'b'] });
    upperBody.appendChild(upperSelect.el);
    let upperClosed = 0;
    const upper = new ManagedWindow({ id: 'w-upper', title: 'U', content: upperBody, modal: true, onClose: () => { upperClosed += 1; } });
    upper.show();
    click(upperSelect.el);
    key(upperSelect.el, 'Escape');
    check('a list in a modal over a modal: Escape closes the list', [upperSelect.isOpen, upperClosed], [false, 0]);
    upper.close({ force: true });
    lower.close({ force: true });

    // A dialog the popover's content opened, and a list inside the dialog.
    const anchor = button();
    const closes = [];
    const pop = openPopover({ anchor, content: document.createElement('div'), onClose: (r) => closes.push(r) });
    await tick();
    const form = settled(openForm({
        fields: [{ name: 'k', label: 'K', type: 'select', options: ['a', 'b'], create: { onCreate: async (v) => v } }],
    }));
    await tick();
    const kind = lastForm().querySelector('[name="k"]');
    mouse('mousedown', kind);
    ok('a press in a dialog the popover opened is not outside it', pop.el.isConnected);
    click(kind);
    check('a list opening in that dialog leaves the popover', [!!panel(), pop.el.isConnected, closes], [true, true, []]);
    key(kind, 'Escape');
    check('Escape closes the list', [panel(), form.done, pop.el.isConnected], [null, false, true]);
    key(kind, 'Escape');
    await tick();
    check('Escape again: the dialog, not the popover under it', [form.done, pop.el.isConnected], [true, true]);
    key(document.body, 'Escape');
    ok('Escape again: the popover', !pop.el.isConnected);

    // `inside`: the same rule for an anchor as for a press.
    const float = put(document.createElement('div'));
    float.className = 'my-float';
    const inFloat = createSelect({ options: ['a', 'b'] });
    float.appendChild(inFloat.el);
    const popFloat = openPopover({ anchor, content: document.createElement('div'), inside: '.my-float' });
    await tick();
    click(inFloat.el);
    ok('a select in a float named by `inside` leaves the popover', inFloat.isOpen && popFloat.el.isConnected);
    inFloat.close();
    popFloat.close();
    float.remove();

    // Reopening on the anchor of an open layer still replaces it.
    const r1 = openAnchoredLayer({ anchor, el: document.createElement('div') });
    const r2 = openAnchoredLayer({ anchor, el: document.createElement('div') });
    ok('a second layer on one anchor replaces the first', !r1.el.isConnected && r2.el.isConnected);
    r2.close();

    // Tab in a popover opened from a modal.
    const tabForm = settled(openForm({ fields: [{ name: 't', label: 'T', type: 'text' }] }));
    await tick();
    const tabField = lastForm().querySelector('[name="t"]');
    const tabBody = document.createElement('div');
    const one = seen(tabBody.appendChild(document.createElement('input')));
    const two = seen(tabBody.appendChild(document.createElement('input')));
    const tabPop = openPopover({ anchor: tabField, content: tabBody, focus: one });
    check('focus is in the popover', document.activeElement, one);
    check('Tab between its controls is the browser\'s', key(one, 'Tab'), true);
    check('…and focus was not pulled back to the modal', document.activeElement, one);
    two.focus();
    check('Tab off the last control is taken', key(two, 'Tab'), false);
    check('…and goes round to the first', document.activeElement, one);
    check('Shift+Tab off the first is taken', key(one, 'Tab', { shiftKey: true }), false);
    check('…and goes round to the last', document.activeElement, two);
    tabPop.close();
    check('closed, focus is back in the modal', document.activeElement, tabField);
    key(tabField, 'Escape');
    await tick();
    ok('the form closes', tabForm.done);
}

section('§7c an anchor that is not on the page; a carrier of your own');
{
    const loose = document.createElement('button');
    const other = button();
    const stays = openAnchoredLayer({ anchor: other, el: document.createElement('div') });
    check('openAnchoredLayer on it answers null', openAnchoredLayer({ anchor: loose, el: document.createElement('div') }), null);
    ok('…and closes nothing', stays.el.isConnected);
    stays.close();

    let told = 0;
    const h = openPopover({ anchor: loose, content: document.createElement('div'), onClose: () => { told += 1; } });
    check('openPopover opens nothing and does not throw', [h.el, h.toggled, told], [null, false, 0]);
    await h.closed;
    check('…no marks on the anchor', loose.getAttribute('aria-expanded'), null);

    const f = openFlowKitPopover({ anchor: loose, content: document.createElement('div') });
    check('the flow kit\'s neither, and it does not remember it', [f.el, openFlowPopover()], [null, null]);
    check('a picker on it answers null', await openStepPicker({ anchor: loose, entries: [] }), null);

    const select = createSelect({ options: ['a', 'b'] });
    select.open();
    check('select.open() off the page: not open', [select.isOpen, select.el.getAttribute('aria-expanded'), panel()], [false, 'false', null]);
    put(select.el);
    click(select.el);
    ok('…and it works once it is mounted', select.isOpen && panel());
    select.destroy();

    const combo = createCombobox({ options: ['a', 'b'] });
    combo.open();
    check('combobox.open() off the page: not open', [combo.isOpen, combo.input.getAttribute('aria-expanded'), panel()], [false, 'false', null]);
    put(combo.el);
    click(combo.input);
    ok('…and it works once it is mounted', combo.isOpen && panel());
    combo.destroy();

    // A form template's field, kept as the carrier.
    const field = document.createElement('input');
    field.type = 'hidden';
    field.dataset.f = 'kind';
    field.id = 'kind-field';
    const changes = [];
    const held = createSelect({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value: 'a', carrier: field });
    const host = put(document.createElement('div'));
    host.addEventListener('change', (ev) => changes.push(ev.target));
    host.appendChild(held.el);
    check('the handle\'s input is yours', held.input, field);
    check('it is in the control, with its attributes and the value', [held.el.contains(field), field.id, field.getAttribute('name'), host.querySelector('[data-f="kind"]').value],
          [true, 'kind-field', null, 'a']);
    click(held.el.querySelector('.twm-select'));
    click(rows()[1]);
    check('a pick writes to it and fires change on it', [field.value, changes], ['b', [field]]);
    held.value = 'a';
    check('…as does setting the value, without the event', [field.value, changes.length], ['a', 1]);
    held.destroy();
    host.remove();
}

section('§8 createTagInput: suggestions and normalise');
{
    const host = put(document.createElement('div'));
    const seen = [];
    const t = createTagInput(host, {
        value: ['done'],
        suggestions: ['done', 'path-finding', 'find', 'Refined'],
        onChange: (l) => seen.push(l),
    });
    const { input } = t;
    input.dispatchEvent(new window.Event('focus'));
    check('focus shows what exists, less what is already chosen, in alphabetical order', labels(), ['find', 'path-finding', 'Refined']);
    type(input, 'fin');
    check('the earliest match first', labels(), ['find', 'Refined', 'path-finding']);
    check('nothing is active: Enter commits the text', activeLabel(), null);
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    check('arrows walk', activeLabel(), 'Refined');
    check('a row taken by Enter is not also a commit', key(input, 'Enter'), false);
    check('Enter takes it', t.getValue(), ['done', 'Refined']);
    check('…empties the box and closes the list', [input.value, panel()], ['', null]);
    check('…once', seen.length, 1);

    type(input, 'fi');
    click(rows()[1]);
    check('a click takes a row', t.getValue(), ['done', 'Refined', 'path-finding']);
    check('…and leaves focus in the box', document.activeElement, input);

    type(input, 'brand-new');
    check('no match: no list', panel(), null);
    key(input, 'Enter');
    check('text nobody suggested is still a tag', t.getValue(), ['done', 'Refined', 'path-finding', 'brand-new']);

    type(input, 'f');
    ok('a list with a match', panel());
    key(input, ',');
    check('a comma commits what was typed and closes the list', [t.getValue().at(-1), panel()], ['f', null]);

    type(input, 'x');
    input.dispatchEvent(new window.Event('blur'));
    check('a blur commits too, and closes', [t.getValue().at(-1), panel()], ['x', null]);
    input.dispatchEvent(new window.Event('focus'));
    t.dispose();
    check('dispose closes an open list', panel(), null);
    host.remove();

    const host2 = put(document.createElement('div'));
    const spelled = (s) => s.toLowerCase().replace(/\s+/g, '-');
    const n = createTagInput(host2, { value: ['A b', 'a-b', 'C'], normalise: spelled });
    check('normalise: one spelling, no repeats, from the start', n.getValue(), ['a-b', 'c']);
    type(n.input, 'Path Finding');
    key(n.input, 'Enter');
    check('…as typed', n.getValue(), ['a-b', 'c', 'path-finding']);
    type(n.input, 'path  finding');
    key(n.input, 'Enter');
    check('…so a second spelling is the same tag', n.getValue().length, 3);
    n.setValue(['X Y', 'x-y']);
    check('…through setValue', n.getValue(), ['x-y']);
    n.dispose();

    const spelledRows = createTagInput(host2, {
        value: ['done'],
        suggestions: ['Path Finding', 'path-finding', 'Done', { value: 'Two Words', label: 'Two words', description: 'kept' }, 'beta', 'alpha'],
        normalise: spelled,
    });
    spelledRows.input.dispatchEvent(new window.Event('focus'));
    check('a suggestion is in the one spelling, once, and not a tag already there; alphabetical',
          labels(), ['alpha', 'beta', 'path-finding', 'Two words']);
    type(spelledRows.input, 'T');
    check('earliest match first, a tie alphabetical', labels(), ['Two words', 'beta', 'path-finding']);
    type(spelledRows.input, 'path f');
    check('what is typed is compared and marked in the one spelling', [labels(), panel().querySelector('mark').textContent], [['path-finding'], 'path-f']);
    type(spelledRows.input, 'al');
    key(spelledRows.input, 'ArrowDown');
    check('a comma on an active row takes the row', [activeLabel(), key(spelledRows.input, ',')], ['alpha', false]);
    check('…not what was typed', [spelledRows.getValue(), spelledRows.input.value, panel()], [['done', 'alpha'], '', null]);
    type(spelledRows.input, 'tw');
    key(spelledRows.input, 'ArrowDown');
    key(spelledRows.input, 'Enter');
    check('a row taken has the one spelling', spelledRows.getValue().at(-1), 'two-words');
    type(spelledRows.input, 'b');
    key(spelledRows.input, 'Escape');
    check('Escape closes it', panel(), null);
    key(spelledRows.input, 'ArrowDown');
    check('an arrow reopens it for what is in the box', labels(), ['beta']);
    key(spelledRows.input, 'Escape');
    spelledRows.input.value = '';
    type(spelledRows.input, 'a,  b c ,d');
    check('each piece is trimmed before it is spelled', spelledRows.getValue().slice(-3), ['a', 'b-c', 'd']);
    spelledRows.dispose();

    const answered = createTagInput(host2, {
        suggestions: () => ['Z Z', 'z-z', 'A A'],
        normalise: spelled,
    });
    answered.input.dispatchEvent(new window.Event('focus'));
    check('a function keeps its order, in the one spelling, once', labels(), ['z-z', 'a-a']);
    answered.dispose();

    const asked = [];
    const a = createTagInput(host2, {
        value: ['taken'],
        suggestions: async (q) => { asked.push(q); return ['taken', `${q}-1`]; },
    });
    a.input.value = 'q';
    a.input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await tick(200);
    check('a function answers for itself; what is chosen is left out', [asked, labels()], [['q'], ['q-1']]);
    a.dispose();

    const plain = createTagInput(host2, { value: [] });
    check('no suggestions: the box is not a combobox', plain.input.getAttribute('role'), null);
    plain.dispose();
    host2.remove();
}

section('§9 openForm: a `create` select is a combobox');
{
    const created = [];
    const changed = [];
    const result = openForm({
        fields: [
            { name: 'kind', label: 'Kind', type: 'select', required: true, options: [
                { value: 1, label: 'One', description: 'the first' },
                { value: 'gone', disabled: true, reason: 'no more' },
            ], create: { onCreate: async (v) => { created.push(v); return `id:${v}`; }, hint: 'new kind' } },
            { name: 'plain', label: 'Plain', type: 'select', options: ['a'] },
        ],
        onFieldChange: (name, value) => { if (name) changed.push([name, value]); },
    });
    const form = [...document.querySelectorAll('.twm-modal__form')].at(-1);
    const input = form.querySelector('[name="kind"]');
    check('there is no datalist', form.querySelector('datalist'), null);
    check('the field\'s input is the combobox\'s', input.className, 'twm-combobox__input');
    check('required is on the input', input.required, true);
    check('a plain select is still a select', form.querySelector('[name="plain"]').tagName, 'SELECT');

    click(input);
    check('labels and second lines show; a disabled option is not offered', labels(), ['One']);
    check('…', rows()[0].querySelector('.twm-option-list__description').textContent, 'the first');
    const esc = key(input, 'Escape');
    ok('Escape closes the list and leaves the form open', esc === false && input.isConnected);

    click(input);
    click(rows()[0]);
    check('a pick reaches onFieldChange, with the option\'s own value', changed.at(-1), ['kind', 1]);

    type(input, 'Two');
    const hint = form.querySelector('[data-field-row="kind"] .twm-combobox__hint');
    check('the hint says what will be created', hint.textContent, '↳ will create new kind “Two”');
    form.querySelector('button[type="submit"]').click();
    const data = await result;
    check('created on submit', [created, data.kind], [['Two'], 'id:Two']);
    check('the form closing takes the list with it', panel(), null);
}

section('§10 the barrel and the stylesheet');
{
    const widgets = await import('../widgets.js');
    for (const name of ['createSelect', 'createCombobox', 'attachInputOptions', 'openPopover', 'positionAnchored', 'openAnchoredLayer', 'setModalHost', 'modalHost']) {
        check(`@flexdesk/widgets exports ${name}`, typeof widgets[name], 'function');
    }
    check('createOptionList stays internal', widgets.createOptionList, undefined);

    const base = css('base.css');
    const flexdesk = css('flexdesk.css');
    const block = (sheet) => {
        const from = sheet.indexOf('/* ══ SELECT, COMBOBOX, POPOVER (0.18.0)');
        const to = sheet.indexOf('/* ══ end SELECT, COMBOBOX, POPOVER ══ */');
        return from >= 0 && to > from ? sheet.slice(from, to) : null;
    };
    ok('the block is in base.css', block(base));
    check('…and mirrored byte for byte into flexdesk.css', block(flexdesk), block(base));
    for (const sel of ['.twm-option-panel', '.twm-popover']) {
        ok(`${sel} is over the managed windows`, /z-index:\s*var\(--z-over-windows\)/.test(ruleBody(base, sel) || ''));
    }
    ok('no literal colour in the block', !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(block(base)));
    ok('the active row reads differently from the current value',
       /--state-active/.test(ruleBody(base, '.twm-option-list__row--active, .twm-option-list__row--active:hover, .twm-option-list__row--active[aria-selected="true"]') || ''));
}

done();
