/**
 * Confirm Dialog Component
 * Location: ui/components/confirm_dialog.js
 *
 * Thin delegator over the canonical modal helpers in
 * `ecoagent/ui/modal.js`. Every dialog signature here is preserved so
 * the 10+ call sites across notebook/data/results/ai pages keep
 * working unchanged; under the hood, all four standard dialogs now
 * flow through `openConfirm` / `openForm` / `openModal` so they
 * inherit the TUI styling (`▸ TITLE` strip, accent-blue primary
 * action, square frame, Tab focus trap).
 *
 * The one custom case is `showRunProgressDialog`, which exposes an
 * imperative `update / complete / cancelled / close` API and so
 * stays as a direct `ManagedWindow` build — but it still benefits
 * from the focus trap + chrome by virtue of `modal: true`.
 */

import { ManagedWindow } from './managed_window.js';
import {
    openConfirm, openForm, openModal,
} from './modal.js';

// Counter — used only by showRunProgressDialog which still builds its
// own ManagedWindow. The migrated helpers don't need it.
let dialogIdCounter = 0;

/**
 * Show a confirmation dialog. Delegates to `openConfirm`.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.icon='warning']
 * @param {string} [options.okLabel='OK']
 * @param {string} [options.cancelLabel='Cancel']
 * @param {string} [options.okVariant='primary'] - 'primary' or 'danger'
 * @returns {Promise<boolean>}
 */
export async function showConfirmDialog(options = {}) {
    const {
        title = 'Confirm',
        message = 'Are you sure?',
        icon = 'warning',
        okLabel = 'OK',
        cancelLabel = 'Cancel',
        okVariant = 'primary',
    } = options;
    return openConfirm({
        title,
        message,
        icon,
        confirmLabel: okLabel,
        cancelLabel,
        danger: okVariant === 'danger',
    });
}

/**
 * Show a delete-confirmation dialog. Always danger-styled.
 * @returns {Promise<boolean>}
 */
export async function showDeleteConfirmDialog(options = {}) {
    const {
        itemName = '',
        itemType = 'item',
        additionalMessage = '',
    } = options;
    let message = `Delete ${itemType}`;
    if (itemName) message += ` "${itemName}"`;
    message += '?';
    if (additionalMessage) message += `<br><br>${escapeHtml(additionalMessage)}`;
    return openConfirm({
        title:        `Delete ${capitalize(itemType)}`,
        message,
        icon:         'delete',
        confirmLabel: 'Delete',
        cancelLabel:  'Cancel',
        danger:       true,
    });
}

/**
 * Show a close-confirmation dialog.
 * @returns {Promise<boolean>}
 */
export async function showCloseConfirmDialog(options = {}) {
    const {
        itemName = '',
        itemType = 'tab',
    } = options;
    let message = `Close ${itemType}`;
    if (itemName) message += ` "${itemName}"`;
    message += '?';
    return openConfirm({
        title:        `Close ${capitalize(itemType)}`,
        message,
        icon:         'close',
        confirmLabel: 'Close',
        cancelLabel:  'Cancel',
    });
}

/**
 * Show a dialog with multiple action buttons. Delegates to `openModal`
 * so each action maps to a button in the canonical footer.
 * @returns {Promise<string|null>}
 */
export async function showChoiceDialog(options = {}) {
    const {
        title = 'Choose',
        message = '',
        icon = 'warning',
        actions = [],
    } = options;
    const content = document.createElement('div');
    content.className = 'twm-confirm-dialog__body';
    content.innerHTML = `
        <span class="twm-confirm-dialog__icon material-symbols-outlined">${escapeHtml(icon)}</span>
        <div class="twm-confirm-dialog__message">${escapeHtml(message)}</div>
    `;
    return openModal({
        title,
        icon,
        content,
        width:  480,
        height: 220,
        actions: actions.map((a) => ({
            label:   a.label,
            value:   a.value,
            primary: a.variant === 'primary',
            danger:  a.variant === 'danger',
        })),
    });
}

/**
 * Show a dialog with a dropdown select + OK/Cancel. Delegates to
 * `openForm` with a single select field.
 * @returns {Promise<string|null>}
 */
export async function showSelectDialog(options = {}) {
    const {
        title = 'Select',
        message = '',
        items = [],
        okLabel = 'OK',
        cancelLabel = 'Cancel',
    } = options;
    const fields = [];
    if (message) {
        fields.push({ section: message });
    }
    fields.push({
        name:    '_choice',
        label:   'Choice',
        type:    'select',
        default: items[0]?.value || '',
        options: items.map((i) => ({ value: i.value, label: i.label })),
    });
    // NB: cancelLabel is currently hardcoded as "Cancel" on openForm.
    // openConfirm has cancelLabel; if a caller really needs custom
    // cancel text on openForm, we'd extend openForm there. The
    // explicit no-op suppresses the unused-arg lint.
    void cancelLabel;
    const data = await openForm({
        title,
        submitLabel: okLabel,
        fields,
    });
    if (!data) return null;
    return data._choice;
}


// ─── helpers ────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}


// ─── showRunProgressDialog (unchanged custom build) ─────────────────
//
// This one exposes an imperative API (`update`, `complete`, `cancelled`,
// `close`) that the openModal/openForm/openConfirm helpers don't model
// — they're one-shot promise-returning. Keep the direct ManagedWindow
// build, but it still gets the TUI chrome + focus trap for free via
// `modal: true`.

/**
 * Show a run progress dialog with spinner, live message updates, and
 * final status. Returns a control object — keep this build instead of
 * delegating so callers retain the imperative update / complete API.
 * @returns {{ update(msg: string): void, complete(result: {ok: boolean, message: string}): void, cancelled(msg?: string): void, close(): void }}
 */
export function showRunProgressDialog(options = {}) {
    const {
        title = 'Running Pipeline',
        message = 'Starting…',
        onCancel,
    } = options;

    const dialogId = `run-progress-${++dialogIdCounter}`;
    let finished = false;

    const contentEl = document.createElement('div');
    contentEl.className = 'twm-confirm-dialog__content run-progress';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'twm-run-progress__body';
    bodyEl.innerHTML = `
        <div class="twm-run-progress__spinner"></div>
        <div class="twm-run-progress__message">${escapeHtml(message)}</div>
    `;
    contentEl.appendChild(bodyEl);

    let stopBtn = null;
    if (typeof onCancel === 'function') {
        const stopActionsEl = document.createElement('div');
        stopActionsEl.className = 'twm-confirm-dialog__actions twm-run-progress__stop-actions';
        stopBtn = document.createElement('button');
        stopBtn.type = 'button';
        stopBtn.className = 'twm-confirm-dialog__btn twm-run-progress__stop-btn';
        stopBtn.innerHTML = '<span class="material-symbols-outlined">stop</span> Stop';
        stopBtn.addEventListener('click', () => {
            stopBtn.disabled = true;
            stopBtn.innerHTML = '<span class="material-symbols-outlined">hourglass_top</span> Stopping…';
            onCancel();
        });
        stopActionsEl.appendChild(stopBtn);
        contentEl.appendChild(stopActionsEl);
    }

    const actionsEl = document.createElement('div');
    actionsEl.className = 'twm-confirm-dialog__actions';
    actionsEl.style.display = 'none';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'twm-confirm-dialog__btn twm-confirm-dialog__btn--primary';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => dialogWindow.close());
    actionsEl.appendChild(closeBtn);
    contentEl.appendChild(actionsEl);

    const dialogWindow = new ManagedWindow({
        id: dialogId,
        title,
        icon: 'play_arrow',
        content: contentEl,
        minWidth: 320,
        minHeight: 120,
        defaultWidth: 420,
        defaultHeight: 200,
        canMinimize: false,
        canMaximize: false,
        canResize: false,
        canDrag: false,
        modal: true,
    });
    dialogWindow.show();

    const messageEl = bodyEl.querySelector('.twm-run-progress__message');
    const spinnerEl = bodyEl.querySelector('.twm-run-progress__spinner');

    return {
        update(msg) {
            if (finished || !messageEl) return;
            messageEl.textContent = msg;
        },
        complete(result) {
            if (finished) return;
            finished = true;
            if (spinnerEl) spinnerEl.style.display = 'none';
            if (stopBtn) stopBtn.parentElement.style.display = 'none';
            if (messageEl) {
                messageEl.textContent = result?.message || '';
                messageEl.className = `twm-run-progress__message ${result?.ok ? 'is-ok' : 'is-err'}`;
            }
            actionsEl.style.display = '';
        },
        cancelled(msg) {
            if (finished) return;
            finished = true;
            if (spinnerEl) spinnerEl.style.display = 'none';
            if (stopBtn) stopBtn.parentElement.style.display = 'none';
            if (messageEl) {
                messageEl.textContent = msg || 'Cancelled.';
                messageEl.className = 'twm-run-progress__message is-cancelled';
            }
            actionsEl.style.display = '';
        },
        close() {
            try { dialogWindow.close(); } catch { /* already closed */ }
        },
    };
}
