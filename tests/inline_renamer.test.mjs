/**
 * ══ THE INLINE RENAMER HOSTS A LIST OF OPTIONS (0.18.1) ══════════════════
 *
 * `attachInputOptions` says "attach it BEFORE your own keydown listeners". The
 * renamer added its own before `onStart`, the one place a caller can reach the
 * input, so Enter on an arrow-highlighted row committed what was typed and not
 * the row: on a name where a mistyped commit means something else, the wrong thing.
 *
 *   §1  Enter on a highlighted row commits the row, once, and not the typed text
 *   §2  Enter with no row highlighted commits what was typed
 *   §3  Esc with the list open closes only the list; the next one cancels
 *   §4  the removal of the field ends the edit: no blur commit after a commit
 *       or a cancel
 *
 *     node tests/inline_renamer.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('inline renamer');
const { check, ok, section, done, key, tick, document, window } = T;
globalThis.Event = window.Event;

const { attachInlineRenamer } = await import('../src/ui/components/inline_renamer.js');
const { attachInputOptions } = await import('../src/ui/components/combobox.js');

const NAMES = ['Cash', 'Deposits', 'Loans'];

/** A renamer with a list of names on its input, as a caller attaches one. */
function renamerWithList(text = 'Ca') {
    const label = document.createElement('span');
    label.textContent = text;
    document.body.appendChild(label);
    const commits = [];
    const cancels = [];
    let input = null;
    let list = null;
    const renamer = attachInlineRenamer({
        label,
        onStart: (ctx) => {
            ({ input } = ctx);
            list = attachInputOptions(input, {
                options: NAMES.map((name) => ({ value: name })),
                debounce: 0,
                onPick: (option) => {
                    input.value = option.value;
                    renamer.commit('pick');
                },
            });
        },
        onCommit: (value, { reason }) => {
            commits.push([value, reason]);
            return { success: true };
        },
        onCancel: () => cancels.push(true),
    });
    renamer.start();
    return { label, renamer, commits, cancels, input: () => input, list: () => list };
}

section('§1 Enter on a highlighted row');
{
    const r = renamerWithList();
    r.input().focus();
    r.list().open();
    await tick();
    key(r.input(), 'ArrowDown');
    key(r.input(), 'ArrowDown');
    key(r.input(), 'Enter');
    await tick();
    check('the row is what is committed, once', r.commits, [['Deposits', 'pick']]);
    check('and shown', r.label.textContent, 'Deposits');
    r.renamer.destroy();
    r.list().destroy();
}

section('§2 Enter with nothing highlighted');
{
    const r = renamerWithList();
    r.input().value = 'Typed';
    key(r.input(), 'Enter');
    await tick();
    check('what was typed is committed', r.commits, [['Typed', 'enter']]);
    r.renamer.destroy();
    r.list().destroy();
}

section('§3 Esc');
{
    const r = renamerWithList();
    r.input().focus();
    r.list().open();
    await tick();
    key(r.input(), 'Escape');
    ok('with the list open it closes only the list', !r.list().isOpen && r.input().isConnected);
    check('and cancels nothing', r.cancels, []);
    key(r.input(), 'Escape');
    check('the next one cancels', r.cancels, [true]);
    check('and the name is back', r.label.textContent, 'Ca');
    r.renamer.destroy();
    r.list().destroy();
}

section('§4 a removal that fires blur');
{
    // Edge fires blur when a focused field leaves the page, by `remove()` or by its
    // parent's `textContent` being written. jsdom does not, so it is staged here.
    const blurFocused = () => {
        const focused = document.activeElement;
        if (focused?.tagName === 'INPUT') focused.dispatchEvent(new window.FocusEvent('blur'));
    };
    const realRemove = window.Element.prototype.remove;
    window.Element.prototype.remove = function remove() {
        if (this === document.activeElement) blurFocused();
        realRemove.call(this);
    };
    const realText = Object.getOwnPropertyDescriptor(window.Node.prototype, 'textContent');
    Object.defineProperty(window.Node.prototype, 'textContent', {
        ...realText,
        set(value) {
            if (this.contains?.(document.activeElement) && this !== document.activeElement) blurFocused();
            realText.set.call(this, value);
        },
    });
    const commits = [];
    const cancelled = attachInlineRenamer({
        label: document.body.appendChild(document.createElement('span')),
        onCommit: (value, { reason }) => {
            commits.push(reason);
            return { success: true };
        },
    });
    cancelled.start();
    let box = document.querySelector('input.twm-node-edit-input');
    box.focus();
    key(box, 'Escape');
    await tick();
    check('Esc commits nothing', commits, []);
    const committed = attachInlineRenamer({
        label: document.body.appendChild(document.createElement('span')),
        onCommit: (value, { reason }) => {
            commits.push(reason);
            return { success: true };
        },
    });
    committed.start();
    box = document.querySelector('input.twm-node-edit-input');
    box.focus();
    key(box, 'Enter');
    await tick();
    check('Enter commits once', commits, ['enter']);
    window.Element.prototype.remove = realRemove;
    Object.defineProperty(window.Node.prototype, 'textContent', realText);
}

done();
