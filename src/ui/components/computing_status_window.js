/**
 * Computing Status Window
 *
 * Lightweight ManagedWindow that shows a spinner and status message
 * while a long-running computation is in progress. Returns a handle
 * with update() and close() methods.
 *
 * Optionally shows a Cancel button when an onCancel callback is provided.
 */

import { ManagedWindow } from './managed_window.js';

let _activeWindow = null;

/**
 * Show a computing status window.
 * @param {Object} options
 * @param {string} [options.title='Computing...'] - Window title
 * @param {string} [options.message=''] - Status message below spinner
 * @param {string} [options.icon='hourglass_top'] - Material icon name
 * @param {Function} [options.onCancel] - If provided, shows a Cancel button. Called once when clicked.
 * @returns {{ update(msg: string): void, close(): void }}
 */
export function showComputingWindow({ title = 'Computing...', message = '', icon = 'hourglass_top', onCancel } = {}) {
    if (_activeWindow) {
        _activeWindow.close();
        _activeWindow = null;
    }

    const content = document.createElement('div');
    content.className = 'twm-computing-status';
    content.innerHTML = `
        <div class="twm-computing-status__spinner"></div>
        <div class="twm-computing-status__message">${message}</div>
    `;

    if (typeof onCancel === 'function') {
        const btn = document.createElement('button');
        btn.className = 'twm-computing-status__cancel-btn';
        btn.textContent = 'Cancel';
        btn.addEventListener('click', () => {
            btn.disabled = true;
            const msgEl = content.querySelector('.twm-computing-status__message');
            if (msgEl) msgEl.textContent = 'Cancelling...';
            onCancel();
        }, { once: true });
        content.appendChild(btn);
    }

    _activeWindow = new ManagedWindow({
        id: 'computing-status-window',
        title,
        icon,
        content,
        minWidth: 320,
        minHeight: 140,
        defaultWidth: 380,
        defaultHeight: onCancel ? 190 : 160,
        canMinimize: true,
        canMaximize: false,
        canResize: false,
        canDrag: true,
        modal: false,
        onClose: () => { _activeWindow = null; },
    });

    _activeWindow.show();

    return {
        update(msg) {
            const el = content.querySelector('.twm-computing-status__message');
            if (el) el.textContent = msg;
        },
        close() {
            if (_activeWindow) {
                _activeWindow.close();
                _activeWindow = null;
            }
        },
    };
}
