/**
 * AN EDITOR'S KEYS, ON ITS ROOT (36 §3.10).
 *
 *   §1  Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z undo and redo, and STOP AT THE ROOT —
 *       a `window` listener (another tile's Ctrl+Z) never hears them, even
 *       from a text field, whose own undo is left alone
 *   §2  a select, a checkbox and a button have no undo of their own: Ctrl+Z
 *       there is the editor's
 *   §3  BACKSPACE IS NEVER AN EDITOR'S KEY: not handled, not prevented, not
 *       stopped — the host's page trail hears it
 *   §4  Delete, Ctrl+D/C/X/V, F2, Alt+arrows, arrows, Enter, Escape — each to
 *       its handler, and each the FIELD's inside a field
 *   §5  Enter on a button is the button's; on an editor's own item it opens
 *   §6  a handler that returns false declines; a composition is ignored;
 *       unbind removes everything
 *   §7  ownsUndo: which controls undo their own text
 *
 *     node tests/flow_kit_keys.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow kit — keys');
const { bindFlowKeys, ownsUndo, isTextField } = await import('../src/flow/kit/keys.js');
const { document, window } = t;

const root = t.host();
root.innerHTML = `
  <div class="surface" tabindex="0"></div>
  <textarea></textarea>
  <input type="text" class="text">
  <input type="number" class="num">
  <input type="checkbox" class="check">
  <select><option>a</option></select>
  <button class="plain" type="button">+</button>
  <button class="item" type="button" data-twm-flow-item>Step</button>
  <div class="ce" contenteditable="true">x</div>
  <div class="monaco-editor"><span class="inner">m</span></div>`;
const $ = (s) => root.querySelector(s);
const calls = [];
const handlers = {};
for (const name of ['undo', 'redo', 'remove', 'duplicate', 'copy', 'cut', 'paste', 'rename', 'moveUp', 'moveDown',
                    'moveOut', 'up', 'down', 'left', 'right', 'open', 'escape']) {
    handlers[name] = () => { calls.push(name); };
}
const unbind = bindFlowKeys(root, handlers);
let heardOnWindow = [];
window.addEventListener('keydown', (ev) => heardOnWindow.push(ev.key));

function press(target, key, init = {}) {
    calls.length = 0;
    heardOnWindow = [];
    const ev = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(ev);
    return { calls: [...calls], prevented: ev.defaultPrevented, window: heardOnWindow.length > 0 };
}

t.section('§1 undo and redo stop at the root');
t.check('Ctrl+Z on the surface: undo, prevented, not heard outside', press($('.surface'), 'z', { ctrlKey: true }),
        { calls: ['undo'], prevented: true, window: false });
t.check('⌘+Z too', press($('.surface'), 'z', { metaKey: true }).calls, ['undo']);
t.check('Ctrl+Y: redo', press($('.surface'), 'y', { ctrlKey: true }).calls, ['redo']);
t.check('Ctrl+Shift+Z: redo', press($('.surface'), 'Z', { ctrlKey: true, shiftKey: true }).calls, ['redo']);
for (const sel of ['textarea', '.text', '.num', '.ce', '.monaco-editor .inner']) {
    t.check(`Ctrl+Z in ${sel}: the field's own undo — not handled, not prevented, but STOPPED`,
            press($(sel), 'z', { ctrlKey: true }), { calls: [], prevented: false, window: false });
}

t.section('§2 a control with no undo of its own');
for (const sel of ['select', '.check', '.plain']) {
    t.check(`Ctrl+Z on ${sel} is the editor's`, press($(sel), 'z', { ctrlKey: true }).calls, ['undo']);
}

t.section('§3 Backspace is never an editor\'s key');
t.check('on the surface: not handled, not prevented, heard by the host',
        press($('.surface'), 'Backspace'), { calls: [], prevented: false, window: true });
t.check('on an item too', press($('.item'), 'Backspace'), { calls: [], prevented: false, window: true });

t.section('§4 the rest of the map');
const map = [
    ['Delete', {}, 'remove'], ['d', { ctrlKey: true }, 'duplicate'], ['c', { ctrlKey: true }, 'copy'],
    ['x', { ctrlKey: true }, 'cut'], ['v', { ctrlKey: true }, 'paste'], ['F2', {}, 'rename'],
    ['ArrowUp', { altKey: true }, 'moveUp'], ['ArrowDown', { altKey: true }, 'moveDown'],
    ['ArrowLeft', { altKey: true }, 'moveOut'], ['ArrowUp', {}, 'up'], ['ArrowDown', {}, 'down'],
    ['ArrowLeft', {}, 'left'], ['ArrowRight', {}, 'right'], ['Enter', {}, 'open'], ['Escape', {}, 'escape'],
];
for (const [key, init, want] of map) {
    const r = press($('.surface'), key, init);
    t.check(`${Object.keys(init).map((k) => k.replace('Key', '')).join('+')}${init.ctrlKey || init.altKey ? '+' : ''}${key} → ${want}`,
            [r.calls, r.prevented], [[want], true]);
}
for (const sel of ['textarea', '.text', 'select', '.ce']) {
    const inField = map.map(([key, init]) => press($(sel), key, init).calls).flat();
    t.check(`inside ${sel} every one of them is the field's`, inField, []);
}

t.section('§5 Enter on a button, and on an editor\'s own item');
t.check('Enter on a plain button is the button\'s', press($('.plain'), 'Enter'), { calls: [], prevented: false, window: true });
t.check('Enter on an item opens it', press($('.item'), 'Enter').calls, ['open']);

t.section('§6 declining, composing, unbinding');
{
    handlers.remove = () => false;
    const declined = press($('.surface'), 'Delete');
    t.check('a handler that returns false is not prevented', [declined.prevented, declined.window], [false, true]);
    handlers.remove = () => { calls.push('remove'); };
    t.check('a composition is ignored', press($('.surface'), 'Enter', { isComposing: true }).calls, []);
    const bare = t.host();
    const off = bindFlowKeys(bare, {});
    t.check('a key with no handler is not prevented', press(bare, 'Delete').prevented, false);
    off();
    unbind();
    t.check('unbind removes the listener', press($('.surface'), 'Delete').calls, []);
}

t.section('§7 ownsUndo and isTextField');
t.check('text-like controls own their undo', ['textarea', '.text', '.num', '.ce', '.monaco-editor .inner'].map((s) => ownsUndo($(s))),
        [true, true, true, true, true]);
t.check('these do not', ['select', '.check', '.plain', '.surface'].map((s) => ownsUndo($(s))), [false, false, false, false]);
{
    const off = document.createElement('span');
    off.setAttribute('contenteditable', 'false');
    $('.ce').appendChild(off);
    t.ok('a chip inside an editable host is still inside a text field', ownsUndo(off) && isTextField(off));
    const solo = document.createElement('span');
    solo.setAttribute('contenteditable', 'false');
    root.appendChild(solo);
    t.ok('contenteditable="false" alone is not a text field', !ownsUndo(solo) && !isTextField(solo));
}
t.ok('null is nothing', !ownsUndo(null) && !isTextField(undefined));

t.done();
