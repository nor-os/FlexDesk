/**
 * THE CHIP INPUT — chips are a view of text (36 §3.6). jsdom has a Selection
 * and no editing: the browser's own typing is simulated as the DOM change and
 * the `input` event it produces, and everything the control does ITSELF
 * (Backspace over a chip, ← →, paste, copy, Enter, its own undo) is driven
 * through the real events. The real keys, IME included, are spike S-chip in
 * headless Edge (the README's flow-kit section).
 *
 *   §1  the value is drawn as text and chips; reading it back is the text,
 *       and building it writes nothing
 *   §2  a chip reads the consumer's `describe`; an unknown one says so
 *   §3  typing a reference makes a chip, the caret where the typing ended
 *   §4  one Backspace (or Delete) removes a whole chip; elsewhere the key is
 *       the browser's
 *   §5  ← → step over a chip as one unit
 *   §6  a paste is plain text, a reference in it a chip; one line in a
 *       single-line field
 *   §7  copy and cut put the exact text on the clipboard
 *   §8  Enter: a line break in a multi-line field, nothing in a single-line one
 *   §9  its own undo and redo, from the keys and from the Edit menu
 *   §10 nothing happens during a composition, until it ends
 *   §11 read-only: nothing changes it; copying still works
 *   §12 insert() at the caret it had when it lost focus
 *   §13 formatting and drops are refused; a browser's own markup is redrawn
 *       as text
 *
 *     node tests/flow_kit_chip_input.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow kit — chip input');
const { createChipInput } = await import('../src/flow/kit/chip_input.js');
const { TEMPLATE_REFERENCES, FORMULA_REFERENCES, PARAMETER_REFERENCES, createReferenceSyntax } =
    await import('../src/flow/kit/references.js');
const { window, document } = t;

function make(value, opts = {}) {
    const seen = [];
    const input = createChipInput({ value, syntaxes: [TEMPLATE_REFERENCES], onInput: (v) => seen.push(v), ...opts });
    t.host().appendChild(input.el);
    return { input, seen, host: input.el };
}
const chips = (host) => [...host.querySelectorAll('[data-ref]')].map((c) => c.dataset.ref);
const shape = (host) => [...host.childNodes].map((n) => (n.nodeType === 3 ? `t:${n.data}`
    : n.dataset?.ref ? `c:${n.dataset.ref}` : `<${n.tagName.toLowerCase()}>`));
const key = (host, k, init = {}) => {
    const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    host.dispatchEvent(ev);
    return ev.defaultPrevented;
};
/** A clipboard event with a clipboard. */
function clip(host, type, data = {}) {
    const store = { ...data };
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: {
        getData: (k) => store[k] ?? '', setData: (k, v) => { store[k] = v; },
    } });
    host.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, store };
}
/** What the browser does when the reader types: the text node changes, the caret moves, `input` fires. */
function browserTypes(host, node, at, typed) {
    node.data = node.data.slice(0, at) + typed + node.data.slice(at);
    const r = document.createRange();
    r.setStart(node, at + typed.length);
    r.collapse(true);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    host.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: typed }));
}

t.section('§1 text and chips; reading back is the text');
{
    const { input, seen, host } = make('Hi ${a.b} and ${c}!');
    t.check('drawn as text, chip, text, chip, text', shape(host), ['t:Hi ', 'c:${a.b}', 't: and ', 'c:${c}', 't:!']);
    t.check('a chip is not editable and not draggable', [host.querySelector('[data-ref]').getAttribute('contenteditable'),
            host.querySelector('[data-ref]').getAttribute('draggable')], ['false', 'false']);
    t.check('its visible label is the path; its exact text is on hover', [host.querySelector('[data-ref]').textContent,
            host.querySelector('[data-ref]').title], ['a.b', '${a.b}']);
    t.check('the value is the text exactly', input.getValue(), 'Hi ${a.b} and ${c}!');
    t.check('building it wrote nothing', seen, []);
    t.check('a textbox, labelled, single-line by default', [host.getAttribute('role'), host.getAttribute('aria-multiline'),
            host.getAttribute('contenteditable')], ['textbox', 'false', 'true']);
    t.ok('empty is marked for the placeholder', make('', { placeholder: 'Type' }).host.classList.contains('twm-flow-chipinput--empty'));
    const two = make('[intake] = {{intake}}', { syntaxes: [FORMULA_REFERENCES, PARAMETER_REFERENCES] }).host;
    t.check('two syntaxes, two kinds of chip', chips(two), ['[intake]', '{{intake}}']);
    t.check('…in two tones, with no describe', [...two.querySelectorAll('[data-ref]')].map((c) =>
            [...c.classList].find((k) => /--(blue|violet)$/.test(k))), ['twm-flow-chip--blue', 'twm-flow-chip--violet']);
}

t.section('§2 describe');
{
    const syntax = createReferenceSyntax({
        name: 'x', pattern: TEMPLATE_REFERENCES.pattern, format: TEMPLATE_REFERENCES.format,
        describe: (m, ctx) => ({ label: `${ctx.scope} › ${m.path}`, tone: m.path.startsWith('v') ? 'amber' : 'blue',
                                 known: !m.path.startsWith('zz') }),
    });
    const { host } = make('${a} ${vault} ${zz}', { syntaxes: [syntax], describeContext: { scope: 'Run input' } });
    const [a, v, z] = host.querySelectorAll('[data-ref]');
    t.check('the consumer\'s label', a.textContent, 'Run input › a');
    t.ok('the consumer\'s tone', a.classList.contains('twm-flow-chip--blue') && v.classList.contains('twm-flow-chip--amber'));
    t.ok('an unknown reference is a chip, marked, and kept', z.classList.contains('twm-flow-chip--unknown') && z.dataset.ref === '${zz}');
}

t.section('§3 typing a reference makes a chip');
{
    const { input, seen, host } = make('to ');
    const text = host.firstChild;
    browserTypes(host, text, 3, '${a.b');
    t.check('an unfinished reference stays text', shape(host), ['t:to ${a.b']);
    browserTypes(host, host.firstChild, 8, '}');
    t.check('closing it makes a chip', shape(host), ['t:to ', 'c:${a.b}']);
    t.check('the value', input.getValue(), 'to ${a.b}');
    t.check('the caret is after the chip', input.caret(), { start: 9, end: 9 });
    t.check('every change was reported', seen, ['to ${a.b', 'to ${a.b}']);
}

t.section('§4 Backspace and Delete remove a whole chip');
{
    const { input, host } = make('a${b.c}d');
    input.restoreCaret({ start: 7, end: 7 });
    t.ok('the caret after the chip is in the text after it, at 0',
         document.getSelection().getRangeAt(0).startContainer === host.lastChild || input.caret().start === 7);
    t.ok('Backspace is prevented…', key(host, 'Backspace'));
    t.check('…and the chip is gone whole', [input.getValue(), shape(host)], ['ad', ['t:ad']]);
    t.check('the caret is where the chip began', input.caret(), { start: 1, end: 1 });
    const second = make('a${b.c}d');
    second.input.restoreCaret({ start: 1, end: 1 });
    t.ok('Delete before a chip removes it too', second.input.getValue() === 'a${b.c}d' && key(second.host, 'Delete')
         && second.input.getValue() === 'ad');
    const plain = make('abc');
    plain.input.restoreCaret({ start: 2, end: 2 });
    t.ok('Backspace in plain text is the browser\'s', !key(plain.host, 'Backspace') && plain.input.getValue() === 'abc');
    const range = make('x${a}y${b}z');
    range.input.restoreCaret({ start: 1, end: 10 });
    t.ok('a selection across chips is removed as text', key(range.host, 'Delete') && range.input.getValue() === 'xz');
}

t.section('§5 ← → step over a chip');
{
    const { input, host } = make('a${b.c}d');
    input.restoreCaret({ start: 7, end: 7 });
    t.ok('← from after the chip is prevented', key(host, 'ArrowLeft'));
    t.check('and lands before it', input.caret(), { start: 1, end: 1 });
    t.ok('→ from before it', key(host, 'ArrowRight'));
    t.check('lands after it', input.caret(), { start: 7, end: 7 });
    t.ok('→ in plain text is the browser\'s', !key(host, 'ArrowRight'));
    input.restoreCaret({ start: 7, end: 7 });
    t.ok('Shift+← is the browser\'s (it extends a selection)', !key(host, 'ArrowLeft', { shiftKey: true }));
    const two = make('${a}${b}');
    two.input.restoreCaret({ start: 4, end: 4 });
    key(two.host, 'ArrowRight');
    t.check('between two chips, → steps over the second', two.input.caret(), { start: 8, end: 8 });
}

t.section('§6 paste is plain text');
{
    const { input, seen, host } = make('say: ');
    input.restoreCaret({ start: 5, end: 5 });
    const r = clip(host, 'paste', { 'text/plain': 'hi ${a.b}\r\nthere', 'text/html': '<b>bold</b>' });
    t.ok('the paste is the control\'s', r.prevented);
    t.check('a single-line field takes it as one line; the markup is ignored', input.getValue(), 'say: hi ${a.b} there');
    t.check('the reference in it is a chip', chips(host), ['${a.b}']);
    t.check('the caret is after the paste', input.caret(), { start: 20, end: 20 });
    t.check('reported once', seen.length, 1);
    const multi = make('', { multiline: true });
    clip(multi.host, 'paste', { 'text/plain': 'a\r\nb\rc' });
    t.check('a multi-line field keeps the lines, newlines normalised', multi.input.getValue(), 'a\nb\nc');
}

t.section('§7 copy and cut give the exact text');
{
    const { input, host } = make('x ${a.b} y');
    input.restoreCaret({ start: 0, end: 10 });
    const c = clip(host, 'copy');
    t.check('copy: the text with the reference, not the chip\'s label', [c.prevented, c.store['text/plain']], [true, 'x ${a.b} y']);
    input.restoreCaret({ start: 2, end: 8 });
    const x = clip(host, 'cut');
    t.check('cut: the reference out, the field without it', [x.store['text/plain'], input.getValue()], ['${a.b}', 'x  y']);
    input.restoreCaret({ start: 1, end: 1 });
    t.ok('a collapsed copy is the browser\'s', !clip(host, 'copy').prevented);
}

t.section('§8 Enter');
{
    const multi = make('ab', { multiline: true });
    multi.input.restoreCaret({ start: 2, end: 2 });
    t.ok('Enter is the control\'s', key(multi.host, 'Enter'));
    t.check('a multi-line field gets a line break', multi.input.getValue(), 'ab\n');
    t.ok('a trailing line break is drawn with a tail, so the empty line has height',
         multi.host.lastChild.tagName === 'BR' && multi.host.lastChild.hasAttribute('data-twm-tail'));
    t.check('and the tail is not text', multi.input.getValue().length, 3);
    const single = make('ab');
    single.input.restoreCaret({ start: 1, end: 1 });
    t.ok('in a single-line field Enter is prevented and adds nothing', key(single.host, 'Enter') && single.input.getValue() === 'ab');
}

t.section('§9 its own undo');
{
    const { input, seen, host } = make('a');
    input.restoreCaret({ start: 1, end: 1 });
    clip(host, 'paste', { 'text/plain': '${b}' });
    clip(host, 'paste', { 'text/plain': 'c' });
    t.check('two pastes', input.getValue(), 'a${b}c');
    t.ok('Ctrl+Z is the field\'s', key(host, 'z', { ctrlKey: true }));
    t.check('undo: one paste back', input.getValue(), 'a${b}');
    key(host, 'z', { ctrlKey: true });
    t.check('undo: to the start', input.getValue(), 'a');
    t.ok('nothing more to undo', !input.canUndo && input.canRedo);
    key(host, 'y', { ctrlKey: true });
    t.check('Ctrl+Y redoes', input.getValue(), 'a${b}');
    host.dispatchEvent(new window.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'historyRedo' }));
    t.check('the Edit menu\'s redo, through beforeinput', input.getValue(), 'a${b}c');
    host.dispatchEvent(new window.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'historyUndo' }));
    t.check('and its undo', input.getValue(), 'a${b}');
    t.check('every undo is reported as the field\'s new text', seen.slice(-1), ['a${b}']);
    const typing = make('');
    browserTypes(typing.host, typing.host.appendChild(document.createTextNode('')), 0, 'h');
    browserTypes(typing.host, typing.host.firstChild, 1, 'i');
    key(typing.host, 'z', { ctrlKey: true });
    t.check('typing is one undo step', typing.input.getValue(), '');
}

t.section('§10 a composition is left alone until it ends');
{
    const { input, seen, host } = make('ab');
    host.dispatchEvent(new window.Event('compositionstart', { bubbles: true }));
    host.firstChild.data = 'abに';
    host.dispatchEvent(new window.InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText' }));
    t.check('nothing read during the composition', [input.getValue(), seen.length], ['ab', 0]);
    t.ok('a key during it is the IME\'s', !key(host, 'Backspace', { isComposing: true }));
    host.firstChild.data = 'ab日本';
    host.dispatchEvent(new window.Event('compositionend', { bubbles: true }));
    await t.tick(0);
    t.check('read once when it ends', [input.getValue(), seen], ['ab日本', ['ab日本']]);
}

t.section('§11 read-only');
{
    const { input, seen, host } = make('a ${b}', { readOnly: true });
    t.check('not editable', [host.getAttribute('contenteditable'), host.getAttribute('aria-readonly')], ['false', 'true']);
    input.restoreCaret({ start: 6, end: 6 });
    key(host, 'Backspace');
    clip(host, 'paste', { 'text/plain': 'x' });
    input.insert('y');
    t.check('nothing changes it', [input.getValue(), seen], ['a ${b}', []]);
    input.restoreCaret({ start: 0, end: 6 });
    t.check('copying still works', clip(host, 'copy').store['text/plain'], 'a ${b}');
    input.setReadOnly(false);
    t.check('and it can be made editable', host.getAttribute('contenteditable'), 'true');
}

t.section('§12 insert() where the caret was');
{
    const { input, host } = make('Dear , welcome');
    input.restoreCaret({ start: 5, end: 5 });
    document.dispatchEvent(new window.Event('selectionchange'));
    host.blur();
    document.getSelection().removeAllRanges();
    input.insert('${row.name}');
    t.check('inserted at the remembered caret', input.getValue(), 'Dear ${row.name}, welcome');
    t.check('drawn as a chip', chips(host), ['${row.name}']);
    t.check('the caret after it', input.caret(), { start: 16, end: 16 });
    const fresh = make('x');
    document.getSelection().removeAllRanges();
    fresh.input.insert('${y}');
    t.check('never focused: at the end', fresh.input.getValue(), 'x${y}');
    fresh.input.setValue('reset ${z}');
    t.check('setValue redraws and is no edit', [fresh.input.getValue(), chips(fresh.host), fresh.input.canUndo],
            ['reset ${z}', ['${z}'], false]);
}

t.section('§13 refused input, and the browser\'s own markup');
{
    const { input, host } = make('abc');
    const bold = new window.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'formatBold' });
    host.dispatchEvent(bold);
    t.ok('formatting is refused', bold.defaultPrevented);
    t.ok('Ctrl+B is refused', key(host, 'b', { ctrlKey: true }));
    const drop = new window.Event('drop', { bubbles: true, cancelable: true });
    host.dispatchEvent(drop);
    t.ok('a drop is refused', drop.defaultPrevented);
    // A browser that made a line of its own: <div>…</div> after the text.
    const line = document.createElement('div');
    line.appendChild(document.createTextNode('${x}'));
    host.appendChild(line);
    host.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertParagraph' }));
    t.check('read as a line break and the line', input.getValue(), 'abc\n${x}');
    t.check('and redrawn flat, with its chip', shape(host), ['t:abc\n', 'c:${x}']);
}

t.done();
