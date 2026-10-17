---
id: 55
type: story
title: "A safe-by-default markdown renderer with math and extension hooks; HelpModal accepts markdown topics"
status: draft
parent: 54
phase:
assignee:
reporter: norman
due:
points: 5
subsystem: help
labels: [markdown, security, new-component]
links: [relates-to BUG-0010]
created: 2026-10-17
updated: 2026-10-17T07:55Z
---

## Description

renderMarkdown(source, options) -> string covering a CommonMark-ish subset (headings, lists, quotes, fenced code with highlighter hook, tables, rules, links, images). Escapes by default, raw HTML only via an explicit allow-list (empty by default), http(s)/mailto/#anchor links only with rel='noopener noreferrer', optional math hook defaulting to window.katex, caller-registered inline and block rules, inline-only mode, and well-formed output for partially streamed source.

Related EcoSim records: EcoSim STORY-0084 (`../EcoSim/backlog/STORY-0084.md`); EcoSim STORY-0050 (`../EcoSim/backlog/STORY-0050.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [ ] `<img src=x onerror=alert(1)>` in source renders as escaped text by default
- [ ] A [x](javascript:alert(1)) link renders inert
- [ ] $a^2$ renders through KaTeX when present and as escaped source when not
- [ ] A registered inline rule for the token [[ref:x]] replaces it with the rule's returned HTML
- [ ] Rendering each prefix of a streamed document produces HTML with no unclosed element
- [ ] HelpModal shows a topic supplied as markdown as rendered headings and code
