/**
 * 0.17.0 `createTagInput` — removable chips and a text box.
 *
 *   §1  the chips it opens with; the text box and its placeholder
 *   §2  Enter commits 'a, b' as two chips, and onChange receives ['a','b'];
 *       a comma key and a blur commit too, trimmed
 *   §3  empty text is ignored; a duplicate is ignored unless allowDuplicates
 *   §4  each chip's remove button has an aria-label and removes it;
 *       Backspace in an empty box removes the last chip; moving the focus
 *       from a box holding text to a remove button keeps it on that button
 *   §5  a paste with commas is split; a paste without one is plain text
 *   §6  readOnly: chips, no remove buttons, no text box
 *   §7  setValue (no onChange), getValue copies, dispose; the barrel exports it
 *   §8  the stylesheet: the block is in base.css AND flexdesk.css
 *
 *     node tests/tag_input.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const T = await dataTableEnv('tag input');
const { check, ok, section, click, key, css, done, window } = T;
const { createTagInput } = await import('../src/ui/components/tag_input.js');

const host = () => { const h = document.createElement('div'); document.body.appendChild(h); return h; };
const chipTexts = (t) => [...t.element.querySelectorAll('.twm-tag-input__chip .twm-tag-input__text')].map((c) => c.textContent);
const removes = (t) => [...t.element.querySelectorAll('.twm-tag-input__remove')];
const make = (opts = {}) => {
    const seen = [];
    const t = createTagInput(host(), { onChange: (v) => seen.push(v), ...opts });
    return { t, seen };
};
/** The browser's typing: the value changes and `input` fires. */
const type = (input, text) => {
    for (const ch of text) {
        if (key(input, ch) === false) continue;   // the control took the key
        input.value += ch;
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
};
const paste = (input, text) => {
    const ev = new window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { getData: (k) => (k === 'text/plain' ? text : '') } });
    input.dispatchEvent(ev);
    return ev.defaultPrevented;
};

section('§1 what it opens with');
{
    const { t } = make({ value: ['x', ' y ', '', null], placeholder: 'Add a tag…', label: 'Tags' });
    check('the chips are the value, trimmed, empties left out', chipTexts(t), ['x', 'y']);
    check('getValue reads them back', t.getValue(), ['x', 'y']);
    ok('there is a text box', t.input && t.element.contains(t.input));
    check('…with the placeholder and the accessible name', [t.input.placeholder, t.input.getAttribute('aria-label')], ['Add a tag…', 'Tags']);
    ok('the root is a twm-tag-input', t.element.classList.contains('twm-tag-input'));
}

section("§2 typing 'a, b' and Enter adds two chips");
{
    const { t, seen } = make();
    t.input.value = 'a, b';
    const taken = !key(t.input, 'Enter');
    ok('Enter is taken by the control', taken);
    check('two chips', chipTexts(t), ['a', 'b']);
    check('onChange received [a, b] once', seen, [['a', 'b']]);
    check('the box is empty again', t.input.value, '');
}
{
    const { t, seen } = make();
    type(t.input, 'a, b');
    key(t.input, 'Enter');
    check('typed key by key: two chips', chipTexts(t), ['a', 'b']);
    check('…and the last onChange received [a, b]', seen.at(-1), ['a', 'b']);
    check('…the comma key committed a, Enter committed b', seen, [['a'], ['a', 'b']]);
}
{
    const { t, seen } = make({ value: ['a'] });
    t.input.value = '  c  ';
    t.input.dispatchEvent(new window.Event('blur'));
    check('a blur commits, trimmed', chipTexts(t), ['a', 'c']);
    check('…onChange has the whole list', seen, [['a', 'c']]);
}
{
    const { t, seen } = make();
    t.input.value = 'p,q';
    t.input.dispatchEvent(new window.Event('input', { bubbles: true }));
    check('a comma that arrives as input alone commits', [chipTexts(t), seen], [['p', 'q'], [['p', 'q']]]);
}
{
    const { t, seen } = make();
    const list = t.getValue();
    t.input.value = 'z';
    key(t.input, 'Enter');
    seen[0].push('mutated');
    check('onChange gets a copy', t.getValue(), ['z']);
    check('getValue gives a copy', list, []);
}

section('§3 empty text and duplicates are ignored');
{
    const { t, seen } = make({ value: ['a'] });
    t.input.value = '';
    key(t.input, 'Enter');
    t.input.value = '   ';
    key(t.input, 'Enter');
    t.input.value = ' , ,, ';
    key(t.input, 'Enter');
    t.input.dispatchEvent(new window.Event('blur'));
    check('empty text adds nothing', chipTexts(t), ['a']);
    check('…and calls no onChange', seen, []);
    check('…the box is cleared of the blanks', t.input.value, '');
}
{
    const { t, seen } = make({ value: ['a'] });
    t.input.value = 'a';
    key(t.input, 'Enter');
    check('a duplicate of a chip is ignored', [chipTexts(t), seen], [['a'], []]);
    t.input.value = 'b, b, a, c';
    key(t.input, 'Enter');
    check('…and duplicates within one commit', chipTexts(t), ['a', 'b', 'c']);
    check('…onChange once with the new list', seen, [['a', 'b', 'c']]);
}
{
    const { t, seen } = make({ value: ['a'], allowDuplicates: true });
    t.input.value = 'a, a';
    key(t.input, 'Enter');
    check('allowDuplicates keeps them', [chipTexts(t), seen], [['a', 'a', 'a'], [['a', 'a', 'a']]]);
    t.input.value = ' ';
    key(t.input, 'Enter');
    check('…but still ignores empty text', seen.length, 1);
}

section("§4 each chip's remove button");
{
    const { t, seen } = make({ value: ['alpha', 'beta', 'gamma'] });
    const btns = removes(t);
    check('one remove button per chip', btns.length, 3);
    check('each has an aria-label naming its chip', btns.map((b) => b.getAttribute('aria-label')),
          ['Remove alpha', 'Remove beta', 'Remove gamma']);
    check('…and is a type=button (never submits a form)', btns.map((b) => b.type), ['button', 'button', 'button']);
    const down = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btns[1].dispatchEvent(down);
    ok('pressing it leaves the focus in the text box (mousedown is taken)', down.defaultPrevented);
    click(btns[1]);
    check('pressing it removes that chip', chipTexts(t), ['alpha', 'gamma']);
    check('…and onChange receives the rest', seen, [['alpha', 'gamma']]);
    check('the redrawn buttons are labelled for their chips', removes(t).map((b) => b.getAttribute('aria-label')),
          ['Remove alpha', 'Remove gamma']);
    click(removes(t)[1]);
    check('…and remove the right one', chipTexts(t), ['alpha']);
}
{
    const { t } = make({ value: ['a'], removeLabel: (tag) => `Entfernen: ${tag}` });
    check('removeLabel words the aria-label', removes(t)[0].getAttribute('aria-label'), 'Entfernen: a');
}
{
    const { t, seen } = make({ value: ['a', 'b'] });
    t.input.value = 'x';
    key(t.input, 'Backspace');
    check('Backspace with text in the box is the browser’s', chipTexts(t), ['a', 'b']);
    t.input.value = '';
    ok('Backspace in an empty box is taken', !key(t.input, 'Backspace'));
    check('…and removes the last chip', [chipTexts(t), seen], [['a'], [['a']]]);
    key(t.input, 'Backspace');
    key(t.input, 'Backspace');
    check('…until there are none, then does nothing', [chipTexts(t), seen.length], [[], 2]);
}

{
    // Shift+Tab from a box holding text to the last chip's remove button:
    // the blur commits the text, and the button keeps the focus.
    const { t, seen } = make({ value: ['a', 'b'] });
    t.input.focus();
    t.input.value = 'x';
    const target = removes(t)[1];
    check('the button the focus moves to is "Remove b"', target.getAttribute('aria-label'), 'Remove b');
    target.focus();
    check('the blur committed the text', [chipTexts(t), seen], [['a', 'b', 'x'], [['a', 'b', 'x']]]);
    ok('the remove button is still in the document', target.isConnected);
    ok('…and has the focus', document.activeElement === target);
    check('the new chip got its own button', removes(t).map((b) => b.getAttribute('aria-label')),
          ['Remove a', 'Remove b', 'Remove x']);
    click(target);
    check('that button still removes its chip', chipTexts(t), ['a', 'x']);
    click(removes(t)[1]);
    check('…and the appended chip\'s button removes the appended chip', chipTexts(t), ['a']);
}

section('§5 paste');
{
    const { t, seen } = make({ value: ['a'] });
    ok('a paste with commas is taken', paste(t.input, 'b, c,,a'));
    check('…and split into chips (empties and duplicates dropped)', chipTexts(t), ['a', 'b', 'c']);
    check('…one onChange', seen, [['a', 'b', 'c']]);
    ok('a paste without a comma is the browser’s', !paste(t.input, 'plain'));
    check('…and adds no chip', chipTexts(t), ['a', 'b', 'c']);
}
{
    const { t } = make();
    t.input.value = 'pre';
    t.input.setSelectionRange(3, 3);
    paste(t.input, 'fix, next');
    check('the paste joins the text at the caret', chipTexts(t), ['prefix', 'next']);
}

section('§6 readOnly');
{
    const { t, seen } = make({ value: ['a', 'b'], readOnly: true });
    check('the chips are drawn', chipTexts(t), ['a', 'b']);
    check('…without remove buttons', removes(t).length, 0);
    ok('…and without a text box', t.input === null && !t.element.querySelector('input'));
    ok('…and the root says it is read-only', t.element.classList.contains('twm-tag-input--readonly'));
    t.setValue(['c']);
    check('setValue still redraws a read-only list', [chipTexts(t), removes(t).length, seen], [['c'], 0, []]);
}

section('§7 setValue, dispose and the barrel');
{
    const { t, seen } = make({ value: ['a'] });
    t.setValue(['x', '', 'y']);
    check('setValue replaces the chips', chipTexts(t), ['x', 'y']);
    check('…without calling onChange', seen, []);
    const h = t.element.parentNode;
    const btn = removes(t)[0];
    const input = t.input;
    t.dispose();
    ok('dispose takes it off the page', !h.contains(t.element));
    h.appendChild(t.element);
    click(btn);
    input.value = 'q';
    key(input, 'Enter');
    check('…and a disposed input changes nothing', [t.getValue(), seen], [['x', 'y'], []]);
    t.element.remove();
    const barrel = await import('../widgets.js');
    ok('@flexdesk/widgets exports createTagInput', barrel.createTagInput === createTagInput);
    let threw = false;
    try { createTagInput(null); } catch { threw = true; }
    ok('a missing host throws', threw);
}

section('§8 the stylesheet');
{
    const base = css('base.css');
    const flexdesk = css('flexdesk.css');
    const block = (sheet) => {
        const from = sheet.indexOf('/* ══ TAG INPUT (0.17.0)');
        const to = sheet.indexOf('/* ══ end TAG INPUT ══ */');
        return from >= 0 && to > from ? sheet.slice(from, to) : null;
    };
    ok('the block is in base.css', block(base));
    check('…and mirrored byte for byte into flexdesk.css', block(flexdesk), block(base));
    const body = (sel) => ruleBody(base, sel) || '';
    ok('the input wraps its chips', /flex-wrap:\s*wrap/.test(body('.twm-tag-input')));
    ok('the root declares no height', !/(^|[;\s])(height|max-height)\s*:/.test(body('.twm-tag-input')));
    ok('a long chip ellipsises', /text-overflow:\s*ellipsis/.test(body('.twm-tag-input__text')));
    ok('the text box takes the rest of the line', /flex:\s*1 1/.test(body('.twm-tag-input__input')));
}

done();
