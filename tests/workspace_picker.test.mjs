/**
 * ══ THE WORKSPACE PICKER ══════════════════════════════════════════════════
 *
 *   §1  the field: name, icon, key hint, tooltip, ARIA, update; the chord is
 *       none by default and the key hint follows it
 *   §2  the field's width: centred at the room between what it avoids, at most
 *       maxWidth, the key hint gone when tight, hidden with no room
 *   §3  the switcher in place: over the anchor, centred with none or a hidden
 *       one, upward from the lower half, below through ActionDropdown
 *   §4  a local list: rows, current mark, filter with names first, action rows
 *       narrowed unless `always`, Enter when nothing but an action matches
 *   §5  the keyboard: arrows wrap and step over disabled rows, Enter, Esc gives
 *       focus back, a press outside closes, Enter before the answer lands
 *   §6  remove: bin and Shift+Delete, the highlight moves on, an async remove
 *       holds the panel open and steps it and its backdrop below dialogs, false
 *       keeps the row, a rejection is shown
 *   §7  async: loading, error, stale answers dropped, the kept answer drawn at
 *       once per cacheKey, nodes kept across answers
 *   §8  remote search: debounce, Load more, a server ignoring the paging, Enter
 *       on the first of what was typed, heading, card, footer, status, select;
 *       the list scrolls only for the keyboard, never under a mouse
 *   §9  the chord: capture phase, modifiers exact, toggles, works with the field
 *       hidden, removed on destroy; two pickers live side by side
 *   §10 nothing about state in DOM attributes; CSS: every class styled, tokens,
 *       base.css and flexdesk.css agree; no application word; docs; barrel
 *
 *     node tests/workspace_picker.test.mjs
 *
 * jsdom computes no layout, so boxes are stubbed where placement is the point.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataTableEnv } from './dt_env.mjs';
import { stripComments } from './css_rules.mjs';

const T = await dataTableEnv('workspace picker');
const { check, ok, section, done, mouse, click, key, tick, css, document, window } = T;

const { mountPickerField, createPickerSwitcher, createWorkspacePicker } = await import('../src/ui/components/workspace_picker.js');
const widgets = await import('../widgets.js');
const { DEFAULT_STATE_GUARD_CONFIG } = await import('../src/core/state_guard_config.js');

const HERE = dirname(fileURLToPath(import.meta.url));
Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

function box(el, r) {
    const full = { top: r.top ?? 0, left: r.left ?? 0, width: r.width ?? 0, height: r.height ?? 0 };
    full.right = full.left + full.width;
    full.bottom = full.top + full.height;
    el.getBoundingClientRect = () => ({ ...full, x: full.left, y: full.top, toJSON() { return full; } });
}

const host = () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
};
const anchorEl = (r = { top: 5, left: 400, width: 400, height: 24 }) => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    box(el, r);
    return el;
};
const ITEMS = () => [
    { id: 'a', name: 'North', detail: 'first place' },
    { id: 'b', name: 'South', detail: 'north of nothing' },
    { id: 'c', name: 'West', detail: 'third', disabled: true },
    { id: 'd', name: 'East', detail: 'fourth' },
];
const describe = (item) => item;
const rows = (panel) => [...panel.querySelectorAll('.twm-wspicker__list .twm-wspicker__row')];
const rowNames = (panel) => rows(panel).map((r) => r.querySelector('.twm-wspicker__row-name').textContent);
const actionRows = (panel) => [...panel.querySelectorAll('.twm-wspicker__actions .twm-wspicker__row')];
const active = (panel) => panel.querySelector('.twm-wspicker__stop--active');
const activeText = (panel) => {
    const node = active(panel);
    return node?.querySelector('.twm-wspicker__row-name')?.textContent ?? node?.textContent ?? null;
};
const typeInto = (input, text) => {
    input.value = text;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const keyIn = (sw, k, init) => key(sw.input, k, init);

section('§1 the field');
{
    const bar = host();
    let clicks = 0;
    const field = mountPickerField(bar, {
        name: 'North', icon: 'folder', keyHint: 'Ctrl+P', tooltip: 'Which one', ariaLabel: 'Switch', onActivate: () => { clicks += 1; },
    });
    ok('mounted in its host', field.el.parentElement === bar);
    check('a real button', [field.el.tagName, field.el.type], ['BUTTON', 'button']);
    check('name', field.el.querySelector('.twm-wspicker-field__name').textContent, 'North');
    check('icon', field.el.querySelector('.twm-wspicker-field__icon').textContent, 'folder');
    check('key hint', field.el.querySelector('kbd').textContent, 'Ctrl+P');
    check('tooltip', [field.el.classList.contains('twm-has-tooltip'), field.el.getAttribute('data-tooltip')], [true, 'Which one']);
    check('aria', [field.el.getAttribute('aria-label'), field.el.getAttribute('aria-haspopup'), field.el.getAttribute('aria-expanded')], ['Switch', 'dialog', 'false']);
    click(field.el);
    check('a click activates', clicks, 1);
    field.update({ name: 'n/a', muted: true, tooltip: '' });
    check('update names it', field.el.querySelector('.twm-wspicker-field__name').textContent, 'n/a');
    ok('muted', field.el.classList.contains('twm-wspicker-field--muted'));
    ok('tooltip gone', !field.el.classList.contains('twm-has-tooltip') && !field.el.hasAttribute('data-tooltip'));
    field.setOpen(true);
    check('setOpen', [field.el.classList.contains('twm-wspicker-field--open'), field.el.getAttribute('aria-expanded')], [true, 'true']);
    field.update({ keyHint: '', icon: '' });
    ok('no key hint, no icon', field.el.querySelector('kbd').hidden && field.el.querySelector('.twm-wspicker-field__icon').hidden);
    field.destroy();
    ok('destroy removes it', !field.el.isConnected);

    const withChord = createWorkspacePicker(host(), { load: () => [], describe, chord: 'Ctrl+P' });
    check('the chord is the key hint', withChord.el.querySelector('kbd').textContent, 'Ctrl+P');
    withChord.destroy();
    const without = createWorkspacePicker(host(), { load: () => [], describe });
    ok('no chord, no key hint', without.el.querySelector('kbd').hidden);
    without.destroy();
    const caret = mountPickerField(host(), { caret: true });
    ok('a caret on request', caret.el.querySelector('.twm-wspicker-field__caret'));
    caret.destroy();
}

section('§2 the field\'s width');
{
    const bar = host();
    box(bar, { left: 0, width: 1000, height: 35 });
    const left = document.createElement('div');
    left.className = 'side';
    const right = document.createElement('div');
    right.className = 'side';
    bar.append(left, right);
    box(left, { left: 0, width: 200, height: 35 });
    box(right, { left: 800, width: 200, height: 35 });
    const field = mountPickerField(bar, { layout: 'centered', avoid: '.side', keyHint: 'K' });
    ok('centred', field.el.classList.contains('twm-wspicker-field--centered'));
    check('at most maxWidth', field.el.style.width, '440px');
    ok('not tight', !field.el.classList.contains('twm-wspicker-field--tight'));

    box(left, { left: 0, width: 330, height: 35 });
    field.fit();
    check('narrows to the tighter side, less the gap', field.el.style.width, `${2 * (500 - 330) - 24}px`);
    box(left, { left: 0, width: 400, height: 35 });
    field.fit();
    check('narrower', field.el.style.width, `${2 * 100 - 24}px`);
    ok('the key hint drops', field.el.classList.contains('twm-wspicker-field--tight'));
    ok('still shown', !field.el.classList.contains('twm-wspicker-field--hidden'));
    box(left, { left: 0, width: 450, height: 35 });
    field.fit();
    ok('no room: hidden', field.el.classList.contains('twm-wspicker-field--hidden'));
    box(left, { left: 0, width: 0, height: 0 });
    box(right, { left: 620, width: 380, height: 35 });
    field.fit();
    check('an element taking no room is ignored; the right side counts', field.el.style.width, `${2 * 120 - 24}px`);
    ok('back from hidden', !field.el.classList.contains('twm-wspicker-field--hidden'));
    field.destroy();

    const inlineHost = host();
    const inline = mountPickerField(inlineHost, { keyHint: 'K', tightWidth: 200 });
    box(inline.el, { width: 150 });
    inline.fit();
    ok('inline: tight below tightWidth', inline.el.classList.contains('twm-wspicker-field--tight'));
    box(inline.el, { width: 300 });
    inline.fit();
    ok('inline: not tight above it', !inline.el.classList.contains('twm-wspicker-field--tight'));
    check('inline: its width is the host\'s', inline.el.style.width, '');
    inline.destroy();
}

section('§3 where it opens');
{
    const a = anchorEl();
    const sw = createPickerSwitcher({ anchor: a, load: () => ITEMS(), describe, minWidth: 520 });
    sw.open();
    ok('over: in the body', sw.panel.parentElement === document.body);
    ok('over: its class', sw.panel.classList.contains('twm-wspicker--over'));
    check('over: width is at least minWidth', sw.panel.style.width, '520px');
    check('over: centred on the anchor', sw.panel.style.left, `${400 + 200 - 260}px`);
    check('over: input over the field', sw.panel.style.top, '2px');
    ok('over: no dimming', document.querySelector('.twm-wspicker-backdrop').hidden);
    check('focus is in the input', document.activeElement === sw.input, true);
    sw.close();
    ok('close removes it', !sw.panel.isConnected);
    ok('and the backdrop', !document.querySelector('.twm-wspicker-backdrop'));

    box(a, { top: 770, left: 400, width: 400, height: 24 });
    sw.open();
    check('in the lower half it grows upward', [sw.panel.style.top, sw.panel.style.bottom], ['', '3px']);
    sw.close();

    box(a, { top: 5, left: 0, width: 0, height: 0 });
    sw.open();
    ok('a hidden anchor: centred', sw.panel.classList.contains('twm-wspicker--centered'));
    ok('over a dimmed page', !document.querySelector('.twm-wspicker-backdrop').hidden);
    check('with no inline placement', sw.panel.style.top, '');
    sw.destroy();

    const none = createPickerSwitcher({ load: () => [], describe });
    none.open();
    ok('no anchor: centred', none.panel.classList.contains('twm-wspicker--centered'));
    none.destroy();

    const b = anchorEl({ top: 100, left: 100, width: 100, height: 24 });
    const below = createPickerSwitcher({ anchor: b, placement: 'below', minWidth: 300, load: () => ITEMS(), describe });
    below.open();
    box(below.panel, { width: 300, height: 200 });
    window.dispatchEvent(new window.Event('resize'));
    ok('below: its class', below.panel.classList.contains('twm-wspicker--below'));
    check('below: under the anchor', parseInt(below.panel.style.top, 10) >= 124, true);
    check('below: width', below.panel.style.width, '300px');
    below.destroy();

    const moving = anchorEl();
    const follows = createPickerSwitcher({ anchor: moving, load: () => [], describe });
    follows.open();
    box(moving, { top: 5, left: 100, width: 400, height: 24 });
    window.dispatchEvent(new window.Event('resize'));
    ok('a resize places it again', follows.isOpen && follows.panel.style.left === '40px');
    follows.destroy();
}

section('§4 a local list');
{
    const picks = [];
    const verbs = [];
    let loads = 0;
    const sw = createPickerSwitcher({
        load: () => { loads += 1; return ITEMS(); },
        describe: (item, { current }) => ({ ...item, icon: current ? 'folder_open' : 'folder', badge: current ? 'current' : '' }),
        onPick: (item) => picks.push(item.id),
        actions: ({ query }) => [
            { id: 'new', label: 'Create one', icon: 'add', run: () => verbs.push('new') },
            { id: 'add', label: query ? `Add “${query}”` : 'Add', icon: 'add', always: true, run: (ctx) => verbs.push(`add:${ctx.query}`) },
        ],
    });
    sw.setCurrent(ITEMS()[0]);
    sw.open();
    await tick();
    check('rows, in the order answered', rowNames(sw.panel), ['North', 'South', 'West', 'East']);
    check('then the actions', actionRows(sw.panel).map((r) => r.querySelector('.twm-wspicker__row-name').textContent), ['Create one', 'Add']);
    const [first, second] = rows(sw.panel);
    ok('the current one is marked', first.classList.contains('twm-wspicker__row--current') && !first.querySelector('.twm-wspicker__row-check').hidden);
    ok('and only it', !second.classList.contains('twm-wspicker__row--current') && second.querySelector('.twm-wspicker__row-check').hidden);
    check('aria-selected', [first.getAttribute('aria-selected'), second.getAttribute('aria-selected')], ['true', 'false']);
    check('describe knows it is current', [first.querySelector('.twm-wspicker__row-icon').textContent, first.querySelector('.twm-wspicker__row-badge').textContent], ['folder_open', 'current']);
    check('second line', second.querySelector('.twm-wspicker__row-detail').textContent, 'north of nothing');
    check('the first is highlighted', activeText(sw.panel), 'North');

    typeInto(sw.input, 'NORTH');
    check('filter: case-insensitive, names ahead of details', rowNames(sw.panel), ['North', 'South']);
    check('the highlight is the first match', activeText(sw.panel), 'North');
    check('an action narrowed by typing, one that is always stays', actionRows(sw.panel).map((r) => r.querySelector('.twm-wspicker__row-name').textContent), ['Add “NORTH”']);
    check('typing did not ask again', loads, 1);

    typeInto(sw.input, 'zzz');
    check('nothing matches', rowNames(sw.panel), []);
    check('says so', sw.panel.querySelector('.twm-wspicker__note').textContent, 'Nothing matches “zzz”.');
    check('the highlight is the action', activeText(sw.panel), 'Add “zzz”');
    keyIn(sw, 'Enter');
    check('Enter runs it, with the query', verbs, ['add:zzz']);
    ok('having closed first', !sw.isOpen);

    sw.open();
    await tick();
    click(rows(sw.panel)[1]);
    check('a click on another row picks', picks, ['b']);
    ok('and closes', !sw.isOpen);
    sw.open();
    await tick();
    click(rows(sw.panel)[0]);
    check('the current one closes and does not pick', [picks.length, sw.isOpen], [1, false]);
    sw.open();
    await tick();
    click(rows(sw.panel)[2]);
    check('a disabled row does nothing', [picks.length, sw.isOpen], [1, true]);
    sw.destroy();

    const kw = createPickerSwitcher({ load: () => [{ id: 1, name: 'One', keywords: ['alpha', 'beta'] }, { id: 2, name: 'Two', keywords: 'gamma' }], describe });
    kw.open();
    await tick();
    typeInto(kw.input, 'gam');
    check('keywords are searched, not drawn', rowNames(kw.panel), ['Two']);
    typeInto(kw.input, 'beta');
    check('a list of them too', rowNames(kw.panel), ['One']);
    kw.destroy();
}

section('§5 the keyboard');
{
    const picks = [];
    const a = anchorEl();
    const sw = createPickerSwitcher({
        anchor: a,
        load: () => ITEMS(),
        describe,
        onPick: (item) => picks.push(item.id),
        actions: () => [{ id: 'x', label: 'Act', run: () => {} }],
        footer: () => ({ end: [{ id: 'f', label: 'All of them', run: () => picks.push('foot') }] }),
    });
    sw.open();
    await tick();
    keyIn(sw, 'ArrowDown');
    check('down', activeText(sw.panel), 'South');
    keyIn(sw, 'ArrowDown');
    check('steps over a disabled row', activeText(sw.panel), 'East');
    keyIn(sw, 'ArrowDown');
    check('on to the actions', activeText(sw.panel), 'Act');
    keyIn(sw, 'ArrowDown');
    check('on to the footer', activeText(sw.panel).includes('All of them'), true);
    keyIn(sw, 'ArrowDown');
    check('wraps', activeText(sw.panel), 'North');
    keyIn(sw, 'ArrowUp');
    check('wraps back', activeText(sw.panel).includes('All of them'), true);
    keyIn(sw, 'Enter');
    check('Enter runs a footer verb', picks, ['foot']);
    ok('having closed', !sw.isOpen);

    sw.open();
    await tick();
    ok('aria-activedescendant follows', sw.input.getAttribute('aria-activedescendant') === active(sw.panel).id);
    keyIn(sw, 'ArrowDown');
    keyIn(sw, 'Enter');
    check('Enter picks the highlighted row', picks, ['foot', 'b']);

    a.focus();
    sw.open();
    await tick();
    const stopped = [];
    const onDoc = (e) => stopped.push(e.key);
    document.addEventListener('keydown', onDoc);
    keyIn(sw, 'Escape');
    document.removeEventListener('keydown', onDoc);
    ok('Esc closes', !sw.isOpen);
    check('and does not reach the page', stopped, []);
    ok('focus goes back', document.activeElement === a);

    const editor = document.createElement('textarea');
    document.body.appendChild(editor);
    editor.focus();
    sw.open();
    await tick();
    keyIn(sw, 'Escape');
    ok('to where it was, not always the anchor', document.activeElement === editor);
    editor.remove();

    sw.open();
    await tick();
    mouse('mousedown', rows(sw.panel)[0]);
    ok('a press inside does not close', sw.isOpen);
    const outside = host();
    let reached = 0;
    outside.addEventListener('mousedown', (e) => { reached += 1; e.stopPropagation(); });
    mouse('mousedown', outside);
    ok('a press outside closes, even one that stops the event', !sw.isOpen);
    check('and goes through', reached, 1);

    sw.open();
    await tick();
    const backspace = sw.panel.querySelector('.twm-wspicker__foot-btn');
    const ev = new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    let up = 0;
    const onUp = () => { up += 1; };
    document.addEventListener('keydown', onUp);
    backspace.dispatchEvent(ev);
    document.removeEventListener('keydown', onUp);
    check('Backspace on a button stops at the panel', up, 0);
    sw.close();

    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    sw.open();
    await tick();
    sw.panel.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: elsewhere }));
    ok('Tab out of the panel closes', !sw.isOpen);
    sw.open();
    await tick();
    sw.panel.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: a }));
    ok('to its anchor does not', sw.isOpen);
    sw.destroy();

    // Enter before the answer lands
    let answer;
    const picked = [];
    const slow = createPickerSwitcher({
        load: () => new Promise((resolve) => { answer = resolve; }),
        describe,
        onPick: (item) => picked.push(item.id),
    });
    slow.open();
    keyIn(slow, 'Enter');
    check('Enter before the answer waits', picked, []);
    answer(ITEMS());
    await tick();
    check('and takes the first when it lands', picked, ['a']);
    slow.destroy();

    // IME composition does not pick
    const ime = createPickerSwitcher({ load: () => ITEMS(), describe, onPick: (item) => picked.push(item.id) });
    ime.open();
    await tick();
    const composing = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
    ime.input.dispatchEvent(composing);
    ok('Enter that ends a composition picks nothing', ime.isOpen);
    ime.destroy();
}

section('§6 remove');
{
    let list = ITEMS();
    let loads = 0;
    const removed = [];
    const sw = createPickerSwitcher({
        load: () => { loads += 1; return list; },
        describe: (item) => ({ ...item, removable: item.id !== 'd' }),
        onRemove: (item) => {
            removed.push(item.id);
            list = list.filter((x) => x.id !== item.id);
        },
        labels: { remove: (name) => `Forget ${name}` },
    });
    sw.open();
    await tick();
    const bins = rows(sw.panel).map((r) => r.querySelector('.twm-wspicker__row-remove'));
    check('a bin where removable', bins.map((b) => b.hidden), [false, false, false, true]);
    check('its words are the caller\'s', bins[0].getAttribute('aria-label'), 'Forget North');
    keyIn(sw, 'ArrowDown');
    keyIn(sw, 'Delete', { shiftKey: true });
    await tick();
    await tick();
    check('Shift+Delete removes the highlighted row', removed, ['b']);
    check('the row goes', rowNames(sw.panel), ['North', 'West', 'East']);
    check('it asked again', loads, 2);
    check('the highlight moves on to the next one', activeText(sw.panel), 'East');
    ok('the panel stays', sw.isOpen);
    ok('focus stays in the input', document.activeElement === sw.input);
    click(rows(sw.panel)[0].querySelector('.twm-wspicker__row-remove'));
    await tick();
    await tick();
    check('the bin removes, and does not pick', [removed, sw.isOpen], [['b', 'a'], true]);
    sw.destroy();

    const none = createPickerSwitcher({ load: () => ITEMS(), describe });
    none.open();
    await tick();
    ok('no onRemove, no bins', rows(none.panel).every((r) => r.querySelector('.twm-wspicker__row-remove').hidden));
    keyIn(none, 'Delete', { shiftKey: true });
    ok('Shift+Delete does nothing', none.isOpen);
    none.destroy();

    let settle;
    const asking = createPickerSwitcher({
        load: () => ITEMS(),
        describe,
        onRemove: () => new Promise((resolve, reject) => { settle = { resolve, reject }; }),
    });
    asking.open();
    await tick();
    click(rows(asking.panel)[0].querySelector('.twm-wspicker__row-remove'));
    ok('waiting on it: below dialogs', asking.panel.classList.contains('twm-wspicker--waiting'));
    mouse('mousedown', host());
    ok('a press in the dialog does not close', asking.isOpen);
    const dialogFocus = document.createElement('button');
    document.body.appendChild(dialogFocus);
    asking.panel.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: dialogFocus }));
    ok('nor does focus going to it', asking.isOpen);
    key(document.body, 'Escape');
    ok('nor Esc answering it', asking.isOpen);
    settle.resolve(false);
    await tick();
    ok('settled: back on top', !asking.panel.classList.contains('twm-wspicker--waiting'));
    check('false keeps the row', rowNames(asking.panel).length, 4);
    ok('focus returns to the input', document.activeElement === asking.input);

    click(rows(asking.panel)[0].querySelector('.twm-wspicker__row-remove'));
    settle.reject(new Error('refused'));
    await tick();
    check('a rejection is shown', asking.panel.querySelector('.twm-wspicker__note').textContent, 'Could not remove it. refused');
    ok('as an error', asking.panel.querySelector('.twm-wspicker__note').classList.contains('twm-wspicker__note--error'));
    check('and keeps the row', rowNames(asking.panel).length, 4);
    asking.destroy();

    // A dialog takes focus while onRemove is still running, before it returns.
    const dialog = document.createElement('button');
    document.body.appendChild(dialog);
    const eager = createPickerSwitcher({
        load: () => ITEMS(),
        describe,
        onRemove: async () => {
            eager.panel.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: dialog }));
            return false;
        },
    });
    eager.open();
    await tick();
    click(rows(eager.panel)[0].querySelector('.twm-wspicker__row-remove'));
    ok('focus leaving during the call does not close it', eager.isOpen);
    await tick();
    ok('and it is back on top afterwards', eager.isOpen && !eager.panel.classList.contains('twm-wspicker--waiting'));
    eager.destroy();

    // Centred, the dimmed page lies over the dialog unless it steps down too.
    let answer;
    const centred = createPickerSwitcher({
        load: () => ITEMS(),
        describe,
        onRemove: () => new Promise((resolve) => { answer = resolve; }),
    });
    centred.open();
    await tick();
    const dim = document.querySelector('.twm-wspicker-backdrop');
    ok('centred: the page is dimmed', !dim.hidden);
    click(rows(centred.panel)[0].querySelector('.twm-wspicker__row-remove'));
    ok('waiting: the backdrop steps down with the panel', dim.classList.contains('twm-wspicker-backdrop--waiting'));
    mouse('mousedown', dim);
    ok('a press on it does not close', centred.isOpen);
    answer(false);
    await tick();
    ok('settled: the backdrop is back on top', !dim.classList.contains('twm-wspicker-backdrop--waiting'));
    click(rows(centred.panel)[0].querySelector('.twm-wspicker__row-remove'));
    centred.close();
    ok('closed while waiting: nothing stays stepped down', !centred.panel.classList.contains('twm-wspicker--waiting') && !dim.classList.contains('twm-wspicker-backdrop--waiting'));
    answer(false);
    await tick();
    centred.destroy();
}

section('§7 async');
{
    const answers = [];
    const signals = [];
    const sw = createPickerSwitcher({
        load: ({ signal }) => {
            signals.push(signal);
            return new Promise((resolve, reject) => answers.push({ resolve, reject }));
        },
        describe,
        labels: { loading: 'Hold on', empty: () => 'None yet', failed: (err) => `Broke: ${err.message}` },
    });
    sw.open();
    check('loading', sw.panel.querySelector('.twm-wspicker__note').textContent, 'Hold on');
    answers[0].reject(new Error('no route'));
    await tick();
    check('error', sw.panel.querySelector('.twm-wspicker__note').textContent, 'Broke: no route');
    ok('as an error', sw.panel.querySelector('.twm-wspicker__note').classList.contains('twm-wspicker__note--error'));
    sw.reload();
    await tick();
    check('reload asks again', answers.length, 2);
    ok('the older signal is aborted', signals[0].aborted);
    sw.reload();
    ok('a newer question aborts the older', signals[1].aborted);
    answers[2].resolve([]);
    await tick();
    check('empty', sw.panel.querySelector('.twm-wspicker__note').textContent, 'None yet');
    answers[1].resolve(ITEMS());
    await tick();
    check('an older answer paints nothing', rowNames(sw.panel), []);
    sw.close();
    sw.open();
    sw.close();
    answers[3].resolve(ITEMS());
    await tick();
    ok('an answer after closing paints nothing', !sw.panel.isConnected);
    ok('closing aborted it', signals[3].aborted);
    sw.destroy();

    // The kept answer and the nodes
    let scope = 'x';
    let call = 0;
    const pending = [];
    const cached = createPickerSwitcher({
        cacheKey: () => scope,
        load: () => {
            call += 1;
            if (call === 1) return [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
            return new Promise((resolve) => pending.push(resolve));
        },
        describe,
    });
    cached.open();
    await tick();
    cached.close();
    cached.open();
    check('the last answer is drawn at once', rowNames(cached.panel), ['A', 'B']);
    const node = rows(cached.panel)[0];
    let picked = false;
    node.addEventListener('click', () => { picked = true; });
    pending[0]([{ id: 'c', name: 'C' }, { id: 'a', name: 'A renamed' }]);
    await tick();
    check('the fresh answer replaces it', rowNames(cached.panel), ['C', 'A renamed']);
    ok('a row that stayed keeps its node', rows(cached.panel)[1] === node);
    ok('not re-created under a pointer', !picked);
    cached.close();
    scope = 'y';
    cached.open();
    check('another cacheKey draws nothing of the other\'s', rowNames(cached.panel), []);
    cached.destroy();

    const dupes = createPickerSwitcher({ load: () => [{ id: 1, name: 'A' }, { id: 1, name: 'A' }], describe });
    dupes.open();
    await tick();
    check('duplicates are drawn once', rowNames(dupes.panel), ['A']);
    dupes.destroy();
}

section('§8 remote search');
{
    const asks = [];
    const all = Array.from({ length: 45 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` }));
    const picks = [];
    const verbs = [];
    const sw = createPickerSwitcher({
        search: 'remote',
        pageSize: 20,
        debounceMs: 5,
        load: async ({ query, offset, limit, signal }) => {
            asks.push({ query, offset, limit, aborted: signal.aborted });
            const hits = all.filter((r) => r.name.includes(query));
            return { items: hits.slice(offset, offset + limit), total: hits.length, status: query ? '' : { text: 'all of them', error: false } };
        },
        describe,
        onPick: (item) => picks.push(item.id),
        visibleRows: 5,
        heading: ({ query, shown, total }) => ({ title: query ? `Matching ${query}` : 'Everything', count: total == null ? '' : `${shown} of ${total}` }),
        card: ({ current, row }) => (current ? {
            heading: 'Manage', icon: 'tune', name: current.name, detail: row ? 'in the list' : 'not loaded',
            open: { label: 'Open', icon: 'open_in_new', run: () => verbs.push('open') },
            columns: 3,
            tiles: [{ id: 'one', label: 'Members', icon: 'group', run: () => verbs.push('one') }],
        } : null),
        footer: () => ({
            start: [{ id: 'new', label: 'New', icon: 'add', primary: true, run: () => verbs.push('new') }],
            end: [{ id: 'all', label: 'All', trailing: 'arrow_forward', run: () => verbs.push('all') }],
            keys: [{ keys: ['Esc'], label: 'close' }],
        }),
    });
    sw.setCurrent({ id: 'r30', name: 'Row 30' });
    sw.open();
    await tick();
    check('the first page', [rows(sw.panel).length, asks[0]], [20, { query: '', offset: 0, limit: 20, aborted: false }]);
    check('heading and count', [sw.panel.querySelector('.twm-wspicker__title').textContent, sw.panel.querySelector('.twm-wspicker__count').textContent], ['Everything', '20 of 45']);
    check('five rows in view', [sw.panel.querySelector('.twm-wspicker__scroll').style.getPropertyValue('--twm-wspicker-rows'), sw.panel.querySelector('.twm-wspicker__scroll').classList.contains('twm-wspicker__scroll--capped')], ['5', true]);
    const more = sw.panel.querySelector('.twm-wspicker__more');
    ok('Load more is offered', !more.hidden);
    check('its words', more.textContent.includes('Load 20 more · 20 of 45 shown'), true);
    check('the status line', sw.panel.querySelector('.twm-wspicker__status').textContent, 'all of them');

    // The card, naming one no page holds
    check('the current one is named whether or not a page holds it', [sw.panel.querySelector('.twm-wspicker__card-name').textContent, sw.panel.querySelector('.twm-wspicker__card-detail').textContent], ['Row 30', 'not loaded']);
    check('tile columns', sw.panel.querySelector('.twm-wspicker__tiles').style.getPropertyValue('--twm-wspicker-columns'), '3');
    ok('primary verb', sw.panel.querySelector('.twm-wspicker__foot-btn').classList.contains('twm-btn--primary'));
    ok('key hints are in the footer, for the stylesheet to show when centred', sw.panel.querySelectorAll('.twm-wspicker__key-hint').length === 1);

    const firstRow = rows(sw.panel)[0];
    click(more);
    await tick();
    check('Load more appends', [rows(sw.panel).length, asks[1].offset], [40, 20]);
    ok('without rebuilding', rows(sw.panel)[0] === firstRow);
    check('the card sees it now', sw.panel.querySelector('.twm-wspicker__card-detail').textContent, 'in the list');
    click(more);
    await tick();
    check('to the end', [rows(sw.panel).length, more.hidden], [45, true]);

    typeInto(sw.input, 'Row 1');
    check('typing waits', asks.length, 3);
    typeInto(sw.input, 'Row 2');
    await tick(20);
    check('debounced to the last', asks.map((a) => a.query).slice(3), ['Row 2']);
    check('heading follows the answer', sw.panel.querySelector('.twm-wspicker__title').textContent, 'Matching Row 2');
    check('rows are the server\'s', rowNames(sw.panel)[0], 'Row 2');
    ok('a remote search does not filter locally', rowNames(sw.panel).includes('Row 20'));

    typeInto(sw.input, 'Row 44');
    keyIn(sw, 'Enter');
    await tick();
    check('Enter asks for what was typed and takes its first', picks, ['r44']);
    ok('closed', !sw.isOpen);
    await tick(20);
    check('the debounce was cancelled', asks.filter((a) => a.query === 'Row 44').length, 1);

    sw.open();
    await tick();
    click(sw.panel.querySelector('.twm-wspicker__card-open'));
    check('the card\'s Open', verbs, ['open']);
    ok('closed first', !sw.isOpen);
    sw.open();
    await tick();
    click(sw.panel.querySelector('.twm-wspicker__tile'));
    check('a tile', verbs, ['open', 'one']);
    sw.open();
    await tick();
    click(sw.panel.querySelectorAll('.twm-wspicker__foot-btn')[1]);
    check('a footer verb', verbs, ['open', 'one', 'all']);
    sw.open();
    await tick();
    keyIn(sw, 'ArrowUp');
    check('the arrows reach the footer', activeText(sw.panel).includes('All'), true);
    keyIn(sw, 'Enter');
    check('and Enter runs it', verbs.length, 4);
    sw.setCurrent(null);
    sw.open();
    await tick();
    ok('no current, no card', sw.panel.querySelector('.twm-wspicker__card').hidden);
    sw.destroy();

    // A server that ignores the paging
    let calls = 0;
    const stubborn = createPickerSwitcher({
        search: 'remote',
        load: async () => { calls += 1; return { items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }], total: 99 }; },
        describe,
    });
    stubborn.open();
    await tick();
    const stubbornMore = stubborn.panel.querySelector('.twm-wspicker__more');
    keyIn(stubborn, 'ArrowDown');
    keyIn(stubborn, 'ArrowDown');
    check('Load more is a stop', active(stubborn.panel) === stubbornMore, true);
    keyIn(stubborn, 'Enter');
    await tick();
    check('it asked', calls, 2);
    ok('handing back what is drawn means there is no more', stubbornMore.hidden);
    stubborn.destroy();

    // A failed page keeps what is drawn
    let page = 0;
    const broken = createPickerSwitcher({
        search: 'remote',
        load: async () => {
            page += 1;
            if (page === 2) throw new Error('later');
            return { items: [{ id: 1, name: 'A' }], total: 5 };
        },
        describe,
    });
    broken.open();
    await tick();
    click(broken.panel.querySelector('.twm-wspicker__more'));
    await tick();
    check('a failed page says so', broken.panel.querySelector('.twm-wspicker__note').textContent, 'The next page could not be read. later');
    check('keeps the rows', rowNames(broken.panel), ['A']);
    ok('and hides Load more', broken.panel.querySelector('.twm-wspicker__more').hidden);
    broken.destroy();

    // Local: a `total` means nothing, `select`, `status`
    const local = createPickerSwitcher({
        load: () => ({ items: ITEMS(), total: 99, status: { text: 'read with errors', error: true } }),
        describe,
        footer: () => ({ keys: [{ keys: ['Enter'], label: 'open' }] }),
    });
    local.open({ select: 'd' });
    await tick();
    check('select highlights a row when the answer lands', activeText(local.panel), 'East');
    ok('no Load more in a local list', local.panel.querySelector('.twm-wspicker__more').hidden);
    ok('an error status', local.panel.querySelector('.twm-wspicker__status').classList.contains('twm-wspicker__status--error'));
    ok('keys show when centred', !local.panel.querySelector('.twm-wspicker__foot').hidden);
    local.destroy();

    let cardAsked = 0;
    const refreshing = createPickerSwitcher({ load: () => [], describe, card: () => { cardAsked += 1; return null; } });
    refreshing.open();
    await tick();
    const before = cardAsked;
    refreshing.refresh();
    check('refresh asks the card again', cardAsked, before + 1);
    refreshing.destroy();
}

section('§8 the list scrolls only for the keyboard');
{
    const reveals = [];
    window.HTMLElement.prototype.scrollIntoView = function reveal() { reveals.push(this); };
    const ALL = Array.from({ length: 45 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` }));
    const pages = ({ query, offset, limit }) => {
        const hits = ALL.filter((r) => r.name.includes(query));
        return Promise.resolve({ items: hits.slice(offset, offset + limit), total: hits.length });
    };
    const sw = createPickerSwitcher({ load: pages, describe, search: 'remote', debounceMs: 0, onRemove: () => {}, card: () => null });
    const scroller = sw.panel.querySelector('.twm-wspicker__scroll');
    const moreBtn = sw.panel.querySelector('.twm-wspicker__more');
    sw.open();
    await tick();
    reveals.length = 0;

    scroller.scrollTop = 596;
    click(moreBtn);
    check('Load more by the mouse: not during the load', scroller.scrollTop, 596);
    await tick();
    check('nor after it', [scroller.scrollTop, rows(sw.panel).length, reveals.length], [596, 40, 0]);
    check('the highlight stayed where it was', activeText(sw.panel), 'Row 0');

    sw.refresh();
    check('refresh leaves the scroll', [scroller.scrollTop, reveals.length], [596, 0]);
    sw.setCurrent(ALL[3]);
    check('setCurrent leaves it', [scroller.scrollTop, reveals.length], [596, 0]);
    sw.setCurrent(null);
    sw.reload();
    await tick();
    check('so does asking the same thing again', [scroller.scrollTop, reveals.length], [596, 0]);

    click(rows(sw.panel)[5].querySelector('.twm-wspicker__row-remove'));
    await tick();
    check('so does a bin clicked with the mouse', [scroller.scrollTop, reveals.length], [596, 0]);

    keyIn(sw, 'ArrowDown');
    check('the arrows bring the highlight into view', reveals.at(-1), active(sw.panel));

    reveals.length = 0;
    typeInto(sw.input, 'Row 1');
    check('typing goes back to the top', [scroller.scrollTop, reveals.length], [0, 0]);
    await new Promise((r) => setTimeout(r, 5));
    scroller.scrollTop = 40;
    typeInto(sw.input, 'Row 2');
    scroller.scrollTop = 40;
    await new Promise((r) => setTimeout(r, 5));
    check('a new query\'s answer starts at the top', scroller.scrollTop, 0);
    sw.close();

    // Enter on Load more keeps the highlight in view, page after page.
    const paged = createPickerSwitcher({ load: pages, describe, search: 'remote' });
    paged.open();
    await tick();
    for (let i = 0; i < 20; i += 1) keyIn(paged, 'ArrowDown');
    check('the arrows reach Load more', active(paged.panel) === paged.panel.querySelector('.twm-wspicker__more'), true);
    reveals.length = 0;
    keyIn(paged, 'Enter');
    await tick();
    check('Enter on it: it stays highlighted and in view', reveals.at(-1) === paged.panel.querySelector('.twm-wspicker__more'), true);
    reveals.length = 0;
    keyIn(paged, 'Enter');
    await tick();
    check('the last page: the highlight is on the first row it brought', activeText(paged.panel), 'Row 40');
    check('and in view', reveals.at(-1) === active(paged.panel), true);
    check('without a stop at the top on the way', reveals.includes(rows(paged.panel)[0]), false);
    paged.close();

    // The mouse on Load more while the highlight is on it.
    paged.open();
    await tick();
    for (let i = 0; i < 20; i += 1) keyIn(paged, 'ArrowDown');
    reveals.length = 0;
    click(paged.panel.querySelector('.twm-wspicker__more'));
    await tick();
    check('clicked while highlighted: no scroll', reveals.length, 0);
    paged.close();

    // open({ select }) reaches a row out of view, and only then.
    paged.open({ select: 'r15' });
    await tick();
    check('select brings its row into view', reveals.at(-1) === active(paged.panel), true);
    check('that row', activeText(paged.panel), 'Row 15');
    paged.close();

    // The row the arrows chose goes away: the highlight is brought back into view.
    let fewer = false;
    const shrinking = createPickerSwitcher({ load: () => (fewer ? ALL.slice(0, 2) : ALL.slice(0, 10)), describe });
    shrinking.open();
    await tick();
    for (let i = 0; i < 5; i += 1) keyIn(shrinking, 'ArrowDown');
    reveals.length = 0;
    fewer = true;
    shrinking.reload();
    await tick();
    check('its highlight falls to the first row, shown', [activeText(shrinking.panel), reveals.at(-1) === active(shrinking.panel)], ['Row 0', true]);
    shrinking.destroy();
    paged.destroy();
    sw.destroy();
    delete window.HTMLElement.prototype.scrollIntoView;
}

section('§9 the chord, and two pickers');
{
    const bar = host();
    const picker = createWorkspacePicker(bar, {
        field: { icon: 'folder', placeholder: 'None open', tooltip: 'Which one' },
        chord: 'Ctrl+P',
        label: 'Switch',
        load: () => ITEMS(),
        describe,
    });
    const nameOf = () => picker.el.querySelector('.twm-wspicker-field__name').textContent;
    check('the placeholder, while nothing is current', nameOf(), 'None open');
    ok('muted', picker.el.classList.contains('twm-wspicker-field--muted'));
    check('its accessible name is the label', picker.el.getAttribute('aria-label'), 'Switch');
    picker.setCurrent(ITEMS()[0]);
    check('setCurrent names it', nameOf(), 'North');
    ok('not muted', !picker.el.classList.contains('twm-wspicker-field--muted'));
    check('the fixed icon stays', picker.el.querySelector('.twm-wspicker-field__icon').textContent, 'folder');

    click(picker.el);
    ok('a click opens', picker.isOpen);
    check('the field shows it', [picker.el.classList.contains('twm-wspicker-field--open'), picker.el.getAttribute('aria-expanded')], [true, 'true']);
    picker.close();
    ok('closed: the field shows that too', !picker.el.classList.contains('twm-wspicker-field--open'));

    const chord = (init) => {
        const e = new window.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true, ...init });
        document.body.dispatchEvent(e);
        return e;
    };
    const first = chord();
    ok('the chord opens', picker.isOpen);
    ok('and takes the key from the page', first.defaultPrevented);
    chord();
    ok('and closes', !picker.isOpen);
    chord({ repeat: true });
    ok('a held key does not flicker', !picker.isOpen);
    chord({ shiftKey: true });
    ok('Ctrl+Shift+P is another chord', !picker.isOpen);
    chord({ key: 'o' });
    ok('another key', !picker.isOpen);
    chord({ ctrlKey: false });
    ok('no Ctrl', !picker.isOpen);
    chord({ ctrlKey: false, metaKey: true });
    ok('Cmd answers for Ctrl', picker.isOpen);
    picker.close();

    let stopped = 0;
    const stopper = document.createElement('div');
    document.body.appendChild(stopper);
    stopper.addEventListener('keydown', (e) => { stopped += 1; e.stopPropagation(); });
    stopper.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }));
    ok('capture phase: ahead of an editor that stops the event', picker.isOpen);
    check('which never hears it', stopped, 0);
    picker.close();

    picker.field.el.classList.add('twm-wspicker-field--hidden');
    box(picker.el, { width: 0 });
    chord();
    ok('with the field hidden the chord still opens, centred', picker.switcher.panel.classList.contains('twm-wspicker--centered'));
    picker.close();

    picker.destroy();
    ok('destroy removes the field', !picker.el.isConnected);
    chord();
    ok('and the chord', !document.querySelector('.twm-wspicker'));

    const defaultless = createWorkspacePicker(host(), { load: () => [], describe });
    chord();
    ok('no chord by default', !defaultless.isOpen);
    defaultless.destroy();

    let threw = false;
    try { createWorkspacePicker(host(), { load: () => [], describe, chord: 'Hyper+P' }); } catch { threw = true; }
    ok('a chord it cannot read is an error', threw);

    // Two pickers, the second's list depending on the first's choice
    const row2 = host();
    const scopes = { x: [{ id: 'x1', name: 'X one' }], y: [{ id: 'y1', name: 'Y one' }] };
    const inner = createWorkspacePicker(row2, {
        field: { placeholder: 'None', caret: true },
        placement: 'below',
        minWidth: 200,
        cacheKey: () => outer.current?.id ?? '',
        load: () => scopes[outer.current?.id] ?? [],
        describe: (i) => ({ ...i, icon: 'layers' }),
        onPick: (item) => inner.setCurrent(item),
    });
    const outer = createWorkspacePicker(row2, {
        field: { placeholder: 'None', caret: true },
        placement: 'below',
        minWidth: 200,
        load: () => [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }],
        describe,
        onPick: (item) => { outer.setCurrent(item); inner.setCurrent(null); },
    });
    box(outer.el, { top: 5, left: 10, width: 100, height: 24 });
    box(inner.el, { top: 5, left: 120, width: 100, height: 24 });
    outer.open();
    await tick();
    mouse('mousedown', inner.el);
    ok('a press on the other closes this one', !outer.isOpen);
    click(inner.el);
    ok('and opens that one', inner.isOpen);
    inner.close();
    outer.open();
    await tick();
    click(rows(outer.switcher.panel)[1]);
    inner.open();
    await tick();
    check('the second lists what the first chose', rowNames(inner.switcher.panel), ['Y one']);
    click(rows(inner.switcher.panel)[0]);
    check('and names its own', inner.el.querySelector('.twm-wspicker-field__name').textContent, 'Y one');
    check('the current item\'s icon, with no fixed one', inner.el.querySelector('.twm-wspicker-field__icon').textContent, 'layers');
    outer.destroy();
    inner.destroy();
}

section('§10 attributes, CSS, words, docs, barrel');
{
    const source = readFileSync(resolvePath(HERE, '../src/ui/components/workspace_picker.js'), 'utf8');
    const recent = readFileSync(resolvePath(HERE, '../src/ui/components/recent_items.js'), 'utf8');
    const dataWrites = [...source.matchAll(/data-[a-z-]+/g)].map((m) => m[0]);
    check('no state in data attributes: only the tooltip service\'s', [...new Set(dataWrites)].sort(), ['data-tooltip', 'data-tooltip-placement']);
    ok('no dataset writes', !/\.dataset\b/.test(source));
    ok('no innerHTML: names are the caller\'s text', !/innerHTML/.test(source));
    for (const k of ['tooltip', 'tooltip-placement']) {
        ok(`a strict guard allows data-${k}`, DEFAULT_STATE_GUARD_CONFIG.allowedDatasetKeys.includes(k));
    }

    const blockOf = (sheet) => {
        const start = sheet.indexOf('/* ══ WORKSPACE PICKER ');
        const end = sheet.indexOf('/* ══ end WORKSPACE PICKER ══ */');
        return start < 0 || end < 0 ? '' : sheet.slice(start, end);
    };
    const flex = blockOf(css('flexdesk.css'));
    ok('flexdesk.css carries the block', flex.length > 0);
    check('base.css carries the same one', blockOf(css('base.css')) === flex, true);
    const rules = stripComments(flex);
    const classesSet = new Set([...source.matchAll(/twm-wspicker[a-z_-]*/g)].map((m) => m[0]));
    for (const name of ['--over', '--centered']) classesSet.add(`twm-wspicker${name}`);
    classesSet.delete('twm-wspicker-');
    classesSet.delete('twm-wspicker--');
    classesSet.delete('twm-wspicker-rows');
    classesSet.delete('twm-wspicker-columns');
    for (const name of [...classesSet].sort()) {
        ok(`${name} is styled`, new RegExp(`\\.${name}(?![a-zA-Z_-])`).test(rules));
    }
    const classesStyled = new Set([...rules.matchAll(/\.(twm-wspicker[a-zA-Z_-]*)/g)].map((m) => m[1]));
    for (const name of classesStyled) ok(`${name} is one it sets`, classesSet.has(name));
    ok('no hex literals', !/#[0-9a-fA-F]{3,8}\b/.test(rules));
    ok('over the top bar and managed windows', /z-index:\s*var\(--z-over-windows\)/.test(rules));
    ok('a panel waiting on a dialog is below managed windows, with its backdrop',
        /\.twm-wspicker--waiting,\s*\.twm-wspicker-backdrop--waiting\s*\{\s*z-index:\s*var\(--z-popover\)/.test(rules));

    const docs = readFileSync(resolvePath(HERE, '../docs/components/workspace-picker.md'), 'utf8');
    const WORDS = /\b(ecosim|ecoagent|bugdesk|project|bug|tickets?|simulation|scenario|tables?\b(?=\.)|\.toml)\b/i;
    for (const [name, text] of [['source', source], ['store', recent], ['css', flex], ['docs', docs]]) {
        const hit = text.match(WORDS);
        ok(`no application word in the ${name}${hit ? `: ${hit[0]}` : ''}`, !hit);
    }
    ok('the docs head their sections with the version', /^## .*\(0\.18\.0\)$/m.test(docs));
    const index = readFileSync(resolvePath(HERE, '../docs/README.md'), 'utf8');
    ok('the docs index lists the page', index.includes('components/workspace-picker.md'));

    ok('barrel: createWorkspacePicker', widgets.createWorkspacePicker === createWorkspacePicker);
    ok('barrel: createPickerSwitcher', widgets.createPickerSwitcher === createPickerSwitcher);
    ok('barrel: mountPickerField', widgets.mountPickerField === mountPickerField);
    ok('barrel: createRecentItems', typeof widgets.createRecentItems === 'function');
}

done();
process.exit(0);
