/**
 * BUG-0010 — HELPMODAL DRAWS THE TABLE OF CONTENTS IT DOCUMENTS.
 *
 * The modal's header promised "Table of contents navigation" and nothing drew
 * one: a topic of any length showed its article and no contents. Now a topic
 * with two or more headings, markdown or html, gets a `createDocumentOutline`
 * between the breadcrumb and the article.
 *
 *   §1  the steps to reproduce: `# Heading` (as `markdown`, the documented way
 *       to hand the modal markdown) renders as an h1, and a topic with two
 *       headings lists both, numbered, levels from the tags, labels as text
 *   §2  an html topic gets the same contents from its own headings
 *   §3  a click scrolls to the heading the entry stands for; the scroll-spy
 *       watches the headings with the content pane as its root
 *   §4  one heading or none: no contents drawn
 *   §5  the index, a search, another topic and close() each dispose the
 *       outline (observer disconnected, element gone)
 *   §6  the provider's markup gets no ids added
 *
 *     node tests/help_modal_toc.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('help modal toc');
const { check, ok, section, done } = t;

// A hand-driven IntersectionObserver: what it watches, its root, disconnects.
const observers = [];
globalThis.IntersectionObserver = window.IntersectionObserver = class {
    constructor(cb, opts) { this.cb = cb; this.opts = opts; this.watched = []; this.disconnected = false; observers.push(this); }
    observe(el) { this.watched.push(el); }
    unobserve() {}
    disconnect() { this.disconnected = true; }
};

const { setHelpProvider } = await import('../src/help/help_registry.js');
const { HelpModal } = await import('../src/help/help_modal.js');

const topics = {
    repro: { id: 'repro', title: 'Repro', category: 'c', markdown: '# Heading' },
    md: {
        id: 'md', title: 'Markdown', category: 'c',
        markdown: '# Getting *started*\n\nIntro.\n\n## Install\n\nText.\n\n### From source\n\nMore.\n\n## Use <b>it</b>\n\nEnd.',
    },
    html: {
        id: 'html', title: 'HTML', category: 'c',
        html: '<h2>First</h2><p>a</p><h3>Second</h3><p>b</p><h2>Third</h2><p>c</p>',
    },
    one: { id: 'one', title: 'One heading', category: 'c', html: '<h2>Only</h2><p>x</p>' },
    none: { id: 'none', title: 'No heading', category: 'c', markdown: 'Just text.' },
};
setHelpProvider({
    getCategories: () => ['c'],
    getTopicsByCategory: () => Object.values(topics),
    loadTopic: async (id) => topics[id] ?? null,
    searchTopics: (q) => Object.values(topics).filter((x) => x.title.toLowerCase().includes(q)),
});

const $ = (sel) => document.querySelector(sel);
const toc = () => $('.help-modal .help-content__toc');
const items = () => [...document.querySelectorAll('.help-content__toc .twm-doc-outline__item')];
const rows = () => items().map((li) => [
    li.querySelector('.twm-doc-outline__number')?.textContent,
    li.querySelector('.twm-doc-outline__label')?.textContent,
]);

const modal = new HelpModal();

section('§1 the steps to reproduce, and a markdown topic\'s contents');
await modal.open('repro');
check('"# Heading" renders as an h1', $('.help-article h1')?.textContent, 'Heading');
ok('no literal "#" left', !$('.help-article').textContent.includes('#'));
await modal._loadTopic('md');
ok('the contents are drawn', toc() && !toc().hidden && !!toc().querySelector('.twm-doc-outline'));
ok('they sit between the breadcrumb and the article',
    toc()?.previousElementSibling?.matches('.help-content__breadcrumb')
    && toc()?.nextElementSibling?.matches('.help-article'));
check('every heading listed, numbered by level, labels as text', rows(), [
    ['1', 'Getting started'],
    ['1.1', 'Install'],
    ['1.1.1', 'From source'],
    ['1.2', 'Use <b>it</b>'],
]);
check('the outline is named', toc()?.querySelector('.twm-doc-outline')?.getAttribute('aria-label'), 'Contents');

section('§2 an html topic gets contents from its own headings');
await modal._loadTopic('html');
check('its headings listed', rows(), [['1', 'First'], ['1.1', 'Second'], ['2', 'Third']]);

section('§3 a click goes to its heading; the spy watches the headings');
const content = $('.help-modal__content');
const headings = [...document.querySelectorAll('.help-article h2, .help-article h3')];
const scrolled = [];
for (const h of headings) h.scrollIntoView = () => scrolled.push(h.textContent);
items()[2].querySelector('.twm-doc-outline__link').click();
check('the click scrolled to "Third"', scrolled, ['Third']);
ok('the clicked entry is active', items()[2].classList.contains('twm-doc-outline__item--active'));
const live = observers.at(-1);
ok('the observer is rooted at the content pane', live?.opts?.root === content);
check('it watches the article\'s headings', live?.watched, headings);

section('§4 one heading or none: no contents');
await modal._loadTopic('one');
ok('one heading: hidden, empty', toc()?.hidden === true && toc()?.children.length === 0);
await modal._loadTopic('none');
ok('no heading: hidden, empty', toc()?.hidden === true && toc()?.children.length === 0);

section('§5 every way out disposes the outline');
await modal._loadTopic('md');
let o = observers.at(-1);
await modal._loadTopic('one');
ok('another topic: the old observer is disconnected', o.disconnected);
await modal._loadTopic('md');
o = observers.at(-1);
modal._showIndex();
ok('the index: disconnected, no contents left', o.disconnected && !toc());
await modal._loadTopic('md');
o = observers.at(-1);
modal._handleSearch('mark');
ok('a search: disconnected', o.disconnected && !toc());
await modal._loadTopic('md');
o = observers.at(-1);
modal.close();
ok('close(): disconnected', o.disconnected);
check('no modal left on the page', document.querySelectorAll('.help-modal').length, 0);

// A topic still loading when the modal closes draws no contents afterwards.
let release;
topics.slow = { ...topics.md, id: 'slow' };
setHelpProvider({
    getCategories: () => ['c'],
    getTopicsByCategory: () => Object.values(topics),
    loadTopic: (id) => new Promise((resolve) => { release = () => resolve(topics[id] ?? null); }),
    searchTopics: () => [],
});
const count = observers.length;
const opening = modal.open('slow');
modal.close();
release();
await opening;
check('closed mid-load: no outline built', observers.length, count);

// Two loads in flight: whichever draws last, the earlier outline is disposed.
const pending = [];
setHelpProvider({
    getCategories: () => ['c'],
    getTopicsByCategory: () => Object.values(topics),
    loadTopic: (id) => new Promise((resolve) => pending.push(() => resolve(topics[id] ?? null))),
    searchTopics: () => [],
});
const opened = modal.open('md');
await Promise.resolve();
const second = modal._loadTopic('html');
pending[0](); await opened;
const first = observers.at(-1);
pending[1](); await second;
ok('overlapping loads: the earlier outline is disconnected', first.disconnected && !observers.at(-1).disconnected);
check('one outline on the page', document.querySelectorAll('.help-content__toc .twm-doc-outline').length, 1);
modal.close();

section('§6 the provider\'s markup is left as it was');
setHelpProvider({
    getCategories: () => ['c'],
    getTopicsByCategory: () => Object.values(topics),
    loadTopic: async (id) => topics[id] ?? null,
    searchTopics: () => [],
});
await modal.open('html');
check('no heading has an id', [...document.querySelectorAll('.help-article [id]')].length, 0);
modal.close();

done();
