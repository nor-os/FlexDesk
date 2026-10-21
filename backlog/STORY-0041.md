---
id: 41
type: story
title: "openForm selects take dependent, disabled and grouped options; multi-select and radio fields exist"
status: done
parent: 40
phase:
assignee: norman
reporter: norman
due:
points: 5
subsystem: widgets
labels: [widgets, forms]
links: []
created: 2026-10-17
updated: 2026-10-21T07:42Z
---

## Description

Extends the onFieldChange api from STORY-0011 (status review); lands after it. openForm renders select options once, flat, with no disabled flag, and values are only scalar. Adds api.setOptions(name, options) (keeps the value if still present), option {disabled, reason}, grouped options ({group, options} as optgroup), a 'checklist' field returning an array (required = at least one), and a 'radio' field with per-choice descriptions. Option values come back with their original type. Built on the flow kit's select/choice widgets so there is one implementation.

Related EcoSim records: EcoSim STORY-0057 (`../EcoSim/backlog/STORY-0057.md`); EcoSim STORY-0075 (`../EcoSim/backlog/STORY-0075.md`); EcoSim STORY-0093 (`../EcoSim/backlog/STORY-0093.md`).

Filed from the EcoSim -> FlexDesk 0.16 migration analysis (2026-10-17).

## Acceptance criteria

- [x] setOptions on a select replaces its options while the form is open and keeps the current value when present
- [x] A disabled option shows its reason and can never be the submitted value
- [x] Grouped options render under their headings
- [x] A checklist field submits an array of the checked values
- [x] A required checklist with nothing checked shows a field error on submit
- [x] A select whose option values are numbers resolves numbers, not strings
- [x] Existing openForm tests pass unchanged

## History

- 2026-10-17 · norman_agent · status: draft -> refined
- 2026-10-17 · norman_agent · status: refined -> in-progress
- 2026-10-17 · norman_agent · assignee: (none) -> norman_agent
- 2026-10-19 · norman_agent · status: in-progress -> review
- 2026-10-19 · norman_agent · assignee: norman_agent -> norman
- 2026-10-21 · norman_agent · status: review -> done

## Comments

### 2026-10-17T07:55Z · norman_agent (status: draft -> refined)

Refined: 7 acceptance criteria, 5 points, parented to EPIC-0040. Criteria were drafted from the migration analysis and checked by a coverage and a quality critic; correct them before anything is built against them.

### 2026-10-18T01:57Z · norman_agent

Built on story-0041 @ 32f992e, but an independent review still finds problems after two fix rounds, so it has not landed. (The full test run took more than 20 minutes because many other story worktrees were running their suites at the same time.) Still open:

1. **Branch does not merge into current main.** `git merge-tree --write-tree origin/main HEAD` reports CONFLICT (content) in src/ui/components/modal.js and README.md. main is 20 commits ahead, and STORY-0043 (ToggleField, `type: 'toggle'`) changed the same header doc type list, the `api.set` and submit loops, `_estimateHeight` and `_renderField`, and added its own `data-toggle-slot` mount. Done looks like: rebase story-0041 onto origin/main. The merged modal.js lists 'checkbox' | 'toggle' | 'picker' | 'checklist' | 'radio' in the header doc and keeps the toggle branch in api.set and in the submit read. Ideally one slot-mount pattern serves both toggle and choice fields, rather than two parallel `data-*-slot` mechanisms side by side. The README intro field list includes toggle, and `node tests/run.mjs` is re-run green on the rebased branch.
2. **README overstates what happens to a disabled option in a combobox.** README.md (new section 'Options: typed, unavailable, grouped, and changed while open', the 'A disabled option' bullet) says '`api.set` to it clears the field'. That is false for a combobox (`select` with `create`). Probe in jsdom: options ['ann', {value:'bob', disabled:true}], then `api.set('who','bob')`. The input still holds 'bob' and `api.get('who')` returns 'bob'. The submit refuses it, so the 'never submitted' criterion still holds, but the doc overstates what happens. Done looks like one of two fixes. Either make the combobox branch of `api.set` in modal.js clear (or refuse) a disabled option's text, as the select and radio branches do, with a test in tests/open_form_choices.test.mjs §2. Or narrow the README sentence and the modal.js header doc to select and radio.
3. **AC 'Grouped options render under their headings' is only met for `select`.** `checklist` and `radio` accept `{ group, options }` but drop the heading (choice_controls.js `flatChoices`, used by `toggleChips` and `choiceList`). A probe with groups G1 and G2 in a checklist renders the row text ' C ab ', with no G1 or G2 heading. Done looks like one of two fixes. Either draw a heading per group in toggleChips and choiceList (for example a `.twm-choice__group` label before each group's chips or rows), with a test. Or treat groups as select-only and say so in this record and the docs, instead of accepting them and silently discarding the heading.
4. **Minor style and dead-export points.** src/flow/kit/widgets.js:42 `export { shownValue };` is a pass-through re-export that exists only so src/flow/kit/index.js keeps importing shownValue from './widgets.js'. index.js should import it from '../../ui/components/choice_controls.js' directly. src/ui/components/choice_controls.js exports `sameChoice`, `choiceOption` and `choiceIndex`, but nothing outside the module or the tests uses them. Make them module-private, or justify keeping them public. The new README section heading lacks the version tag that sibling sections carry (e.g. '(0.17.0)'), even though it documents a behaviour change every form sees (typed select values). Add the target version to match the convention.

No criteria ticked yet. Status and assignee are unchanged.

### 2026-10-19T09:10Z · norman_agent (status: in-progress -> review)

Landed on main at 7768f72. Handing back to norman for review.

**What was built.** `openForm` (src/ui/components/modal.js) now has:
- `api.setOptions(name, options)`, which replaces a field's options while the form is open and keeps the current value when the new list still offers it enabled.
- Options of the form `{ value, label?, disabled?, reason?, description? }`. A disabled option shows its reason and is never submitted. This applies to defaults, `api.set` (combobox included), the picker, combobox suggestions, and a submit-time guard.
- `{ group, options }` groups. A select draws them as `<optgroup>`; a checklist and a radio draw a `.twm-choice__group` heading.
- `type: 'checklist'` (an array of values; required means at least one) and `type: 'radio'` (descriptions for each choice).
- Option values that keep their type.

The choice controls are the flow kit's controls, in src/ui/components/choice_controls.js. Toggle fields and choice fields mount through one `data-control-slot` path. The README section is tagged (0.17.0).

**All four open findings from the 2026-10-18T01:57Z comment are fixed.** The fixes are in ba4f3d0 and af711c1 on the branch:
1. The branch now merges cleanly with main.
2. A combobox refuses a disabled option's text.
3. Checklist and radio fields draw group headings.
4. `shownValue` is re-exported straight from choice_controls.js, `sameChoice`, `choiceOption` and `choiceIndex` are no longer exported, and the README heading carries the version tag.

**How it landed.** I could not run a plain `git rebase origin/main`. It replays the pre-merge commits, and that brought back the modal.js and README.md conflicts with STORY-0043 that ba4f3d0 had already resolved. So I landed the work as one commit on top of origin/main (b5e170c). Its tree is exactly `git merge-tree --write-tree origin/main af711c1`, a clean merge whose only differences from af711c1 are main's own BUG-0001/BUG-0003/STORY-0044 changes. It was pushed to main as a fast-forward. origin/story-0041 still holds the pre-rebase history (af711c1), and I left it untouched.

**Ticked: all 7 criteria.** Each one is backed by passing tests:
- setOptions keeps the value: tests/open_form_choices.test.mjs §1
- disabled option with its reason, never submitted: §2
- grouped options under their headings, in select, checklist and radio: §3
- checklist submits an array: §4
- required checklist with nothing checked gives a field error: §4
- numeric option values resolve as numbers: §5
- existing openForm tests unchanged: tests/open_form.test.mjs is identical to main's and passes (48 ok)

**Tests on 7768f72.** I ran `node tests/run.mjs` (Linux node v18.19.1) to completion. It printed "FLEXDESK TESTS: GREEN — 143 suite(s)", exited 0, and had 0 `: SKIPPED` lines. `node tests/open_form_choices.test.mjs` passed (116 ok, all assertions passed). `node build.mjs` succeeded; I restored dist/ and did not commit it.

**App check.** I did not check this in a running app; the only coverage is the jsdom tests above. No EcoSim screen uses the new field types yet; the EcoSim stories that will use them are linked in the description.

### 2026-10-21T07:42Z · norman_agent (status: review -> done)

norman decided on 2026-10-21 (Claude Code session) to release FlexDesk 0.17.0 now and to accept every story on the 0.17.0 list whose code is on main and whose independent agent review passed, without reviewing each record himself. Its code is on main (audited), so it is done and ships in 0.17.0.
