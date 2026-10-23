# Markdown and document outline

> **Package:** `@flexdesk/widgets` · [All docs](../README.md)

`renderMarkdown` turns a CommonMark-ish subset of Markdown into an HTML string. `createDocumentOutline` lists a long document's sections, numbered, marks the one in view while the document scrolls, and goes to one on a click.

## Markdown: `renderMarkdown` (0.17.0)

`renderMarkdown(source, options)` (`@flexdesk/widgets`) returns an HTML
string. It covers a CommonMark-ish subset — ATX headings, paragraphs,
emphasis, strong, `~~strike~~`, code spans, fenced code, block quotes, nested
ordered and unordered lists, GFM pipe tables, rules, links, images, autolinks,
hard breaks and `$…$` / `$$…$$` math — and is **safe by default**:

- raw HTML is escaped: `<img src=x onerror=alert(1)>` shows as that text.
  `allowHtml: ['kbd', 'br']` lets named tags through, the tag only and never
  its attributes; a tag that runs or embeds anything (`script`, `iframe`,
  `svg`, `img`, …) throws. An allowed tag left open is closed at the end of its
  paragraph.
- a link goes out only to `http(s):`, `mailto:` or a `#anchor`, always with
  `rel="noopener noreferrer"`; a `javascript:` link (or any other) renders its
  text and no anchor. An image loads from `http(s):` or a relative path, or
  shows its alt text.

```js
import { renderMarkdown } from '@flexdesk/widgets';

el.innerHTML = renderMarkdown(source, {
    highlight: (code, lang) => myHighlighter(code, lang),   // null: escaped
    math: undefined,      // default: window.katex when present, else the escaped source
                          // false: `$` is text; or (tex, { display }) => html | null
    inlineRules: [{ pattern: /\[\[ref:([\w-]+)\]\]/, render: (m, ctx) => `<a href="#${ctx.escape(m[1])}">…</a>` }],
    blockRules:  [{ start: /^:::(\w+)/, end: /^:::$/, render: ({ lines, match, closed }, ctx) => '…' }],
    inline: false,        // true: inline markup only, no blocks, no <p>
});
```

What the caller returns — the highlighter's, the math hook's and the rules'
HTML — is trusted and goes in as it is; a rule answering `null` declines.
`ctx` gives a rule `escape(text)` and `inline(text)`. Not in the subset:
setext headings, indented code blocks, reference links, raw HTML blocks.

**Streaming.** Every element it opens it closes, so each prefix of a document
arriving token by token renders to balanced HTML: an open fence is closed at
the end of the input, and an emphasis or link whose closer has not arrived is
still text. `tests/markdown.test.mjs` renders every prefix of a document using
every construct and checks the tags balance; `tests/help_modal_markdown.test.mjs`
checks jsdom has nothing to repair.

**Help topics in markdown.** A `HelpProvider`'s `loadTopic` may now answer
`{ title, markdown }`; the modal renders it with `renderMarkdown` and the
provider's optional `markdownOptions`. `{ title, html }` is unchanged:
pre-rendered, **trusted** HTML, inserted as it is.

**A table of contents for a help topic.** A topic with two or more headings,
markdown or html, gets its contents between the breadcrumb and the article: a
`createDocumentOutline` (below) of its `h1`–`h6`, numbered, the one in view
marked as the content pane scrolls, a click that scrolls to its heading. The
outline points at the heading elements themselves, so your markup needs no
ids and the modal adds none; a topic with one heading or none shows no
contents (the empty `.help-content__toc` is `hidden`). Until now the modal's
documentation promised this and drew nothing. `tests/help_modal_toc.test.mjs`
drives it in jsdom (BUG-0010).

## A document outline: `createDocumentOutline` (0.17.0)

A long document's sections, listed and numbered, the one in view marked while
the document scrolls, and a click that goes to one (in `@flexdesk/widgets`):

```js
const outline = createDocumentOutline(sidebarEl, {
    entries: [{ id: 'intro', level: 1, label: 'Introduction' },
              { id: 'scope', level: 2, label: 'Scope' }],
    numbering: true,                 // 1, 1.1, 1.2, 2 …
    maxDepth: 3,                     // deeper entries are drawn at depth 3
    scrollContainer: articleEl,      // the element that scrolls; the spy's root
    resolveTarget: (entry, container) => container.querySelector(`[data-section="${entry.id}"]`),
    rootMargin: '0px 0px -70% 0px',  // the default: the top 30% is "in view"
    onSelect: (id, entry) => { /* … */ },
    emptyState: 'No headings',
});
outline.setEntries(next);            // the document has other sections now
outline.refresh();                   // the same sections, re-rendered: resolve again
outline.setActive('scope');  outline.getActive();
const off = outline.onActiveChange((id, entry) => { /* … */ });
outline.dispose();
```

Where the entries come from is yours: the outline is told `{id, level, label}`
and, through `resolveTarget` (by default the element in the container whose
`id` is the entry's), which element each one stands for. Labels are text.
Numbers are hierarchical, and a skipped level is one step deeper, not two:
levels 1, 3, 3, 2 are 1, 1.1, 1.2, 1.3.

Of the targets an IntersectionObserver rooted at `scrollContainer` reports in
view, the one listed first is active; with none in view the last one stays. An
entry whose target does not resolve is listed, but never watched and never
active, and `setActive` refuses it (`false`). A click marks its entry at once,
scrolls its target into view (`scrollOnSelect: false` leaves that to
`onSelect`) and suppresses the spy while the scroll passes the sections in
between, until the container's `scrollend` or, without one, `scrollEndTimeout`
(1000 ms). `dispose()` disconnects the observer and clears that timer. The
indent per level is `--twm-doc-outline-indent` (12px).

`tests/document_outline.test.mjs` drives it in jsdom with a hand-fired
observer.
