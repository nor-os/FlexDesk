# Wizard

> **Package:** `@flexdesk/widgets` · [All docs](../README.md)

A multi-step flow: a step indicator, a body slot and a footer with Cancel, Back and Next (Finish on the last step). Mount it inline in your page, or open it in a modal `ManagedWindow`.

## A step wizard: `Wizard` (0.17.0)

`new Wizard({ steps, data, onFinish, onCancel, labels })` (in `@flexdesk/widgets`)
draws a multi-step flow: a step indicator, a body slot and a footer with Cancel,
Back and Next (Finish on the last step). Mount it inline with `mount(el)`, or in a
modal `ManagedWindow` with `openInWindow({ id, title, ... })`.

```js
const wizard = new Wizard({
    data: { file: null },
    steps: [
        { id: 'source', label: 'Source', icon: 'upload_file',
          render(bodyEl, ctx) {            // once per visit; may return a cleanup function
              const input = picker(bodyEl);
              input.onchange = () => { ctx.data.file = input.files[0]; ctx.revalidate(); };
          },
          canAdvance: (ctx) => ctx.data.file
              ? { ok: true } : { ok: false, hint: 'Choose a file first' } },
        { id: 'review', label: 'Review', render: (bodyEl, ctx) => review(bodyEl, ctx.data) },
    ],
    onFinish: async (ctx) => api.import(ctx.data),   // a rejection marks the step as error
    onCancel: () => {},
});
wizard.openInWindow({ id: 'import', title: 'Import' });
```

- **Gating.** While the current step's `canAdvance(ctx)` answers `{ok: false, hint}`,
  Next is disabled and the hint is shown in the footer. `revalidate()` (also
  `ctx.revalidate()`) asks again and redraws the indicator and the footer; it never
  re-renders the body, so an input keeps its focus and its value.
- **Steps** are drawn done / current / upcoming / error, joined by a connector. A
  done step is a button that jumps back to it; an upcoming step is inert, so the
  only way forward is Next.
- **Moves.** `next()`, `back()` and `goTo(idOrIndex)` (back to any earlier step, or
  forward one step through the gate) resolve `true` when they moved.
  `setStepState(id, 'error' | null, message)` marks or clears a step.
- **Finish.** On the last step Next reads Finish and calls `onFinish(ctx)`. Until
  it settles every button is disabled and moves, cancels and closes are refused,
  not queued. Resolved, the wizard closes; rejected, the step is marked as error
  and the rejection's message is shown, and Finish can be pressed again.
- **Cancel** (the button, `cancel()`, or the window's close button and Escape)
  closes the wizard and calls `onCancel(ctx)` exactly once. `dispose()` tears it
  down without calling either callback.

Every transition goes through a core `StateMachine` (`step`, `finishing`,
`finished`, `cancelled`; pass `eventBus` to see its `fsm:*` events). `ctx` is
`{data, step, index, revalidate, next, back, goTo, setStepState}`, with `data`
the object you passed.
