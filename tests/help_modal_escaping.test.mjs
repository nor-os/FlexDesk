/**
 * BUG-0009 — HELPMODAL SHOWS WHAT IT IS GIVEN AS TEXT, NOT AS MARKUP.
 *
 * The modal built its search results, sidebar, index and breadcrumb as
 * innerHTML templates and dropped the typed query and the provider's topic
 * ids, titles and categories into them raw. Typing
 * `<img src=x onerror=alert(1)>` into the search box parsed an `<img>` into
 * the results and ran its handler.
 *
 *   §1  the reproducer: that query, with no match and with a match, is shown
 *       literally and parses no element
 *   §2  topic titles and category names carrying markup are text in the
 *       sidebar, the index, the search results and the breadcrumb
 *   §3  a topic id carrying quotes and markup survives its attribute: the
 *       item's data-topic is the id, and clicking it loads that id
 *   §4  topic.html is still markup — it is the provider's rendered article,
 *       by contract, and stays so
 *
 * Against the code before the fix, §1–§3 fail.
 *
 *     node tests/help_modal_escaping.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('help modal escaping');
const { check, ok, section, done } = t;

const { setHelpProvider } = await import('../src/help/help_registry.js');
const { HelpModal } = await import('../src/help/help_modal.js');

const EVIL = '<img src=x onerror=alert(1)>';
const EVIL_ID = 'id"><img src=x onerror=alert(2)>';
const EVIL_TITLE = '<b>Bold</b> <img src=x onerror=alert(3)>';
const EVIL_CAT = '<i>cat</i>';

const topics = [
    { id: 'plain', title: 'Plain topic', category: 'basics' },
    { id: EVIL_ID, title: EVIL_TITLE, category: EVIL_CAT },
];
const loaded = [];
setHelpProvider({
    getCategories: () => ['basics', EVIL_CAT],
    getTopicsByCategory: (c) => topics.filter((x) => x.category === c),
    loadTopic: async (id) => {
        loaded.push(id);
        const topic = topics.find((x) => x.id === id);
        return topic ? { ...topic, html: '<p class="article-body">Body <em>here</em></p>' } : null;
    },
    // Every query matches the evil topic, except one that matches nothing.
    searchTopics: (q) => (q === EVIL ? [] : [topics[1]]),
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const modal = new HelpModal();
await modal.open();
const root = () => document.querySelector('.help-modal');
const content = () => root().querySelector('.help-modal__content');
const search = (q) => {
    const input = root().querySelector('.help-search-input');
    input.value = q;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const imgs = () => root().querySelectorAll('img').length;

section('§1 the reproducer: the typed query is shown literally');
search(EVIL);
check('no-match line shows the query as typed',
    content().querySelector('.help-search-empty')?.textContent, `No results found for "${EVIL}"`);
check('no element parsed from the query', imgs(), 0);

search(`x ${EVIL}`);
check('result-count line shows the query as typed',
    content().querySelector('.help-search-count')?.textContent, `1 result for "x ${EVIL}"`);
check('still no element parsed', imgs(), 0);

section('§2 titles and categories are text everywhere they are drawn');
const item = content().querySelector('.help-search-item');
check('search item title is the literal title',
    item?.querySelector('.help-search-item__title')?.textContent, EVIL_TITLE);
check('search item category is the literal category',
    item?.querySelector('.help-search-item__category')?.textContent, EVIL_CAT);
ok('no <b>/<i> parsed in the results', !content().querySelector('b, i'));

const sideItem = [...root().querySelectorAll('.help-topic-item')].find((li) => li.dataset.topic === EVIL_ID);
check('sidebar item title is the literal title', sideItem?.textContent.trim(), EVIL_TITLE);
const sideCats = [...root().querySelectorAll('.help-category')].map((c) => c.dataset.category);
check('sidebar categories keep their literal ids', sideCats, ['basics', EVIL_CAT]);
check('sidebar category header shows the literal name',
    root().querySelectorAll('.help-category__header')[1]?.lastElementChild?.textContent, EVIL_CAT);
ok('no <b>/<i> parsed in the sidebar', !root().querySelector('.help-modal__sidebar b, .help-modal__sidebar i'));

search('');
const indexItem = [...content().querySelectorAll('.help-index__topic')].find((li) => li.dataset.topic === EVIL_ID);
check('index item title is the literal title', indexItem?.textContent.trim(), EVIL_TITLE);
check('index category header shows the literal name',
    content().querySelectorAll('.help-index__category-header')[1]?.lastElementChild?.textContent, EVIL_CAT);
check('no element parsed in the index', imgs(), 0);

section('§3 a topic id survives its attribute and loads by itself');
search('anything');
const evilItem = content().querySelector('.help-search-item');
check('data-topic is the id', evilItem?.dataset.topic, EVIL_ID);
evilItem?.click();
await flush(); await flush();
check('clicking loads that id', loaded.at(-1), EVIL_ID);
check('breadcrumb shows the literal title',
    content().querySelector('.help-breadcrumb__title')?.textContent, EVIL_TITLE);
check('no element parsed in the article view', imgs(), 0);

section('§4 topic.html is still markup');
ok('the provider\'s article renders as elements',
    !!content().querySelector('.help-article p.article-body em'));

modal.close();
done();
