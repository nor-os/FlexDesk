/**
 * STORY-0055 — HELPMODAL SHOWS A MARKDOWN TOPIC AS RENDERED MARKUP.
 *
 * A provider's `loadTopic` may answer `{title, markdown}`; the modal renders
 * it with `renderMarkdown` and the provider's `markdownOptions`. `topic.html`
 * stays trusted, pre-rendered markup, exactly as before.
 *
 *   §1  a markdown topic shows as headings and code, not as '#' and '```'
 *   §2  it is rendered safe: raw HTML is text, a javascript: link is inert,
 *       and nothing in it parses into a script-bearing element
 *   §3  the provider's markdownOptions reach the renderer (highlighter, rule)
 *   §4  an html topic is still inserted as markup
 *   §5  in a real DOM, every prefix of a streamed document parses back into
 *       the same tree it serialises to — nothing left open for the parser to
 *       repair
 *
 *     node tests/help_modal_markdown.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('help modal markdown');
const { check, ok, section, done } = t;

const { setHelpProvider } = await import('../src/help/help_registry.js');
const { HelpModal } = await import('../src/help/help_modal.js');
const { renderMarkdown } = await import('../src/ui/utils/markdown.js');

const MD = [
    '# Getting started',
    '',
    'Intro with `inline code` and [[ref:intro]].',
    '',
    '## Install',
    '',
    '```sh',
    'npm install <pkg>',
    '```',
    '',
    '<img src=x onerror="window.__pwned = 1">',
    '',
    '[run me](javascript:window.__pwned=2)',
].join('\n');

const topics = {
    md: { id: 'md', title: 'Markdown topic', category: 'basics', markdown: MD },
    html: { id: 'html', title: 'HTML topic', category: 'basics', html: '<p class="raw">Raw <em>markup</em></p>' },
};
const highlighted = [];
setHelpProvider({
    getCategories: () => ['basics'],
    getTopicsByCategory: () => Object.values(topics),
    loadTopic: async (id) => topics[id] ?? null,
    searchTopics: () => [],
    markdownOptions: {
        highlight: (code, lang) => { highlighted.push(lang); return `<span class="hl">${code.replace(/</g, '&lt;')}</span>`; },
        inlineRules: [{ pattern: /\[\[ref:(\w+)\]\]/, render: (m) => `<a class="help-ref" href="#${m[1]}">${m[1]}</a>` }],
    },
});

const modal = new HelpModal();
await modal.open('md');
const article = () => document.querySelector('.help-modal .help-article');

section('§1 a markdown topic renders as headings and code');
check('h1 text', article()?.querySelector('h1')?.textContent, 'Getting started');
check('h2 text', article()?.querySelector('h2')?.textContent, 'Install');
check('the fenced block is a pre > code', article()?.querySelector('pre > code.language-sh')?.textContent,
    'npm install <pkg>\n');
check('the code span is a code element', article()?.querySelector('p > code')?.textContent, 'inline code');
ok('no literal "#" or "```" is left in the text', !/(^|\n)#|```/.test(article()?.textContent ?? ''));

section('§2 rendered safe');
check('no img parsed from raw HTML', article()?.querySelectorAll('img').length, 0);
ok('the raw tag is shown as text', article()?.textContent.includes('<img src=x onerror="window.__pwned = 1">'));
check('the javascript: link renders inert: text, no anchor',
    [...article().querySelectorAll('a')].map((a) => a.getAttribute('href')), ['#intro']);
ok('its text is still there', article()?.textContent.includes('run me'));
ok('nothing ran', window.__pwned === undefined);
check('no element carries an on* attribute',
    [...article().querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.name)).filter((n) => /^on/i.test(n)), []);

section('§3 the provider\'s markdownOptions reach the renderer');
check('the highlighter ran for the sh fence', highlighted, ['sh']);
ok('its HTML is in the code block', !!article()?.querySelector('pre > code > span.hl'));
check('the inline rule replaced [[ref:intro]]', article()?.querySelector('a.help-ref')?.textContent, 'intro');

section('§4 an html topic is still markup');
await modal._loadTopic('html');
ok('the provider\'s html renders as elements', !!article()?.querySelector('p.raw em'));
modal.close();

section('§5 every streamed prefix parses back to itself in a real DOM');
const DOC = '# T *e*\n\n- a **b\n- c `d`\n\n> q [l](https://x.y "t")\n\n```\ncode <x>\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n*end* <kbd>K';
const tpl = document.createElement('template');
let firstBad = null;
for (let n = 0; n <= DOC.length && !firstBad; n++) {
    const html = renderMarkdown(DOC.slice(0, n), { allowHtml: ['kbd'] });
    tpl.innerHTML = html;
    const again = tpl.innerHTML;
    tpl.innerHTML = again;
    // A string with an unclosed element is repaired by the parser, so its
    // element count changes against a fixed, count-preserving re-parse.
    const opens = (html.match(/<(?!\/)(?!br|hr|img)[a-z][a-z0-9]*/g) ?? []).length;
    const elements = tpl.content.querySelectorAll('*').length - tpl.content.querySelectorAll('br, hr, img').length;
    const closes = (html.match(/<\/[a-z]/g) ?? []).length;
    if (opens !== closes || elements !== opens || tpl.innerHTML !== again) {
        firstBad = `prefix ${n}: ${opens} opened, ${closes} closed, ${elements} parsed`;
    }
}
ok(`all ${DOC.length + 1} prefixes are closed and parse without repair`, !firstBad, firstBad ?? '');

done();
