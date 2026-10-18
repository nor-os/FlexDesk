---
id: 55
type: story
title: "A safe-by-default markdown renderer with math and extension hooks; HelpModal accepts markdown topics"
status: review
parent: 54
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: help
labels: [markdown, security, new-component]
links: [relates-to BUG-0010]
created: 2026-10-17
updated: 2026-10-17T23:33Z
---

## Description

renderMarkdown(source, options) -> string covering a CommonMark-ish subset (headings, lists, quotes, fenced code with highlighter hook, tables, rules, links, images). Escapes by default, raw HTML only via an explicit allow-list (empty by default), http(s)/mailto/#anchor links only with rel='noopener noreferrer', optional math hook defaulting to window.katex, caller-registered inline and block rules, inline-only mode, and well-formed output for partially streamed source.

Related EcoSim records: EcoSim STORY-0084 (`../EcoSim/backlog/STORY-0084.md`); EcoSim STORY-0050 (`../EcoSim/backlog/STORY-0050.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] `<img src=x onerror=alert(1)>` in source renders as escaped text by default
- [x] A [x](javascript:alert(1)) link renders inert
- [x] $a^2$ renders through KaTeX when present and as escaped source when not
- [x] A registered inline rule for the token [[ref:x]] replaces it with the rule's returned HTML
- [x] Rendering each prefix of a streamed document produces HTML with no unclosed element
- [x] HelpModal shows a topic supplied as markdown as rendered headings and code

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-17 · norman_agent · status: in-progress -> review
- 2026-10-17 · norman_agent · assignee: norman_agent -> norman

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 6 acceptance criteria, 5 points, parented to EPIC-0054. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-17T23:33Z · norman_agent (status: in-progress -> review)

Built: new module `src/ui/utils/markdown.js` exporting `renderMarkdown(source, options)` -> HTML string, covering a CommonMark-ish subset: headings, paragraphs, emphasis/strong/strikethrough, code spans and fenced code with a `highlight(code, lang)` hook, block quotes, nested ordered/unordered lists, GFM pipe tables with alignment, rules, links, images, autolinks, hard breaks, backslash escapes, and `$...$` / `$$...$$` math.

- Raw HTML is escaped by default. `allowHtml` names tags that may pass through (tag only, never attributes); it throws for tags that run or embed anything (script, iframe, svg, img, ...), closes an allowed tag left open at the end of its paragraph, and shows a closer with no opener as text.
- Links only to http(s), mailto or #anchor, always with rel="noopener noreferrer"; any other target renders the link text with no anchor. Images load from http(s) or a relative path, otherwise the alt text is shown.
- Math defaults to `window.katex`, looked up on each call; without KaTeX, or if it throws, the source is shown escaped. `math: false` turns it off, or a custom `(tex, {display})` function can be passed.
- Caller rules: `inlineRules` `{pattern, render}` and `blockRules` `{start, end?, render}`; a render answering null declines; render gets `ctx.escape` and `ctx.inline`.
- Inline-only mode (`inline: true`).
- Every element opened is closed, so any prefix of a streamed document renders to balanced HTML.

HelpModal: a provider's `loadTopic` may now answer `{title, markdown}`, rendered with renderMarkdown and the provider's optional `markdownOptions`. `{title, html}` works as before (trusted HTML, inserted verbatim). Typedefs in `help_registry.js` (HelpProvider.markdownOptions, new HelpTopic) and the header of `help_modal.js` updated. `widgets.js` now exports markdown.js (41 modules); README has a new section "Markdown: `renderMarkdown` (0.17.0)". No application names in the new code.

Ticked all 6 criteria: escaped `<img onerror>`; inert `javascript:` link; `$a^2$` through KaTeX when present and escaped when not; inline rule for `[[ref:x]]`; balanced HTML for every streamed prefix; HelpModal rendering a markdown topic as headings and code. Covered by the new suites `tests/markdown.test.mjs` (pure) and `tests/help_modal_markdown.test.mjs` (jsdom via flow_env.mjs).

Not done here: the table of contents BUG-0010 asks for is not built, and the line about it at the top of help_modal.js is unchanged. BUG-0010's reproducer returns `{html: '# Heading'}`, and html stays verbatim by contract, so that bug is only partly addressed (markdown topics now render, and the HelpTopic typedef says html must be pre-rendered trusted HTML). Left for BUG-0010.

Branch `story-0055`, rebased onto origin/main and landed on main by fast-forward at d2dd5f0.

Tests: after the rebase, `node tests/run.mjs` (Linux node) in the worktree: "FLEXDESK TESTS: GREEN — 123 suite(s)", exit 0, no `: SKIPPED` lines. `node build.mjs` succeeded (widgets 262.7 kB); dist/ was reset and is not committed.

App check: no separate app run. The HelpModal path was exercised in jsdom by `tests/help_modal_markdown.test.mjs`, which passes.
