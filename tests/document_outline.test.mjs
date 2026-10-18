/**
 * 0.17.0 `createDocumentOutline` — a long document's sections listed and
 * numbered, the one in view marked while the document scrolls, a click that
 * goes to a section and keeps it marked on the way.
 *
 *   §1  numbering: levels 1,2,2,1 are 1, 1.1, 1.2, 2; a skipped level, a
 *       shallowest level above 1, `maxDepth`; labels are text; no numbers
 *       without `numbering`
 *   §2  the scroll-spy: the observer's root and rootMargin, the topmost
 *       visible section is active, none in view keeps the last, the default
 *       resolver, onActiveChange
 *   §3  a click: marked at once, scrolled into view, onSelect; the spy is
 *       suppressed during the scroll and resumes on scrollend, or after
 *       `scrollEndTimeout`; `scrollOnSelect: false`
 *   §4  an entry whose target cannot be resolved: listed, never watched,
 *       never active (spy, click, setActive)
 *   §5  dispose: the observer disconnected, the timer cleared, the listeners
 *       and the element gone
 *   §6  setEntries, refresh, setActive/getActive, the empty state, the barrel
 *   §7  the stylesheet: the block in base.css AND flexdesk.css, no height
 *
 *     node tests/document_outline.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const T = await dataTableEnv('document outline');
const { check, ok, section, click, css, tick, done } = T;
const { createDocumentOutline, DocumentOutline } = await import('../src/ui/components/document_outline.js');

/** An IntersectionObserver the suite drives by hand: jsdom has none. */
const observers = [];
class FakeIO {
    constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.targets = new Set();
        this.disconnected = false;
        observers.push(this);
    }
    observe(el) { this.targets.add(el); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
    /** Report `[el, isIntersecting]` pairs — only for watched elements, as a browser would. */
    fire(...pairs) {
        const recs = pairs.filter(([el]) => this.targets.has(el))
            .map(([target, isIntersecting]) => ({ target, isIntersecting }));
        if (recs.length) this.callback(recs, this);
    }
}

const ENTRIES = [
    { id: 's1', level: 1, label: 'Introduction' },
    { id: 's1a', level: 2, label: 'Scope' },
    { id: 's1b', level: 2, label: 'Terms' },
    { id: 's2', level: 1, label: 'Method' },
];

/** A scroll container holding one section element per id. */
function doc(ids = ENTRIES.map((e) => e.id)) {
    const container = document.createElement('div');
    const scrolled = [];
    const els = {};
    for (const id of ids) {
        const el = document.createElement('section');
        el.id = id;
        el.scrollIntoView = (opts) => scrolled.push([id, opts]);
        container.appendChild(el);
        els[id] = el;
    }
    document.body.appendChild(container);
    return { container, els, scrolled };
}
const host = () => { const h = document.createElement('div'); document.body.appendChild(h); return h; };
const items = (o) => [...o.element.querySelectorAll('.twm-doc-outline__item')];
const numbers = (o) => items(o).map((li) => li.querySelector('.twm-doc-outline__number')?.textContent ?? null);
const activeIds = (o) => items(o).filter((li) => li.classList.contains('twm-doc-outline__item--active'))
    .map((li) => ENTRIES.concat(EXTRA).find((e) => o.getItem(e.id) === li)?.id);
const EXTRA = [{ id: 'ghost', level: 2, label: 'Not in the document' }];
const linkOf = (o, id) => o.getItem(id).querySelector('.twm-doc-outline__link');

section('§1 numbering');
{
    const o = createDocumentOutline(host(), { entries: ENTRIES, numbering: true });
    ok('an instance of DocumentOutline', o instanceof DocumentOutline);
    ok('the root is a nav appended to the host', o.element.parentNode && o.element.tagName === 'NAV'
        && o.element.classList.contains('twm-doc-outline'));
    check('levels 1,2,2,1 are numbered 1, 1.1, 1.2, 2', numbers(o), ['1', '1.1', '1.2', '2']);
    check('the labels', items(o).map((li) => li.querySelector('.twm-doc-outline__label').textContent),
        ['Introduction', 'Scope', 'Terms', 'Method']);
    check('a depth class per level', items(o).map((li) => [...li.classList].filter((c) => !c.endsWith('--unresolved')).join(' ')),
        ['twm-doc-outline__item twm-doc-outline__item--level-1', 'twm-doc-outline__item twm-doc-outline__item--level-2',
         'twm-doc-outline__item twm-doc-outline__item--level-2', 'twm-doc-outline__item twm-doc-outline__item--level-1']);
    check('the indentation depth is set per item', items(o).map((li) => li.style.getPropertyValue('--twm-doc-outline-depth')),
        ['0', '1', '1', '0']);
    ok('entries are buttons', items(o).every((li) => li.firstChild.tagName === 'BUTTON' && li.firstChild.type === 'button'));

    o.setEntries([{ id: 'a', level: 1, label: 'A' }, { id: 'b', level: 3, label: 'B' }, { id: 'c', level: 3, label: 'C' },
                  { id: 'd', level: 2, label: 'D' }, { id: 'e', level: 1, label: 'E' }, { id: 'f', level: 2, label: 'F' }]);
    check('a skipped level is one deeper, never 1.0.1', numbers(o), ['1', '1.1', '1.2', '1.3', '2', '2.1']);

    o.setEntries([{ id: 'a', level: 2, label: 'A' }, { id: 'b', level: 3, label: 'B' }, { id: 'c', level: 2, label: 'C' }]);
    check('the shallowest level counts as depth 1', numbers(o), ['1', '1.1', '2']);

    o.setEntries([{ id: 'a', level: 1, label: 'A' }, { id: 'b', level: 2, label: 'B' }, { id: 'c', level: 3, label: 'C' },
                  { id: 'd', level: 4, label: 'D' }]);
    check('default maxDepth 3: level 4 is listed at depth 3', numbers(o), ['1', '1.1', '1.1.1', '1.1.2']);
    ok('…and indented at depth 3', items(o).at(-1).classList.contains('twm-doc-outline__item--level-3'));
    const flat = createDocumentOutline(host(), { entries: ENTRIES, numbering: true, maxDepth: 1 });
    check('maxDepth 1: one flat level', numbers(flat), ['1', '2', '3', '4']);

    const plain = createDocumentOutline(host(), { entries: [{ id: 'x', level: 1, label: '<b>bold</b>' }] });
    check('no numbers without numbering', numbers(plain), [null]);
    check('a label is text, not markup', plain.getItem('x').querySelector('.twm-doc-outline__label').textContent, '<b>bold</b>');
    ok('…no element made from it', !plain.element.querySelector('b'));
    check('the nav has an accessible name', plain.element.getAttribute('aria-label'), 'Outline');
}

section('§2 the scroll-spy');
{
    const d = doc();
    const changes = [];
    const o = createDocumentOutline(host(), {
        entries: ENTRIES, numbering: true, scrollContainer: d.container,
        rootMargin: '-5% 0px -80% 0px', IntersectionObserver: FakeIO,
    });
    const io = observers.at(-1);
    o.onActiveChange((id, entry) => changes.push([id, entry?.label ?? null]));
    check('the observer is rooted at the scroll container', io.options.root === d.container, true);
    check('…with the given rootMargin', io.options.rootMargin, '-5% 0px -80% 0px');
    check('the default resolver watches the element with the entry\'s id', [...io.targets].map((el) => el.id), ['s1', 's1a', 's1b', 's2']);
    check('nothing active at first', o.getActive(), null);

    io.fire([d.els.s1, true]);
    check('scrolling: the section in view is active', o.getActive(), 's1');
    io.fire([d.els.s1a, true], [d.els.s1b, true]);
    check('several in view: the topmost visible one is active', o.getActive(), 's1');
    io.fire([d.els.s1, false]);
    check('the top one scrolls out: the next one down is active', o.getActive(), 's1a');
    io.fire([d.els.s1a, false], [d.els.s1b, false]);
    check('none in view: the last active stays', o.getActive(), 's1a');
    io.fire([d.els.s2, true]);
    check('the next heading arrives: it is active', o.getActive(), 's2');
    check('the item is marked, and only it', activeIds(o), ['s2']);
    check('aria-current on the active link', linkOf(o, 's2').getAttribute('aria-current'), 'location');
    ok('…and on no other', !linkOf(o, 's1').hasAttribute('aria-current'));
    check('onActiveChange on every change, with the entry', changes,
        [['s1', 'Introduction'], ['s1a', 'Scope'], ['s2', 'Method']]);

    const d2 = doc();
    createDocumentOutline(host(), { entries: ENTRIES, scrollContainer: d2.container, IntersectionObserver: FakeIO });
    check('the default rootMargin: the top 30% is in view', observers.at(-1).options.rootMargin, '0px 0px -70% 0px');

    const d3 = doc();
    const custom = createDocumentOutline(host(), {
        entries: ENTRIES, scrollContainer: d3.container, IntersectionObserver: FakeIO,
        resolveTarget: (entry, container) => (entry.id === 's2' ? container.firstChild : null),
    });
    check('a resolver of the embedder\'s chooses the targets', [...observers.at(-1).targets].map((el) => el.id), ['s1']);
    observers.at(-1).fire([d3.els.s1, true]);
    check('…and the spy maps them back to their entry', custom.getActive(), 's2');
}

section('§3 a click keeps its entry active during the scroll');
{
    const d = doc();
    const selected = [];
    const o = createDocumentOutline(host(), {
        entries: ENTRIES, scrollContainer: d.container, IntersectionObserver: FakeIO,
        onSelect: (id, entry) => selected.push([id, entry.label]),
    });
    const io = observers.at(-1);
    io.fire([d.els.s1, true]);
    check('before: the first section is active', o.getActive(), 's1');

    click(linkOf(o, 's2'));
    check('the clicked entry is active at once', o.getActive(), 's2');
    check('its target is scrolled into view, smoothly, to the top', d.scrolled, [['s2', { block: 'start', behavior: 'smooth' }]]);
    check('onSelect with the id and the entry', selected, [['s2', 'Method']]);

    // The smooth scroll passes over every section on the way.
    io.fire([d.els.s1, false], [d.els.s1a, true]);
    check('a section passed on the way does not take over', o.getActive(), 's2');
    io.fire([d.els.s1a, false], [d.els.s1b, true]);
    check('…nor the next one', o.getActive(), 's2');
    io.fire([d.els.s1b, false], [d.els.s2, true]);
    check('arrived: still the clicked entry', o.getActive(), 's2');

    d.container.dispatchEvent(new T.window.Event('scrollend'));
    io.fire([d.els.s2, false], [d.els.s1b, true]);
    check('after scrollend the spy is back', o.getActive(), 's1b');

    // No scrollend at all (the target was in place, or no such event): the timeout.
    const d2 = doc();
    const o2 = createDocumentOutline(host(), {
        entries: ENTRIES, scrollContainer: d2.container, IntersectionObserver: FakeIO, scrollEndTimeout: 30,
    });
    const io2 = observers.at(-1);
    click(linkOf(o2, 's1b'));
    io2.fire([d2.els.s1, true]);
    check('during the fallback window the spy is suppressed', o2.getActive(), 's1b');
    await tick(60);
    io2.fire([d2.els.s1a, true]);
    check('after scrollEndTimeout the spy resumes without a scrollend', o2.getActive(), 's1');

    const d3 = doc();
    const o3 = createDocumentOutline(host(), {
        entries: ENTRIES, scrollContainer: d3.container, IntersectionObserver: FakeIO, scrollOnSelect: false,
        scrollBehavior: 'auto', onSelect: (id) => selected.push([id]),
    });
    click(linkOf(o3, 's1a'));
    check('scrollOnSelect: false — the outline scrolls nothing', d3.scrolled, []);
    check('…onSelect is called to do it', selected.at(-1), ['s1a']);
    check('…and the entry is active', o3.getActive(), 's1a');
    observers.at(-1).fire([d3.els.s1, true]);
    check('…and kept during the scroll onSelect started', o3.getActive(), 's1a');
    o3.dispose();
}

section('§4 an entry whose target cannot be resolved');
{
    const d = doc();
    const selected = [];
    const entries = [ENTRIES[0], EXTRA[0], ENTRIES[3]];
    const o = createDocumentOutline(host(), {
        entries, numbering: true, scrollContainer: d.container, IntersectionObserver: FakeIO,
        onSelect: (id) => selected.push(id),
    });
    const io = observers.at(-1);
    check('it is listed, in its place and numbered', numbers(o), ['1', '1.1', '2']);
    ok('…marked unresolved', o.getItem('ghost').classList.contains('twm-doc-outline__item--unresolved'));
    ok('…and the resolved ones are not', !o.getItem('s1').classList.contains('twm-doc-outline__item--unresolved'));
    check('it is never watched', [...io.targets].map((el) => el.id), ['s1', 's2']);

    io.fire([d.els.s1, true]);
    click(linkOf(o, 'ghost'));
    check('a click on it does not make it active', o.getActive(), 's1');
    check('…onSelect is still told', selected, ['ghost']);
    check('…and nothing is scrolled', d.scrolled, []);
    check('setActive refuses it', o.setActive('ghost'), false);
    check('…and the active entry is unchanged', o.getActive(), 's1');
    io.fire([d.els.s1, false], [d.els.s2, true]);
    check('the spy steps over it to the next section', o.getActive(), 's2');
    ok('it never wore the active class', !o.getItem('ghost').classList.contains('twm-doc-outline__item--active'));

    const lone = createDocumentOutline(host(), { entries: ENTRIES });
    ok('with no scroll container nothing resolves, and every entry is listed', items(lone).length === 4
        && items(lone).every((li) => li.classList.contains('twm-doc-outline__item--unresolved')));
    check('…and none can be made active', lone.setActive('s1'), false);
}

section('§5 dispose');
{
    // Count the outline's live timers.
    const live = new Set();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    globalThis.setTimeout = (fn, ms, ...a) => { const id = realSet(() => { live.delete(id); fn(...a); }, ms); live.add(id); return id; };
    globalThis.clearTimeout = (id) => { live.delete(id); realClear(id); };
    try {
        const d = doc();
        const h = host();
        let changes = 0;
        const o = createDocumentOutline(h, {
            entries: ENTRIES, scrollContainer: d.container, IntersectionObserver: FakeIO, scrollEndTimeout: 10_000,
        });
        const io = observers.at(-1);
        o.onActiveChange(() => changes++);
        click(linkOf(o, 's2'));
        check('a click starts one fallback timer', live.size, 1);
        o.dispose();
        ok('dispose disconnects the observer', io.disconnected && io.targets.size === 0);
        check('…and clears the timer', live.size, 0);
        ok('…and takes the outline off the page', !h.contains(o.element));
        const before = changes;
        io.callback([{ target: d.els.s1, isIntersecting: true }], io);
        check('a late observer callback changes nothing', [o.getActive(), changes], ['s2', before]);
        check('setActive after dispose does nothing', o.setActive(null), false);
        h.appendChild(o.element);
        click(o.element.querySelector('.twm-doc-outline__link'));
        check('…and the click listener is gone', changes, before);
        o.setEntries([]);
        check('a disposed outline draws nothing more', items(o).length, 4);
        d.container.dispatchEvent(new T.window.Event('scrollend'));
        ok('a scrollend after dispose is harmless', true);
    } finally {
        globalThis.setTimeout = realSet;
        globalThis.clearTimeout = realClear;
    }
}

section('§6 setEntries, refresh, setActive, getActive, the empty state, the barrel');
{
    const d = doc(['s1', 's2']);
    const changes = [];
    const o = createDocumentOutline(host(), { entries: ENTRIES, scrollContainer: d.container, IntersectionObserver: FakeIO });
    const io = observers.at(-1);
    const off = o.onActiveChange((id) => changes.push(id));
    check('only the targets that exist are watched', [...io.targets].map((el) => el.id), ['s1', 's2']);
    check('setActive on a resolved entry', [o.setActive('s2'), o.getActive()], [true, 's2']);
    check('setActive on an id not listed is refused', o.setActive('nope'), false);
    check('setActive(null) clears it', [o.setActive(null), o.getActive()], [true, null]);

    const late = document.createElement('section');
    late.id = 's1a';
    d.container.insertBefore(late, d.els.s2);
    o.refresh();
    check('refresh resolves the targets again', [...io.targets].map((el) => el.id), ['s1', 's1a', 's2']);
    ok('…and the entry is no longer unresolved', !o.getItem('s1a').classList.contains('twm-doc-outline__item--unresolved'));
    o.setActive('s1a');
    late.remove();
    o.refresh();
    check('refresh drops an active entry whose target went', o.getActive(), null);

    o.setActive('s2');
    o.setEntries([ENTRIES[3], { id: 's9', level: 1, label: 'Appendix' }]);
    check('setEntries keeps the active entry if it is still there', o.getActive(), 's2');
    check('…and draws the new list', items(o).length, 2);
    check('getEntries returns them as given', o.getEntries().map((e) => e.label), ['Method', 'Appendix']);
    o.setEntries([ENTRIES[0]]);
    check('setEntries drops an active entry that is gone', o.getActive(), null);
    check('onActiveChange saw each change', changes, ['s2', null, 's1a', null, 's2', null]);
    off();
    o.setActive('s1');
    check('…and unsubscribes', changes.length, 6);

    o.setEntries([]);
    check('no entries: the empty state', o.element.querySelector('.twm-doc-outline__empty')?.textContent, 'No headings');
    ok('…and the root says so', o.element.classList.contains('twm-doc-outline--empty'));
    o.setEntries(ENTRIES);
    ok('entries arrive: the empty state goes', !o.element.querySelector('.twm-doc-outline__empty')
        && !o.element.classList.contains('twm-doc-outline--empty'));
    const own = createDocumentOutline(host(), { emptyState: 'This document has no headings yet.' });
    check('an empty state of the embedder\'s', own.element.querySelector('.twm-doc-outline__empty').textContent,
        'This document has no headings yet.');
    const none = createDocumentOutline(host(), { emptyState: null });
    ok('emptyState: null draws nothing', !none.element.querySelector('.twm-doc-outline__empty'));

    const barrel = await import('../widgets.js');
    ok('@flexdesk/widgets exports createDocumentOutline and DocumentOutline',
        barrel.createDocumentOutline === createDocumentOutline && barrel.DocumentOutline === DocumentOutline);
}

section('§7 the stylesheet');
{
    const base = css('base.css');
    const flexdesk = css('flexdesk.css');
    const block = (sheet) => {
        const from = sheet.indexOf('/* ══ DOCUMENT OUTLINE (0.17.0)');
        const to = sheet.indexOf('/* ══ end DOCUMENT OUTLINE ══ */');
        return from >= 0 && to > from ? sheet.slice(from, to) : null;
    };
    ok('the block is in base.css', block(base));
    check('…and mirrored byte for byte into flexdesk.css', block(flexdesk), block(base));
    const body = (sel) => ruleBody(base, sel) || '';
    ok('the outline declares no height', !/(^|[;\s])(height|max-height)\s*:/.test(body('.twm-doc-outline') + body('.twm-doc-outline__items')));
    ok('each level is indented by the depth it is given', /--twm-doc-outline-depth/.test(body('.twm-doc-outline__link')));
    ok('a long label ellipsises', /text-overflow:\s*ellipsis/.test(body('.twm-doc-outline__label')));
    ok('the active entry wears the accent edge', /accent-bright/.test(body('.twm-doc-outline__item.twm-doc-outline__item--active > .twm-doc-outline__link')));
    ok('the empty state is muted', /text-muted/.test(body('.twm-doc-outline__empty')));
}

done();
