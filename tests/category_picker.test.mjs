/**
 * ══ THE CATEGORY PICKER (STORY-0126) ═════════════════════════════════════
 *
 *   §1  markup: search field, categories (dot, label, count), the active
 *       category's items (icon or badge, label), the detail pane (title,
 *       description, preview, Add); trigger ARIA; exported from widgets.js
 *   §2  filtering across categories (label, description, keywords), the hit
 *       list grouped by category, hit counts, nothing matches, clearing
 *   §3  keyboard: Up/Down within a column, Left/Right between columns, Down
 *       through hits across categories, Enter picks, Esc closes (stopped) and
 *       returns focus; a printable key goes to the search field
 *   §4  mouse: hover and click update the detail pane, double-click and Add
 *       pick, a category click shows its items, an outside click closes
 *   §5  positioning: position: fixed under the trigger, flipped above it with
 *       no room below, kept inside the window; trigger click toggles; destroy
 *   §6  CSS: every class it sets is styled, --z-over-windows, no hex
 *       literals, base.css and flexdesk.css carry the same block
 *
 *     node tests/category_picker.test.mjs
 *
 * jsdom computes no layout, so the trigger's and the popover's boxes are stubbed.
 */
import { dataTableEnv } from './dt_env.mjs';
import { stripComments } from './css_rules.mjs';

const T = await dataTableEnv('category picker');
const { check, ok, section, done, mouse, click, doubleClick, css, document, window } = T;

const { CategoryPicker } = await import('../src/ui/components/category_picker.js');
const widgets = await import('../widgets.js');

const VW = 1200;
const VH = 800;
Object.defineProperty(window, 'innerWidth', { value: VW, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: VH, configurable: true });

const CATS = () => [
    { id: 'text', label: 'Text', color: 'var(--accent-light)', items: [
        { id: 'heading', label: 'Heading', badge: 'H', description: 'A section heading.', preview: '## Debt dynamics' },
        { id: 'doc', label: 'Documentation', badge: 'Md', description: 'Markdown with LaTeX math.' },
    ] },
    { id: 'model', label: 'Model structure', items: [
        { id: 'code', label: 'Code cell', icon: 'code', description: 'Free text.', preview: 'gdp = c + i' },
        { id: 'param', label: 'Parameter', badge: 'P', description: 'A named value with a range.', keywords: ['slider'] },
        { id: 'stock', label: 'Stock', badge: 'S', description: 'One stock and its rate of change.' },
    ] },
    { id: 'fn', label: 'Functions', items: [
        { id: 'lag', label: 'Delay / Lag', badge: 'Δt', description: 'The value of an expression some time ago.', keywords: 'delay history' },
    ] },
    { id: 'none', label: 'Empty', items: [] },
];

function rect(r) {
    const full = { top: r.top, left: r.left, width: r.width, height: r.height,
                   right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top };
    return () => ({ ...full, toJSON() { return full; } });
}

function make(extra = {}, triggerBox = { top: 100, left: 100, width: 24, height: 24 }) {
    const trigger = document.createElement('button');
    trigger.textContent = '+';
    document.body.appendChild(trigger);
    trigger.getBoundingClientRect = rect(triggerBox);
    const picks = [];
    const picker = new CategoryPicker({
        trigger, categories: CATS(), onSelect: (item, cat) => picks.push(`${cat.id}/${item.id}`), ...extra,
    });
    // The popover's natural box, as flexdesk.css lays it out.
    picker.el.getBoundingClientRect = rect({ top: 0, left: 0, width: 640, height: 440 });
    return { trigger, picker, picks, el: picker.el };
}

const q = (el, sel) => el.querySelector(sel);
const qa = (el, sel) => [...el.querySelectorAll(sel)];
const catLabels = (el) => qa(el, '.twm-category-picker__category-label').map((n) => n.textContent);
const counts = (el) => qa(el, '.twm-category-picker__count').map((n) => n.textContent);
const itemLabels = (el) => qa(el, '.twm-category-picker__item-label').map((n) => n.textContent);
const highlighted = (el) => q(el, '.twm-category-picker__item--highlighted .twm-category-picker__item-label')?.textContent ?? null;
const activeCat = (el) => q(el, '.twm-category-picker__category--active .twm-category-picker__category-label')?.textContent ?? null;
const title = (el) => q(el, '.twm-category-picker__title')?.textContent ?? null;
const keyOn = (target, k, init = {}) => {
    const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(ev);
    return ev;
};
const type = (picker, text) => {
    picker._input.value = text;
    picker._input.dispatchEvent(new window.Event('input', { bubbles: true }));
};

// ── §1 ──────────────────────────────────────────────────────────────────
section('§1 markup');
{
    const { trigger, picker, el } = make({ previewLabel: 'Writes', addLabel: 'Add cell' });
    ok('appended to body, hidden until opened', el.parentElement === document.body && el.hidden);
    check('trigger aria-haspopup / aria-expanded', [trigger.getAttribute('aria-haspopup'), trigger.getAttribute('aria-expanded')], ['dialog', 'false']);
    picker.open();
    ok('open: shown', !el.hidden && picker.isOpen);
    check('role dialog', el.getAttribute('role'), 'dialog');
    check('trigger aria-expanded true', trigger.getAttribute('aria-expanded'), 'true');
    ok('trigger wears twm-is-open', trigger.classList.contains('twm-is-open'));
    ok('focus is in the search field', document.activeElement === q(el, '.twm-category-picker__input'));
    check('categories in order', catLabels(el), ['Text', 'Model structure', 'Functions', 'Empty']);
    check('item counts', counts(el), ['2', '3', '1', '0']);
    check('the colour reaches the row as a custom property',
          q(el, '.twm-category-picker__category').style.getPropertyValue('--twm-category-picker-color'), 'var(--accent-light)');
    check('one dot per category', qa(q(el, '.twm-category-picker__categories'), '.twm-category-picker__dot').length, 4);
    check('the first category is active', activeCat(el), 'Text');
    check('its items show', itemLabels(el), ['Heading', 'Documentation']);
    check('badges', qa(el, '.twm-category-picker__badge').map((n) => n.textContent), ['H', 'Md']);
    check('the first item is highlighted', highlighted(el), 'Heading');
    check('detail: title', title(el), 'Heading');
    check('detail: description', q(el, '.twm-category-picker__description').textContent, 'A section heading.');
    check('detail: preview label', q(el, '.twm-category-picker__preview-label').textContent, 'Writes');
    const pre = q(el, '.twm-category-picker__preview');
    check('detail: preview is a <pre> with the text', [pre.tagName, pre.textContent], ['PRE', '## Debt dynamics']);
    const add = q(el, '.twm-category-picker__add');
    check('Add is a primary FlexDesk button with the label', [add.className, add.textContent],
          ['twm-btn twm-btn--primary twm-category-picker__add', 'Add cell']);
    check('the input points at the highlighted option', q(el, '.twm-category-picker__input').getAttribute('aria-activedescendant'),
          q(el, '.twm-category-picker__item--highlighted').id);
    check('options carry aria-selected', qa(el, '.twm-category-picker__item').map((b) => b.getAttribute('aria-selected')), ['true', 'false']);

    click(qa(el, '.twm-category-picker__category')[1]);
    check('an icon item draws a Material Symbols ligature',
          [q(el, '.twm-category-picker__icon')?.textContent, q(el, '.twm-category-picker__icon')?.classList.contains('material-symbols-outlined')],
          ['code', true]);
    check('…and no badge', q(qa(el, '.twm-category-picker__item')[0], '.twm-category-picker__badge'), null);
    click(qa(el, '.twm-category-picker__category')[3]);
    ok('an empty category says so', !!q(el, '.twm-category-picker__empty'));
    ok('…and Add is disabled', q(el, '.twm-category-picker__add').disabled);
    ok('no preview without one', !q(el, '.twm-category-picker__preview'));
    picker.destroy();

    ok('widgets.js exports CategoryPicker', widgets.CategoryPicker === CategoryPicker);
}

// ── §2 ──────────────────────────────────────────────────────────────────
section('§2 filtering');
{
    const { picker, el } = make();
    picker.open();
    type(picker, 'stock');
    check('a label match', itemLabels(el), ['Stock']);
    type(picker, 'range');
    check('a description match', itemLabels(el), ['Parameter']);
    type(picker, 'slider');
    check('a keyword (array) match', itemLabels(el), ['Parameter']);
    type(picker, 'history');
    check('a keyword (string) match', itemLabels(el), ['Delay / Lag']);
    check('the hit\'s category becomes active', activeCat(el), 'Functions');
    type(picker, 'a');
    check('hits across categories, in category order',
          itemLabels(el), ['Heading', 'Documentation', 'Parameter', 'Stock', 'Delay / Lag']);
    const groups = qa(el, '.twm-category-picker__items > *');
    check('the listbox holds one role="group" per category with hits',
          groups.map((g) => [g.className, g.getAttribute('role')]),
          Array(3).fill(['twm-category-picker__hits', 'group']));
    check('…each named by its header, followed by its hits',
          groups.map((g) => [document.getElementById(g.getAttribute('aria-labelledby'))?.textContent,
                             ...qa(g, '.twm-category-picker__item-label').map((n) => n.textContent)]),
          [['Text', 'Heading', 'Documentation'], ['Model structure', 'Parameter', 'Stock'], ['Functions', 'Delay / Lag']]);
    ok('…the header is inside its group', groups.every((g) => g.firstElementChild.classList.contains('twm-category-picker__group')));
    check('the counts are hit counts', counts(el), ['2', '2', '1', '0']);
    ok('a category with no hits is dimmed', qa(el, '.twm-category-picker__category')[3].classList.contains('twm-category-picker__category--empty'));
    type(picker, 'MARKDOWN math');
    check('every word must match, case-insensitively', itemLabels(el), ['Documentation']);
    check('the detail follows the first hit', title(el), 'Documentation');
    type(picker, 'zzz');
    check('nothing matches', [itemLabels(el), q(el, '.twm-category-picker__empty')?.textContent], [[], 'Nothing matches “zzz”.']);
    ok('Add is disabled', q(el, '.twm-category-picker__add').disabled);
    type(picker, 'param');
    type(picker, '');
    check('clearing shows the hit\'s category again', [activeCat(el), itemLabels(el), highlighted(el)],
          ['Model structure', ['Code cell', 'Parameter', 'Stock'], 'Parameter']);
    picker.close();
    picker.open();
    check('re-opening starts with an empty query', picker._input.value, '');
    picker.destroy();
}

// ── §3 ──────────────────────────────────────────────────────────────────
section('§3 keyboard');
{
    const { trigger, picker, picks, el } = make();
    picker.open();
    const input = picker._input;
    keyOn(input, 'ArrowDown');
    check('Down moves within the items', highlighted(el), 'Documentation');
    keyOn(input, 'ArrowDown');
    check('…and wraps', highlighted(el), 'Heading');
    keyOn(input, 'ArrowUp');
    check('Up wraps backwards', highlighted(el), 'Documentation');
    keyOn(input, 'ArrowLeft');
    ok('Left moves to the categories column', q(el, '.twm-category-picker__categories').classList.contains('twm-category-picker__column--current'));
    keyOn(input, 'ArrowDown');
    check('Down there changes the category', [activeCat(el), itemLabels(el), highlighted(el)],
          ['Model structure', ['Code cell', 'Parameter', 'Stock'], 'Code cell']);
    keyOn(input, 'ArrowUp'); keyOn(input, 'ArrowUp');
    check('Up wraps through the categories', activeCat(el), 'Empty');
    keyOn(input, 'ArrowDown'); keyOn(input, 'ArrowDown');
    keyOn(input, 'ArrowRight');
    ok('Right moves to the items column', q(el, '.twm-category-picker__items').classList.contains('twm-category-picker__column--current'));
    keyOn(input, 'ArrowDown');
    check('Down moves the item again', highlighted(el), 'Parameter');
    const enter = keyOn(input, 'Enter');
    check('Enter picks it', picks, ['model/param']);
    ok('…closes', !picker.isOpen && el.hidden);
    ok('…returns focus to the trigger', document.activeElement === trigger);
    ok('…and the Enter is consumed', enter.defaultPrevented);

    picker.open();
    type(picker, 'a');
    keyOn(input, 'ArrowDown'); keyOn(input, 'ArrowDown');
    check('with a query, Down walks the hits across categories', [highlighted(el), activeCat(el)], ['Parameter', 'Model structure']);
    keyOn(input, 'ArrowDown'); keyOn(input, 'ArrowDown');
    check('…into the next category', [highlighted(el), activeCat(el)], ['Delay / Lag', 'Functions']);
    const left = keyOn(input, 'ArrowLeft');
    ok('with a query, Left is the caret\'s', !left.defaultPrevented);
    keyOn(input, 'Enter');
    check('Enter picks the hit', picks, ['model/param', 'fn/lag']);

    picker.open();
    let outer = 0;
    const onOuter = () => { outer++; };
    document.addEventListener('keydown', onOuter);
    const esc = keyOn(input, 'Escape');
    document.removeEventListener('keydown', onOuter);
    ok('Esc closes', !picker.isOpen);
    ok('…returns focus to the trigger', document.activeElement === trigger);
    ok('…and nobody else gets it', esc.defaultPrevented && outer === 0);
    check('nothing picked', picks.length, 2);

    picker.open();
    qa(el, '.twm-category-picker__item')[0].focus();
    keyOn(document.activeElement, 's');
    ok('a printable key typed on a row goes to the search field', document.activeElement === input);
    const outsideKey = keyOn(document.body, 'ArrowDown');
    ok('arrow keys outside the popover are left alone', !outsideKey.defaultPrevented);
    picker.destroy();
}

// ── §4 ──────────────────────────────────────────────────────────────────
section('§4 mouse');
{
    const { trigger, picker, picks, el } = make();
    picker.open();
    const items = () => qa(el, '.twm-category-picker__item');
    const second = items()[1];
    mouse('mouseenter', second, { bubbles: false });
    check('hover highlights and shows the detail', [highlighted(el), title(el)], ['Documentation', 'Documentation']);
    ok('hover does not rebuild the list', items()[1] === second);
    click(items()[0]);
    check('click highlights', title(el), 'Heading');
    check('a click does not pick', picks, []);
    click(qa(el, '.twm-category-picker__category')[2]);
    check('a category click shows its items', [activeCat(el), itemLabels(el), title(el)], ['Functions', ['Delay / Lag'], 'Delay / Lag']);
    doubleClick(items()[0]);
    check('double-click picks', picks, ['fn/lag']);
    ok('…closes and returns focus', !picker.isOpen && document.activeElement === trigger);

    picker.open();
    click(qa(el, '.twm-category-picker__category')[1]);
    mouse('mouseenter', items()[2], { bubbles: false });
    click(q(el, '.twm-category-picker__add'));
    check('Add picks the highlighted item', picks, ['fn/lag', 'model/stock']);

    picker.open();
    click(q(el, '.twm-category-picker__search'));
    ok('a click inside keeps it open', picker.isOpen);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    click(outside);
    ok('an outside click closes it', !picker.isOpen);
    picker.destroy();
}

// ── §5 ──────────────────────────────────────────────────────────────────
section('§5 positioning');
{
    let { trigger, picker, el } = make();
    click(trigger);
    ok('the trigger\'s click opens it', picker.isOpen);
    check('position: fixed, under the trigger, aligned with its left edge',
          [el.style.position, el.style.top, el.style.left], ['fixed', '132px', '100px']);
    check('the columns scroll, not the popover', el.style.overflowY, 'hidden');
    click(trigger);
    ok('a second click closes it', !picker.isOpen);
    picker.destroy();
    ok('destroy removes it', !document.body.contains(el));
    check('destroy unhooks the trigger', (click(trigger), document.querySelectorAll('.twm-category-picker').length), 0);

    ({ trigger, picker, el } = make({}, { top: 700, left: 900, width: 24, height: 24 }));
    picker.open();
    check('no room below: flipped above, kept inside on the right',
          [el.style.top, el.style.left], [`${700 - 8 - 440}px`, `${924 - 640}px`]);
    picker.destroy();

    ({ trigger, picker, el } = make({ align: 'end' }, { top: 100, left: 900, width: 24, height: 24 }));
    picker.open();
    check('align: end lines up with the trigger\'s right edge', el.style.left, `${924 - 640}px`);
    picker.destroy();

    ({ trigger, picker, el } = make({}, { top: 300, left: 100, width: 24, height: 24 }));
    picker.el.getBoundingClientRect = rect({ top: 0, left: 0, width: 640, height: 600 });
    picker.open();
    check('room on neither side: on the larger, capped to fit', [el.style.top, el.style.maxHeight], ['332px', `${VH - 332 - 8}px`]);
    picker.destroy();
}

// ── §6 ──────────────────────────────────────────────────────────────────
section('§6 CSS');
{
    const BLOCK = /\/\* ══ CATEGORY PICKER[\s\S]*?\/\* ══ end CATEGORY PICKER ══ \*\//;
    const base = css('base.css').match(BLOCK)?.[0];
    const full = css('flexdesk.css').match(BLOCK)?.[0];
    ok('base.css carries the block', !!base);
    ok('flexdesk.css carries the same block', !!full && full === base);
    const rules = stripComments(base || '');
    check('no hex colour literals', rules.match(/#[0-9a-fA-F]{3,8}\b/g), null);
    check('no rgb()/rgba() literals either', rules.match(/rgba?\(/g), null);
    ok('drawn over windows', /\.twm-category-picker \{[^}]*z-index: var\(--z-over-windows\)/.test(rules));
    ok('position: fixed', /\.twm-category-picker \{[^}]*position: fixed/.test(rules));
    ok('[hidden] beats display: flex', /\.twm-category-picker\[hidden\] \{\s*display: none;/.test(rules));

    const { picker, el } = make({ previewLabel: 'Writes' });
    picker.open();
    type(picker, 'a');                   // groups and dimmed categories
    const classes = new Set();
    const collect = () => el.querySelectorAll('*').forEach((n) => n.classList.forEach((c) => classes.add(c)));
    collect();
    el.classList.forEach((c) => classes.add(c));
    type(picker, 'zzz'); collect();
    picker.setCategories([{ id: 'x', label: 'X', items: [] }]);
    type(picker, ''); collect();
    const unstyled = [...classes]
        .filter((c) => c.startsWith('twm-category-picker'))
        .filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(rules));
    check('every twm-category-picker class it sets is styled', unstyled, []);
    picker.destroy();
}

// ── §7 ──────────────────────────────────────────────────────────────────
section('§7 review fixes');
{
    const { trigger, picker, picks, el } = make({ label: 'Add a cell' });
    check('the dialog is named (label option)', el.getAttribute('aria-label'), 'Add a cell');
    const dflt = make();
    check('…default name', dflt.el.getAttribute('aria-label'), 'Pick');
    dflt.picker.destroy();
    ok('the detail pane is not a live region', !q(el, '[aria-live]'));

    picker.open();
    const input = picker._input;
    // 1. a press anywhere but the input keeps focus in it
    for (const sel of ['.twm-category-picker__description', '.twm-category-picker__preview',
                       '.twm-category-picker__detail', '.twm-category-picker__column', '.twm-category-picker__item',
                       '.twm-category-picker__category']) {
        const ev = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
        q(el, sel).dispatchEvent(ev);
        ok(`a mousedown on ${sel} does not move focus`, ev.defaultPrevented);
    }
    const onInput = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    input.dispatchEvent(onInput);
    ok('…one on the input is left alone (caret placement)', !onInput.defaultPrevented);

    // 2. Tab cycles input <-> Add and never leaves
    const add = () => q(el, '.twm-category-picker__add');
    let outer = 0;
    const onOuter = () => { outer++; };
    document.addEventListener('keydown', onOuter);
    const tab = keyOn(input, 'Tab');
    ok('Tab from the input goes to Add', document.activeElement === add() && tab.defaultPrevented);
    keyOn(add(), 'Tab');
    ok('Tab from Add comes back to the input', document.activeElement === input);
    keyOn(input, 'Tab', { shiftKey: true });
    ok('Shift+Tab cycles backwards', document.activeElement === add());
    keyOn(add(), 'Tab', { shiftKey: true });
    ok('…to the input', document.activeElement === input);
    document.removeEventListener('keydown', onOuter);
    ok('the Tab never reached a focus trap around it', outer === 0);
    ok('…and the picker stayed open', picker.isOpen);
    click(qa(el, '.twm-category-picker__category')[3]);    // Empty: Add disabled
    keyOn(input, 'Tab');
    ok('with Add disabled, Tab stays in the input', document.activeElement === input);

    // 4. IME composition owns Enter / Escape
    click(qa(el, '.twm-category-picker__category')[0]);
    keyOn(input, 'Enter', { isComposing: true });
    keyOn(input, 'Escape', { isComposing: true });
    ok('Enter and Esc while composing neither pick nor close', picker.isOpen && picks.length === 0);
    keyOn(input, 'Enter', { keyCode: 229 });
    ok('…nor with keyCode 229', picker.isOpen && picks.length === 0);

    // 6. activedescendant follows the categories column
    keyOn(input, 'ArrowLeft');
    const cat0 = qa(el, '.twm-category-picker__category')[0];
    ok('categories have ids', qa(el, '.twm-category-picker__category').every((b) => b.id));
    check('in the categories column, activedescendant is the active category',
          input.getAttribute('aria-activedescendant'), cat0.id);
    check('…and aria-controls the categories listbox', input.getAttribute('aria-controls'), q(el, '.twm-category-picker__categories').id);
    keyOn(input, 'ArrowDown');
    check('…following it', input.getAttribute('aria-activedescendant'), qa(el, '.twm-category-picker__category')[1].id);
    keyOn(input, 'ArrowRight');
    check('back in the items column, it is the highlighted item',
          input.getAttribute('aria-activedescendant'), q(el, '.twm-category-picker__item--highlighted').id);
    check('…and aria-controls the items listbox', input.getAttribute('aria-controls'), q(el, '.twm-category-picker__items').id);

    // 3. a reopened picker draws while shown, so its highlight is scrolled into view
    keyOn(input, 'ArrowDown');                              // Parameter
    picker.close();
    const scrolled = [];
    const orig = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push([this.textContent, el.hidden]); };
    picker.open();
    window.HTMLElement.prototype.scrollIntoView = orig;
    ok('reopened: the highlight is scrolled into view while the popover is shown',
       scrolled.some(([t, hidden]) => t.includes('Parameter') && !hidden));
    ok('…and never while hidden', scrolled.every(([, hidden]) => !hidden));

    // 7. setCategories keeps the active category and highlight by id
    const reordered = CATS().reverse();                     // Empty, Functions, Model structure, Text
    reordered[2].items = [{ id: 'new', label: 'New' }, ...reordered[2].items];
    picker.setCategories(reordered);
    check('the active category is found again by id', activeCat(el), 'Model structure');
    check('…and the highlighted item', highlighted(el), 'Parameter');
    picker.setCategories(CATS().filter((c) => c.id !== 'model'));
    check('a vanished category falls back to the first one and its first item', [activeCat(el), highlighted(el)], ['Text', 'Heading']);
    picker.destroy();
    trigger.remove();

    // 8. the dot's colour is background-color
    const rules = stripComments(css('base.css'));
    const dot = rules.match(/\.twm-category-picker__dot \{([^}]*)\}/)?.[1] || '';
    ok('the dot sets background-color, not the background shorthand',
       /background-color: var\(--twm-category-picker-color/.test(dot) && !/(^|[\s;])background:/.test(dot));
}

done();
