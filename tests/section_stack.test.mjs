/**
 * ══ THE SECTION STACK (STORY-0036) ═══════════════════════════════════════
 *
 *   §1  the markup is the `.twm-collapsible-*` primitive's: a box, a header
 *       with an arrow and a title, a body; defaultExpanded decides who opens
 *   §2  a header click toggles the section and its arrow; a click on one of
 *       the header's action buttons runs the action and toggles nothing
 *   §3  expanded states are written under the given key and come back on the
 *       next mount — synchronously, or when a promised read answers (and a
 *       section toggled meanwhile keeps its choice, written over the stored
 *       map once the read settles, never the defaults over it)
 *   §4  a store that throws, rejects or answers junk: every section on its
 *       defaultExpanded, and the stack still works
 *   §5  setVisible hides a section and brings it back as it was
 *   §6  expand / collapse / toggle / isExpanded, and the toggled event
 *   §7  a fill section: the stylesheet gives it the remaining height and makes
 *       its body the thing that scrolls (min-height: 0), but never lets the box
 *       shrink below its header; base.css mirrors
 *       flexdesk.css byte for byte
 *   §8  dispose removes every listener and every node it created
 *
 *     node tests/section_stack.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS
 * loudly. jsdom computes no layout, so §7 holds the CSS contract on the
 * sheet's text and the cascade jsdom does apply; the heights themselves were
 * measured in headless Edge for STORY-0036.
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody, stripComments } from './css_rules.mjs';

const t = await dataTableEnv('section stack');
const { check, ok, section, done, click, tick, document, window } = t;

// Every listener added from here on, by target — §8 needs to know which the
// stack added, and that each went again.
const added = [];
const removed = [];
const realAdd = window.EventTarget.prototype.addEventListener;
const realRemove = window.EventTarget.prototype.removeEventListener;
window.EventTarget.prototype.addEventListener = function (type, fn, opts) {
    added.push({ target: this, type, fn });
    return realAdd.call(this, type, fn, opts);
};
window.EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    removed.push({ target: this, type, fn });
    return realRemove.call(this, type, fn, opts);
};

const { createSectionStack } = await import('../src/ui/components/section_stack.js');
const widgets = await import('../widgets.js');

const fresh = () => {
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    return host;
};
const memoryStore = (initial = {}) => {
    const data = { ...initial };
    const writes = [];
    return {
        data, writes,
        read: (key) => data[key],
        write: (key, map) => { writes.push({ key, map }); data[key] = JSON.parse(JSON.stringify(map)); },
    };
};
const SECTIONS = () => [
    { id: 'notes', title: 'Notes', icon: 'edit_note' },
    { id: 'chat', title: 'Assistant', fill: true,
      actions: [{ id: 'clear', icon: 'delete', label: 'Clear conversation', onClick: () => {} }] },
    { id: 'params', title: 'Parameters', defaultExpanded: false },
];
const boxes = (stack) => [...stack.root.querySelectorAll(':scope > .twm-collapsible-box')];
const header = (stack, i) => boxes(stack)[i].querySelector(':scope > .twm-collapsible-header');
const arrow = (stack, i) => header(stack, i).querySelector('.twm-collapsible-arrow');
const content = (stack, i) => boxes(stack)[i].querySelector(':scope > .twm-collapsible-content');
const shown = (stack, i) => content(stack, i).classList.contains('visible');

section('§0 the entry');
ok('createSectionStack is exported from widgets.js', widgets.createSectionStack === createSectionStack);

section('§1 markup and defaults');
{
    const host = fresh();
    const notesEl = document.createElement('textarea');
    const defs = SECTIONS();
    defs[0].content = notesEl;
    const stack = createSectionStack(host, { sections: defs });
    ok('one .twm-section-stack root, in the container', host.firstElementChild === stack.root
       && stack.root.className === 'twm-section-stack');
    check('a .twm-collapsible-box per section, in order', boxes(stack).length, 3);
    ok('each box is a header then a body', boxes(stack).every((b) =>
        b.children[0].classList.contains('twm-collapsible-header')
        && b.children[1].classList.contains('twm-collapsible-content')));
    check('titles', boxes(stack).map((b) => b.querySelector('.twm-section-stack__title').textContent),
          ['Notes', 'Assistant', 'Parameters']);
    ok('the arrow is the shared .twm-collapsible-arrow glyph', arrow(stack, 0)?.textContent === 'expand_more');
    check('defaultExpanded: open unless it says false', [0, 1, 2].map((i) => shown(stack, i)), [true, true, false]);
    check('the arrow agrees', [0, 1, 2].map((i) => arrow(stack, i).classList.contains('collapsed')), [false, false, true]);
    check('aria-expanded on the toggle button',
          boxes(stack).map((b) => b.querySelector('.twm-section-stack__toggle').getAttribute('aria-expanded')),
          ['true', 'true', 'false']);
    ok('content goes into the body', content(stack, 0).firstChild === notesEl && stack.body('notes') === content(stack, 0));
    ok('the fill section is marked', boxes(stack)[1].classList.contains('twm-section-stack__section--fill'));
    ok('a title is text, never markup', (() => {
        const s = createSectionStack(fresh(), { sections: [{ id: 'x', title: '<img src=x>' }] });
        return s.root.querySelector('img') === null && s.root.textContent.includes('<img src=x>');
    })());
    let threw = false;
    try { createSectionStack(fresh(), { sections: [{ id: 'a' }, { id: 'a' }] }); } catch { threw = true; }
    ok('a duplicate id is refused', threw);
    threw = false;
    try { createSectionStack(fresh(), { sections: [{ id: 'a' }], stateStore: memoryStore() }); } catch { threw = true; }
    ok('a store without a key is refused', threw);
}

section('§2 a header click toggles; an action click does not');
{
    const calls = [];
    const defs = SECTIONS();
    defs[1].actions[0].onClick = (id, ev) => calls.push([id, ev.type]);
    const stack = createSectionStack(fresh(), { sections: defs });
    click(header(stack, 0));
    ok('a click on the header collapses an open section', !shown(stack, 0) && !stack.isExpanded('notes'));
    ok('…and turns its arrow', arrow(stack, 0).classList.contains('collapsed'));
    click(header(stack, 0).querySelector('.twm-section-stack__title'));
    ok('a click on the title (inside the header) opens it again', shown(stack, 0)
       && !arrow(stack, 0).classList.contains('collapsed'));
    click(arrow(stack, 2));
    ok('a click on the arrow toggles too', shown(stack, 2));
    const action = header(stack, 1).querySelector('.twm-section-stack__action');
    ok('the action is a button with its label', action?.tagName === 'BUTTON'
       && action.getAttribute('aria-label') === 'Clear conversation');
    let bubbled = 0;
    const outer = () => { bubbled++; };
    document.body.addEventListener('click', outer);
    click(action);
    click(action.firstElementChild);   // the glyph inside it
    document.body.removeEventListener('click', outer);
    check('the action ran, with its section id', calls, [['chat', 'click'], ['chat', 'click']]);
    ok('…and the section did not toggle', shown(stack, 1) && stack.isExpanded('chat')
       && !arrow(stack, 1).classList.contains('collapsed'));
    check('the action click does not reach an ancestor as a header click', bubbled, 0);
    ok('Enter and Space come free: the toggle is a <button type=button>',
       header(stack, 0).querySelector('.twm-section-stack__toggle').type === 'button');
}

section('§3 expanded states persist under the key and come back');
{
    const store = memoryStore();
    const a = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: store, key: 'inspector.sections' });
    check('mounting is not a write', store.writes.length, 0);
    click(header(a, 0));          // notes: open -> closed
    click(header(a, 2));          // params: closed -> open
    check('each toggle writes, under the given key', store.writes.map((w) => w.key),
          ['inspector.sections', 'inspector.sections']);
    check('the map holds every section', store.data['inspector.sections'], { notes: false, chat: true, params: true });
    a.dispose();

    const b = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: store, key: 'inspector.sections' });
    check('the next mount restores them, before anything is on screen',
          [0, 1, 2].map((i) => shown(b, i)), [false, true, true]);
    check('…arrows included', [0, 1, 2].map((i) => arrow(b, i).classList.contains('collapsed')), [true, false, false]);
    b.dispose();

    const other = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: store, key: 'elsewhere' });
    check('another key is another memory', [0, 1, 2].map((i) => shown(other, i)), [true, true, false]);
    other.dispose();

    const plus = createSectionStack(fresh(), {
        sections: [...SECTIONS(), { id: 'new', title: 'New', defaultExpanded: false }],
        stateStore: store, key: 'inspector.sections',
    });
    ok('a section the store has not heard of keeps its default', !plus.isExpanded('new') && !plus.isExpanded('notes'));
    plus.dispose();

    const later = (value, ms = 5) => ({ read: () => new Promise((r) => setTimeout(() => r(value), ms)), write: () => {} });
    const c = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: later({ notes: false, params: true }), key: 'k' });
    const events = [];
    c.on('toggled', (e) => events.push(e));
    check('a promised read: the defaults until it answers', [0, 1, 2].map((i) => shown(c, i)), [true, true, false]);
    await c.ready;
    check('…then the stored states', [0, 1, 2].map((i) => shown(c, i)), [false, true, true]);
    check('…announced as restore', events, [
        { id: 'notes', expanded: false, source: 'restore' },
        { id: 'params', expanded: true, source: 'restore' },
    ]);
    const d = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: later({ notes: false, params: true }, 10), key: 'k' });
    click(header(d, 2));          // params: the user opens it, then closes it before the read answers
    click(header(d, 2));
    await d.ready;
    ok('a section toggled before the read answered keeps the choice', !d.isExpanded('params'));
    ok('…the others take the stored state', !d.isExpanded('notes'));

    // A toggle before a promised read settles must not write the defaults of
    // the sections nobody touched over what the store holds.
    const ui = (s) => [0, 1, 2].map((i) => shown(s, i));
    for (const [label, readAt] of [['a read that snapshots at once', 'call'], ['a read that looks when it answers', 'answer']]) {
        const slow = memoryStore({ k: { notes: false, chat: true, params: true } });
        const sync = slow.read;
        slow.read = (key) => {
            const snap = readAt === 'call' ? JSON.parse(JSON.stringify(sync(key))) : null;
            return new Promise((r) => setTimeout(() => r(snap ?? sync(key)), 10));
        };
        const e = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: slow, key: 'k' });
        click(header(e, 1));      // chat: open -> closed, before the read answers
        check(`${label}: no write while the read is out`, slow.writes.length, 0);
        await e.ready;
        check(`${label}: after ready the UI is the stored states plus the toggle`, ui(e), [false, false, true]);
        check(`${label}: …and the store holds exactly what the UI shows`, slow.data.k, { notes: false, chat: false, params: true });
        check(`${label}: …written once`, slow.writes.length, 1);
        e.dispose();
        slow.read = sync;
        const f = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: slow, key: 'k' });
        check(`${label}: the next mount restores it`, ui(f), [false, false, true]);
        f.dispose();
    }

    const gone = memoryStore({ k: { notes: false, chat: true, params: true } });
    const goneRead = gone.read;
    gone.read = (key) => new Promise((r) => setTimeout(() => r(goneRead(key)), 10));
    const g = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: gone, key: 'k' });
    click(header(g, 1));
    g.dispose();                  // disposed before the read answered
    await g.ready;
    check('a toggle before a dispose before the read answered is still written, over the stored map',
          gone.data.k, { notes: false, chat: false, params: true });

    const refused = memoryStore();
    refused.read = () => Promise.reject(new Error('gone'));
    const h = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: refused, key: 'k' });
    click(header(h, 2));
    await h.ready;
    check('a rejected read: the toggle made meanwhile is written with the defaults', refused.data.k,
          { notes: true, chat: true, params: true });
    click(header(h, 0));
    check('…and later toggles write at once', [refused.writes.length, refused.data.k.notes], [2, false]);
}

section('§4 a store that throws on read: every section on its default');
{
    const writes = [];
    const throwing = { read: () => { throw new Error('no storage'); }, write: (k, m) => writes.push(m) };
    const a = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: throwing, key: 'k' });
    check('a throwing read: defaultExpanded', [0, 1, 2].map((i) => shown(a, i)), [true, true, false]);
    click(header(a, 2));
    ok('…and the stack still works, and still writes', shown(a, 2) && writes.length === 1);

    const rejecting = { read: () => Promise.reject(new Error('gone')), write: () => {} };
    const b = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: rejecting, key: 'k' });
    await b.ready;
    check('a rejected read: defaultExpanded', [0, 1, 2].map((i) => shown(b, i)), [true, true, false]);

    for (const junk of ['nope', 42, ['notes'], { notes: 'false', params: 1 }, null]) {
        const s = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: { read: () => junk, write() {} }, key: 'k' });
        check(`a read answering ${JSON.stringify(junk)}: defaultExpanded`, [0, 1, 2].map((i) => shown(s, i)), [true, true, false]);
    }

    const failingWrite = { read: () => null, write: () => { throw new Error('quota'); } };
    const c = createSectionStack(fresh(), { sections: SECTIONS(), stateStore: failingWrite, key: 'k' });
    click(header(c, 0));
    ok('a throwing write does not stop the toggle', !shown(c, 0));
}

section('§5 setVisible keeps the expanded state');
{
    const stack = createSectionStack(fresh(), { sections: SECTIONS() });
    click(header(stack, 0));                         // notes closed by the user
    stack.setVisible('notes', false);
    stack.setVisible('params', false);
    ok('setVisible(id, false) hides the box', boxes(stack)[0].hidden && boxes(stack)[2].hidden
       && !stack.isVisible('notes'));
    ok('…and leaves the others', !boxes(stack)[1].hidden);
    stack.setVisible('notes', true);
    stack.setVisible('params', true);
    ok('setVisible(id, true) shows it again', !boxes(stack)[0].hidden && stack.isVisible('notes'));
    check('…in the state it had: notes closed, params closed', [shown(stack, 0), shown(stack, 2)], [false, false]);
    stack.expand('params');
    stack.setVisible('params', false);
    stack.setVisible('params', true);
    ok('an open section comes back open', shown(stack, 2) && !arrow(stack, 2).classList.contains('collapsed'));
    stack.setVisible('chat', false);
    stack.collapse('chat');
    stack.setVisible('chat', true);
    ok('a state changed while hidden is the state it comes back in', !shown(stack, 1));
    const css = stripComments(t.css('flexdesk.css'));
    ok('[hidden] is display: none despite the box being a flex column',
       /display:\s*none/.test(ruleBody(css, '.twm-section-stack > .twm-section-stack__section[hidden]') || ''));
}

section('§6 the API and the toggled event');
{
    const stack = createSectionStack(fresh(), { sections: SECTIONS() });
    const events = [];
    const off = stack.on('toggled', (e) => events.push(e));
    stack.collapse('notes');
    stack.collapse('notes');                         // no change: no event
    stack.expand('params');
    stack.toggle('chat');
    click(header(stack, 2));
    check('isExpanded', ['notes', 'chat', 'params'].map(stack.isExpanded), [false, false, false]);
    check('one event per change, with its source', events, [
        { id: 'notes', expanded: false, source: 'api' },
        { id: 'params', expanded: true, source: 'api' },
        { id: 'chat', expanded: false, source: 'api' },
        { id: 'params', expanded: false, source: 'user' },
    ]);
    off();
    stack.toggle('notes');
    check('on() answers the function that stops listening', events.length, 4);
    let threw = false;
    try { stack.expand('nope'); } catch { threw = true; }
    ok('an unknown id is an error, not a silent no-op', threw);
    threw = false;
    try { stack.on('opened', () => {}); } catch { threw = true; }
    ok('an unknown event is an error', threw);
    const bad = createSectionStack(fresh(), { sections: SECTIONS() });
    bad.on('toggled', () => { throw new Error('listener'); });
    const quiet = console.error; console.error = () => {};
    bad.toggle('notes');
    console.error = quiet;
    ok('a listener that throws does not undo the toggle', !bad.isExpanded('notes'));
}

section('§7 a fill section takes the remaining height and scrolls inside');
{
    const FLEX = t.css('flexdesk.css');
    const BASE = t.css('base.css');
    const OPEN = '/* ══ SECTION STACK ';
    const CLOSE = '/* ══ end SECTION STACK ══ */';
    const cut = (sheet) => {
        const a = sheet.indexOf(OPEN); const b = sheet.indexOf(CLOSE);
        return a >= 0 && b > a ? sheet.slice(a, b + CLOSE.length) : null;
    };
    ok('flexdesk.css has a SECTION STACK section', cut(FLEX));
    check('base.css carries the same section, byte for byte', cut(BASE), cut(FLEX));
    const css = stripComments(cut(FLEX) || '');
    const decl = (body, prop) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body || '')?.[1].trim() ?? null;
    const rootRule = ruleBody(css, '.twm-section-stack');
    check('the stack is a column as tall as its container',
          [decl(rootRule, 'display'), decl(rootRule, 'flex-direction'), decl(rootRule, 'height'), decl(rootRule, 'min-height')],
          ['flex', 'column', '100%', '0']);
    const box = ruleBody(css, '.twm-section-stack > .twm-section-stack__section');
    check('a section is its content high and may shrink', [decl(box, 'flex'), decl(box, 'min-height')], ['0 0 auto', '0']);
    const fill = ruleBody(css, '.twm-section-stack > .twm-section-stack__section--fill.twm-section-stack__section--expanded');
    check('an open fill section takes what is left', decl(fill, 'flex'), '1 1 0');
    const headerRule = ruleBody(css, '.twm-section-stack__header');
    check('…but never shrinks below its header, so the header cannot overlap the next section\'s',
          [decl(fill, 'min-height'), decl(headerRule, 'flex-shrink')], [decl(headerRule, 'height'), '0']);
    ok('…the header height it matches is a length', /^\d+px$/.test(decl(headerRule, 'height') || ''));
    const body = ruleBody(css, '.twm-section-stack__section--fill > .twm-collapsible-content.visible');
    check('its body fills it, may shrink, and scrolls',
          [decl(body, 'flex'), decl(body, 'min-height'), decl(body, 'overflow-y')], ['1 1 0', '0', 'auto']);

    // The cascade jsdom does apply: the sheet in a document, the classes the stack sets.
    const style = document.createElement('style');
    style.textContent = cut(FLEX).replace(/var\([^)]*\)/g, '0');
    document.head.appendChild(style);
    const host = fresh();
    host.style.height = '400px';
    const long = document.createElement('div');
    long.textContent = 'line\n'.repeat(500);
    const defs = SECTIONS();
    defs[1].content = long;
    const stack = createSectionStack(host, { sections: defs });
    const cs = (el) => window.getComputedStyle(el);
    check('computed: the open fill box flexes into the space', cs(boxes(stack)[1]).flexGrow, '1');
    check('computed: the open fill box is at least its header high',
          cs(boxes(stack)[1]).minHeight, cs(header(stack, 1)).height);
    check('computed: its body scrolls and may shrink', [cs(content(stack, 1)).overflowY, parseFloat(cs(content(stack, 1)).minHeight)], ['auto', 0]);
    check('computed: a fixed box does not grow', cs(boxes(stack)[0]).flexGrow, '0');
    stack.collapse('chat');
    check('computed: a closed fill section is only its header', cs(boxes(stack)[1]).flexGrow, '0');
    style.remove();
    stack.dispose();
}

section('§8 dispose removes every listener and node it created');
{
    const host = fresh();
    const before = document.createElement('span');
    host.appendChild(before);
    const mark = added.length;
    const markRemoved = removed.length;
    const defs = SECTIONS();
    const own = document.createElement('div');
    defs[0].content = own;
    const stack = createSectionStack(host, { sections: defs, stateStore: memoryStore(), key: 'k' });
    const created = [stack.root, ...stack.root.querySelectorAll('*')];
    const mine = added.slice(mark);
    ok('the stack adds listeners (so the check below means something)', mine.length > 0);
    const events = [];
    stack.on('toggled', (e) => events.push(e));
    stack.dispose();
    const gone = removed.slice(markRemoved);
    const unmatched = mine.filter((a) => !gone.some((r) => r.target === a.target && r.type === a.type && r.fn === a.fn));
    check('every listener it added is removed', unmatched.map((u) => u.type), []);
    ok('…holding only what was there before', host.childNodes.length === 1 && host.firstChild === before);
    ok('none of its nodes is in the document', created.every((n) => !document.contains(n)));
    stack.toggle('notes');
    click(created.find((n) => n.classList?.contains('twm-section-stack__header')));
    check('after dispose: no events, no state change', events, []);
    stack.dispose();
    ok('a second dispose is harmless', true);
}

window.EventTarget.prototype.addEventListener = realAdd;
window.EventTarget.prototype.removeEventListener = realRemove;
await tick();
done();
