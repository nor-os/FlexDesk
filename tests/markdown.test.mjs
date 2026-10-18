/**
 * STORY-0055 — renderMarkdown: A SAFE-BY-DEFAULT MARKDOWN RENDERER.
 *
 *   §1  raw HTML is escaped by default: `<img src=x onerror=alert(1)>` is
 *       text; `allowHtml` passes named tags through without attributes, and
 *       refuses tags that run or embed anything
 *   §2  links go to http(s), mailto and #anchors only, with
 *       rel="noopener noreferrer"; a javascript: link renders inert
 *   §3  math: `$a^2$` goes through window.katex when it is there and stays
 *       escaped source when it is not; `math: false` and a custom hook
 *   §4  extension hooks: an inline rule replaces [[ref:x]] with its HTML; a
 *       block rule takes a fenced region; a rule answering null declines
 *   §5  inline-only mode
 *   §6  the block subset: headings, lists, quotes, fenced code with the
 *       highlighter hook, tables, rules, images
 *   §7  every prefix of a streamed document renders with no unclosed element
 *   §8  the widgets entry exports it
 *
 *     node tests/markdown.test.mjs
 */
import { assertions } from './flow_env.mjs';

const t = assertions('markdown');
const { check, ok, throws, section, done } = t;

const { renderMarkdown } = await import('../src/ui/utils/markdown.js');

/**
 * Every `<` in `html` starts a tag, and the tags nest and close: the stack of
 * open non-void elements is empty at the end. Returns null or what is wrong.
 */
const VOID = new Set(['br', 'hr', 'img', 'wbr', 'input', 'col', 'area', 'source', 'meta', 'link']);
function unbalanced(html) {
    const stack = [];
    const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:\s+[a-zA-Z-]+(?:="[^"<>]*")?)*\s*(\/?)>/y;
    for (let i = html.indexOf('<'); i !== -1; i = html.indexOf('<', i + 1)) {
        tag.lastIndex = i;
        const m = tag.exec(html);
        if (!m) return `a bare "<" at ${i}: ${JSON.stringify(html.slice(i, i + 30))}`;
        const name = m[2].toLowerCase();
        if (VOID.has(name) || m[3]) continue;
        if (!m[1]) { stack.push(name); continue; }
        const top = stack.pop();
        if (top !== name) return `</${name}> closes <${top ?? 'nothing'}>`;
    }
    return stack.length ? `unclosed: ${stack.join(' > ')}` : null;
}

section('§1 raw HTML is text unless allowed');
const EVIL = '<img src=x onerror=alert(1)>';
check('the img reproducer renders as escaped text',
    renderMarkdown(EVIL), '<p>&lt;img src=x onerror=alert(1)&gt;</p>\n');
ok('no tag of it survives inline either', !/<img/i.test(renderMarkdown(`a ${EVIL} b`, { inline: true })));
check('a script tag is text',
    renderMarkdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n');
check('an attribute-breaking quote is escaped', renderMarkdown('"x\' onload=1', { inline: true }),
    '&quot;x&#39; onload=1');
check('allowHtml passes the tag, never its attributes',
    renderMarkdown('press <kbd onclick="x()">Ctrl</kbd>', { inline: true, allowHtml: ['kbd'] }),
    'press <kbd>Ctrl</kbd>');
check('a tag not on the list stays text',
    renderMarkdown('<b>x</b>', { inline: true, allowHtml: ['kbd'] }), '&lt;b&gt;x&lt;/b&gt;');
check('an allowed tag left open is closed at the end of its span',
    renderMarkdown('<kbd>open', { allowHtml: ['kbd'] }), '<p><kbd>open</kbd></p>\n');
check('a closer with no opener is text',
    renderMarkdown('x</kbd>', { inline: true, allowHtml: ['kbd'] }), 'x&lt;/kbd&gt;');
throws('allowHtml refuses <script>', () => renderMarkdown('x', { allowHtml: ['script'] }), /cannot be allowed/);
throws('allowHtml refuses <iframe>', () => renderMarkdown('x', { allowHtml: ['IFRAME'] }), /cannot be allowed/);
throws('allowHtml refuses a non-tag', () => renderMarkdown('x', { allowHtml: ['a b'] }), /not a tag name/);
check('entities pass as entities', renderMarkdown('&copy; &#169; & <', { inline: true }), '&copy; &#169; &amp; &lt;');

section('§2 links: only safe targets, always noopener');
const inert = renderMarkdown('[x](javascript:alert(1))');
check('a javascript: link renders inert', inert, '<p>x</p>\n');
ok('no href, no anchor', !/<a|href/i.test(inert));
for (const bad of ['JavaScript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'javascript&#58;alert(1)', '/relative', 'file:///etc/passwd']) {
    ok(`inert: ${bad}`, !/<a\b/.test(renderMarkdown(`[x](${bad})`)));
}
check('https link carries rel',
    renderMarkdown('[site](https://example.org "Ex")', { inline: true }),
    '<a href="https://example.org" title="Ex" rel="noopener noreferrer">site</a>');
check('mailto link', renderMarkdown('[m](mailto:a@b.c)', { inline: true }),
    '<a href="mailto:a@b.c" rel="noopener noreferrer">m</a>');
check('#anchor link', renderMarkdown('[top](#top)', { inline: true }),
    '<a href="#top" rel="noopener noreferrer">top</a>');
check('a quote in the URL cannot leave the attribute',
    renderMarkdown('[x](https://a/"onmouseover="alert(1))', { inline: true }),
    '<a href="https://a/&quot;onmouseover=&quot;alert(1)" rel="noopener noreferrer">x</a>');
check('autolink', renderMarkdown('<https://a.b/c>', { inline: true }),
    '<a href="https://a.b/c" rel="noopener noreferrer">https://a.b/c</a>');
check('an image from a javascript: URL shows its alt text',
    renderMarkdown('![alt <b>](javascript:x)', { inline: true }), 'alt &lt;b&gt;');
check('an image from a relative path loads',
    renderMarkdown('![pic](img/a.png)', { inline: true }), '<img src="img/a.png" alt="pic">');
check('link text is markdown', renderMarkdown('[**b**](#x)', { inline: true }),
    '<a href="#x" rel="noopener noreferrer"><strong>b</strong></a>');

section('§3 math');
const calls = [];
const katexStub = {
    renderToString(tex, opts) {
        calls.push([tex, opts]);
        return `<span class="katex">${tex.replace(/[<&]/g, '')}</span>`;
    },
};
check('no KaTeX: $a^2$ is escaped source',
    renderMarkdown('$a^2$ and $<b>$', { inline: true }), '$a^2$ and $&lt;b&gt;$');
globalThis.window = { katex: katexStub };
check('KaTeX present: $a^2$ renders through it',
    renderMarkdown('$a^2$', { inline: true }), '<span class="katex">a^2</span>');
check('…as inline math', calls.at(-1), ['a^2', { displayMode: false, throwOnError: false }]);
check('$$…$$ block renders as display math',
    renderMarkdown('$$\nx^2\n$$'), '<div class="twm-md-math"><span class="katex">x^2</span></div>\n');
check('…in display mode', calls.at(-1)[1].displayMode, true);
check('prices are not math', renderMarkdown('$5 and $6', { inline: true }), '$5 and $6');
calls.length = 0;
check('math: false leaves $ as text', renderMarkdown('$a^2$', { inline: true, math: false }), '$a^2$');
check('…and never calls KaTeX', calls.length, 0);
globalThis.window = { katex: { renderToString() { throw new Error('bad'); } } };
check('a KaTeX that throws falls back to source', renderMarkdown('$x$', { inline: true }), '$x$');
delete globalThis.window;
check('a custom math hook', renderMarkdown('$x$', { inline: true, math: (tex, { display }) => `<m d="${display}">${tex}</m>` }),
    '<m d="false">x</m>');
check('a code span is not math', renderMarkdown('`$a$`', { inline: true, math: () => 'M' }), '<code>$a$</code>');

section('§4 extension rules');
const refRule = { pattern: /\[\[ref:([\w-]+)\]\]/, render: (m, ctx) => `<a class="ref" data-ref="${ctx.escape(m[1])}">${ctx.escape(m[1])}</a>` };
check('an inline rule replaces [[ref:x]] with its HTML',
    renderMarkdown('see [[ref:x]] here', { inlineRules: [refRule] }),
    '<p>see <a class="ref" data-ref="x">x</a> here</p>\n');
check('the rule works inside emphasis',
    renderMarkdown('**[[ref:y]]**', { inline: true, inlineRules: [refRule] }),
    '<strong><a class="ref" data-ref="y">y</a></strong>');
check('a code span wins over the rule',
    renderMarkdown('`[[ref:x]]`', { inline: true, inlineRules: [refRule] }), '<code>[[ref:x]]</code>');
check('a rule answering null declines',
    renderMarkdown('**x**', { inline: true, inlineRules: [{ pattern: /\*\*/, render: () => null }] }),
    '<strong>x</strong>');
check('a g flag on the pattern does not skip ahead',
    renderMarkdown('a @b', { inline: true, inlineRules: [{ pattern: /@(\w+)/g, render: (m) => `<i>${m[1]}</i>` }] }),
    'a <i>b</i>');
check('ctx.inline renders markdown',
    renderMarkdown('{{*x*}}', { inline: true, inlineRules: [{ pattern: /\{\{(.+?)\}\}/, render: (m, ctx) => `<span>${ctx.inline(m[1])}</span>` }] }),
    '<span><em>x</em></span>');
const noteRule = {
    start: /^:::(\w+)/, end: /^:::$/,
    render: ({ lines, match, closed }, ctx) => `<aside class="${match[1]}" data-closed="${closed}">${ctx.inline(lines.slice(1, closed ? -1 : undefined).join(' '))}</aside>`,
};
check('a block rule takes its region',
    renderMarkdown('before\n:::note\n*a*\n:::\nafter', { blockRules: [noteRule] }),
    '<p>before</p>\n<aside class="note" data-closed="true"><em>a</em></aside>\n<p>after</p>\n');
check('an unterminated block runs to the end, closed: false',
    renderMarkdown(':::tip\nhalf', { blockRules: [noteRule] }),
    '<aside class="tip" data-closed="false">half</aside>\n');
throws('a rule without a RegExp is refused', () => renderMarkdown('x', { inlineRules: [{ pattern: 'x', render() {} }] }), /RegExp/);

section('§5 inline-only mode');
check('no <p>, no blocks', renderMarkdown('# not a heading *em*', { inline: true }), '# not a heading <em>em</em>');

section('§6 the block subset');
check('headings', renderMarkdown('# One\n### Three ###'), '<h1>One</h1>\n<h3>Three</h3>\n');
check('a fence without the highlighter is escaped',
    renderMarkdown('```js\nif (a < b) {}\n```'), '<pre><code class="language-js">if (a &lt; b) {}\n</code></pre>\n');
const hl = [];
check('the highlighter hook gives the code its HTML',
    renderMarkdown('```py\nx = 1\n```', { highlight: (code, lang) => (hl.push([code, lang]), `<span class="k">${code}</span>`) }),
    '<pre><code class="language-py"><span class="k">x = 1\n</span></code></pre>\n');
check('…called with the code and the language', hl, [['x = 1\n', 'py']]);
check('a highlighter answering null falls back to escaping',
    renderMarkdown('```\n<b>\n```', { highlight: () => null }), '<pre><code>&lt;b&gt;\n</code></pre>\n');
check('nested lists', renderMarkdown('- a\n  - b\n- c'),
    '<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul></li>\n<li>c</li>\n</ul>\n');
check('an ordered list keeps its start', renderMarkdown('3. x\n4. y'), '<ol start="3">\n<li>x</li>\n<li>y</li>\n</ol>\n');
check('a loose list has paragraphs', renderMarkdown('- a\n\n- b'), '<ul>\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>\n');
check('a block quote', renderMarkdown('> **q**\n> r'), '<blockquote>\n<p><strong>q</strong>\nr</p>\n</blockquote>\n');
check('a table with alignment', renderMarkdown('| a | b |\n|:-:|---|\n| 1 | `x|y` |'),
    '<table>\n<thead>\n<tr><th style="text-align: center">a</th><th>b</th></tr>\n</thead>\n'
    + '<tbody>\n<tr><td style="text-align: center">1</td><td><code>x|y</code></td></tr>\n</tbody>\n</table>\n');
check('a rule', renderMarkdown('a\n\n***\n\nb'), '<p>a</p>\n<hr>\n<p>b</p>\n');
check('a hard break', renderMarkdown('a  \nb'), '<p>a<br>\nb</p>\n');
check('emphasis forms', renderMarkdown('*a* _b_ **c** __d__ ***e*** ~~f~~ snake_case_word', { inline: true }),
    '<em>a</em> <em>b</em> <strong>c</strong> <strong>d</strong> <strong><em>e</em></strong> <del>f</del> snake_case_word');
check('a backslash escape', renderMarkdown('\\*not em\\*', { inline: true }), '*not em*');
check('null source is empty', renderMarkdown(null), '');

section('§7 every prefix of a streamed document is balanced');
const DOC = [
    '# Streaming *reply* with [[ref:fig-1]]',
    '',
    'Some **bold _nested_ text** and `code` and a [link](https://example.org "t") and',
    'an ![image](https://example.org/a.png) and <kbd>Ctrl</kbd>+<kbd>K</kbd> and $a^2 + b$.',
    '',
    '> quoted **strong** and *em*',
    '> - a list in a quote',
    '',
    '- item one with `code`',
    '- item two',
    '  1. nested *ordered*',
    '  2. second',
    '',
    '```js',
    'const x = a < b && c > d;',
    '```',
    '',
    '| col *a* | col b |',
    '|:--|--:|',
    '| 1 | **2** |',
    '',
    '$$',
    'e = mc^2',
    '$$',
    '',
    ':::note',
    'a note',
    ':::',
    '',
    '---',
    'Tail ~~struck~~ <https://auto.example>',
].join('\n');
const streamOptions = {
    allowHtml: ['kbd'],
    inlineRules: [refRule],
    blockRules: [noteRule],
    highlight: (code) => `<span class="hl">${code.replace(/[<>&]/g, '')}</span>`,
    math: (tex, { display }) => `<span class="m${display ? ' d' : ''}">${tex.replace(/[<>&]/g, '')}</span>`,
};
let firstBad = null;
for (let n = 0; n <= DOC.length && !firstBad; n++) {
    for (const opts of [streamOptions, {}]) {
        const why = unbalanced(renderMarkdown(DOC.slice(0, n), opts));
        if (why) { firstBad = `prefix ${n} (${JSON.stringify(DOC.slice(Math.max(0, n - 20), n))}): ${why}`; break; }
    }
}
ok(`all ${DOC.length + 1} prefixes, with and without extensions, are balanced`, !firstBad, firstBad ?? '');
ok('the checker itself catches an unclosed element', unbalanced('<p><em>x</p>') !== null);
ok('…and a bare <', unbalanced('<p>a < b</p>') !== null);
const full = renderMarkdown(DOC, streamOptions);
for (const needle of ['<h1>', '<blockquote>', '<ol>', '<pre><code class="language-js"><span class="hl">',
    '<table>', '<span class="m d">', '<aside class="note"', '<hr>', '<del>', '<kbd>Ctrl</kbd>', 'class="ref"']) {
    ok(`the whole document renders ${needle}`, full.includes(needle));
}

section('§8 the widgets entry exports it');
const widgets = await import('../widgets.js').catch((e) => ({ error: e }));
ok('widgets.js exports renderMarkdown', widgets.renderMarkdown === renderMarkdown, String(widgets.error ?? ''));

done();
