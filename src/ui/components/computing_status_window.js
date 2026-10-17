/**
 * Computing Status Window
 *
 * Lightweight ManagedWindow that shows a spinner (or a progress bar) and a
 * status message while a long-running computation is in progress. Returns a
 * handle with update(), setProgress(), setStep(), complete(), cancelled(),
 * close() and a `result` promise.
 *
 * Optionally shows a Cancel button when an onCancel callback is provided.
 * Only one is open at a time: opening another closes the first, which then
 * settles as cancelled.
 */

import { ManagedWindow } from './managed_window.js';
import { mountJobProgress } from './job_progress.js';

let _activeWindow = null;

/**
 * Show a computing status window.
 *
 * `result` settles once: `complete({ok, message})` gives `done` or `error`
 * (the window stays, with a Close button, until closed), `cancelled()` gives
 * `cancelled`, and so does closing the window while it runs — by its × or
 * Escape, which also calls `onCancel`, or by `close()`, which does not.
 *
 * @param {Object} options
 * @param {string} [options.title='Computing...'] - Window title
 * @param {string} [options.message=''] - Status message below spinner (markup; `update` takes text)
 * @param {string} [options.icon='hourglass_top'] - Material icon name
 * @param {Function} [options.onCancel] - If provided, shows a Cancel button. Called once when clicked.
 * @param {boolean|Object} [options.progress] - A ProgressBar in place of the spinner: `true` or its options.
 * @param {Array} [options.steps] - StepProgress steps, shown above the message.
 * @returns {{ update(msg: string): void, setProgress(next: number|Object): void,
 *   setStep(which: string|number, opts?: {pass?: number, passes?: number}): void,
 *   complete(result: {ok: boolean, message?: string}): void, cancelled(msg?: string): void,
 *   close(): void, result: Promise<{status: 'done'|'error'|'cancelled', message: string}> }}
 */
export function showComputingWindow({
    title = 'Computing...', message = '', icon = 'hourglass_top', onCancel,
    progress = null, steps = null,
} = {}) {
    if (_activeWindow) {
        _activeWindow.close({ force: true });
        _activeWindow = null;
    }

    let finished = false;
    let closingFromHandle = false;
    let settle;
    const result = new Promise((resolve) => { settle = resolve; });

    const content = document.createElement('div');
    content.className = 'twm-computing-status';
    const spinnerEl = document.createElement('div');
    spinnerEl.className = 'twm-computing-status__spinner';
    const msgEl = document.createElement('div');
    msgEl.className = 'twm-computing-status__message';
    // The opening message is markup, as it always was; every later one is text.
    msgEl.innerHTML = message;
    content.appendChild(spinnerEl);
    const job = mountJobProgress(content, { progress, steps, spinner: spinnerEl });
    content.appendChild(msgEl);

    let cancelBtn = null;
    if (typeof onCancel === 'function') {
        cancelBtn = document.createElement('button');
        cancelBtn.className = 'twm-computing-status__cancel-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            cancelBtn.disabled = true;
            msgEl.textContent = 'Cancelling...';
            onCancel();
        }, { once: true });
        content.appendChild(cancelBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'twm-computing-status__cancel-btn twm-computing-status__close-btn';
    closeBtn.textContent = 'Close';
    closeBtn.hidden = true;
    content.appendChild(closeBtn);

    const finish = (status, text) => {
        finished = true;
        spinnerEl.hidden = true;
        if (cancelBtn) cancelBtn.hidden = true;
        msgEl.textContent = text;
        msgEl.classList.toggle('is-ok', status === 'done');
        msgEl.classList.toggle('is-err', status === 'error');
        msgEl.classList.toggle('is-cancelled', status === 'cancelled');
        job.finish(status);
        settle({ status, message: text });
    };

    const win = new ManagedWindow({
        id: 'computing-status-window',
        title,
        icon,
        content,
        minWidth: 320,
        minHeight: 140,
        defaultWidth: 380,
        defaultHeight: (onCancel ? 190 : 160) + (job.bar ? 30 : 0) + (job.steps ? 40 : 0),
        canMinimize: true,
        canMaximize: false,
        canResize: false,
        canDrag: true,
        modal: false,
        onClose: () => {
            if (_activeWindow === win) _activeWindow = null;
            if (finished) return;
            finish('cancelled', 'Cancelled.');
            if (!closingFromHandle && typeof onCancel === 'function') onCancel();
        },
    });
    closeBtn.addEventListener('click', () => win.close());
    _activeWindow = win;
    win.show();

    return {
        result,
        update(msg) {
            if (finished) return;
            msgEl.textContent = msg;
        },
        setProgress(next) {
            if (finished) return;
            job.setProgress(next);
        },
        setStep(which, opts) {
            if (finished) return;
            job.setStep(which, opts);
        },
        complete(res) {
            if (finished) return;
            finish(res?.ok ? 'done' : 'error', res?.message || '');
            closeBtn.hidden = false;
        },
        cancelled(msg) {
            if (finished) return;
            finish('cancelled', msg || 'Cancelled.');
            closeBtn.hidden = false;
        },
        close() {
            closingFromHandle = true;
            try { win.close({ force: true }); } finally { closingFromHandle = false; }
        },
    };
}
