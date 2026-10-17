/**
 * The progress block both job dialogs share — `showRunProgressDialog` and
 * `showComputingWindow` — so a bar and a row of phases behave the same in
 * either. Internal: not in the `widgets` barrel.
 */

import { ProgressBar, StepProgress } from './progress.js';

/**
 * Mount the optional phases and bar into `parent`, phases first.
 *
 * @param {HTMLElement} parent
 * @param {{ progress?: boolean|Object, steps?: Array, spinner?: HTMLElement|null }} options
 *   `progress`: `true`, or ProgressBar options (its `onCancel` is ignored: the
 *   dialog owns cancelling). `steps`: StepProgress steps. `spinner`: hidden
 *   while a bar is shown.
 */
export function mountJobProgress(parent, { progress = null, steps = null, spinner = null } = {}) {
    const stepper = Array.isArray(steps) && steps.length
        ? new StepProgress(parent, { steps, className: 'twm-job-progress__steps' })
        : null;
    let bar = null;
    const ensureBar = (opts = {}) => {
        if (bar) return bar;
        const { onCancel: _ignored, ...rest } = opts && typeof opts === 'object' ? opts : {};
        bar = new ProgressBar(parent, { ...rest, className: 'twm-job-progress__bar' });
        if (spinner) spinner.hidden = true;
        return bar;
    };
    if (progress) ensureBar(progress);

    return {
        get bar() { return bar; },
        get steps() { return stepper; },
        /** `bar.update(next)`; adds the bar if the dialog was opened without one. */
        setProgress(next) { ensureBar().update(next); },
        /** `steps.setStep(which, opts)`. */
        setStep(which, opts) {
            if (!stepper) throw new Error('setStep: this dialog was opened without `steps`');
            stepper.setStep(which, opts);
        },
        /** Put the bar and the phases in their final state. */
        finish(status) {
            if (status === 'done') { bar?.setState('done'); stepper?.complete(); }
            else if (status === 'error') { bar?.setState('error'); stepper?.fail(); }
            else bar?.setState('cancelled');
        },
    };
}
