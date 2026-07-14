/**
 * WindowTaskbar - Singleton component that manages minimized windows in the global bottom bar.
 *
 * Listens for window events and renders taskbar buttons for minimized windows.
 * Integrates with the existing global-bottom-bar element.
 */

import { ManagedWindow } from './managed_window.js';

class WindowTaskbarManager {
    constructor() {
        this._minimizedWindows = new Map(); // id -> { title, icon }
        this._containerEl = null;
        this._leftDivider = null;
        this._rightDivider = null;
        this._initialized = false;
    }

    /**
     * Initialize the taskbar. Call once after DOM is ready.
     */
    init() {
        if (this._initialized) return;

        // Find or create the container in the global bottom bar
        const bottomBar = document.querySelector('.twm-global-bottom-bar');
        if (!bottomBar) {
            console.warn('[WindowTaskbar] twm-global-bottom-bar not found');
            return;
        }

        // Create left divider (always present but hidden when no windows)
        this._leftDivider = document.createElement('div');
        this._leftDivider.className = 'twm-bar-windows__divider twm-bar-windows__divider--left';

        // Insert bar-windows container between bar-left and bar-center
        this._containerEl = document.createElement('div');
        this._containerEl.className = 'twm-bar-windows';

        // Create right divider (shown when there are windows)
        this._rightDivider = document.createElement('div');
        this._rightDivider.className = 'twm-bar-windows__divider twm-bar-windows__divider--right';

        const barCenter = bottomBar.querySelector('.twm-bar-center');
        if (barCenter) {
            bottomBar.insertBefore(this._rightDivider, barCenter);
            bottomBar.insertBefore(this._containerEl, this._rightDivider);
            bottomBar.insertBefore(this._leftDivider, this._containerEl);
        } else {
            bottomBar.appendChild(this._leftDivider);
            bottomBar.appendChild(this._containerEl);
            bottomBar.appendChild(this._rightDivider);
        }

        // Listen for window events
        window.addEventListener('managed-window-minimized', (e) => this._onWindowMinimized(e));
        window.addEventListener('managed-window-restored', (e) => this._onWindowRestored(e));
        window.addEventListener('managed-window-closed', (e) => this._onWindowClosed(e));

        this._initialized = true;
        this._updateDividers();
    }

    /**
     * Handle window minimized event.
     */
    _onWindowMinimized(e) {
        const { id, title, icon } = e.detail;
        this._minimizedWindows.set(id, { title, icon });
        this._render();
    }

    /**
     * Handle window restored event.
     */
    _onWindowRestored(e) {
        const { id } = e.detail;
        this._minimizedWindows.delete(id);
        this._render();
    }

    /**
     * Handle window closed event.
     */
    _onWindowClosed(e) {
        const { id } = e.detail;
        this._minimizedWindows.delete(id);
        this._render();
    }

    /**
     * Update divider visibility based on window count.
     */
    _updateDividers() {
        const hasWindows = this._minimizedWindows.size > 0;
        if (this._leftDivider) {
            this._leftDivider.style.display = hasWindows ? '' : 'none';
        }
        if (this._rightDivider) {
            this._rightDivider.style.display = hasWindows ? '' : 'none';
        }
    }

    /**
     * Render the taskbar buttons.
     */
    _render() {
        if (!this._containerEl) return;

        this._containerEl.innerHTML = '';

        for (const [id, { title, icon }] of this._minimizedWindows) {
            const btn = document.createElement('button');
            btn.className = 'twm-bar-windows__item';
            btn.setAttribute('data-window-id', id);
            btn.title = `Restore: ${title}`;

            // Add icon
            if (icon) {
                const iconEl = document.createElement('span');
                iconEl.className = 'twm-bar-windows__item-icon material-symbols-outlined';
                iconEl.textContent = icon;
                btn.appendChild(iconEl);
            }

            // Add title
            const titleEl = document.createElement('span');
            titleEl.className = 'twm-bar-windows__item-title';
            titleEl.textContent = title;
            btn.appendChild(titleEl);

            btn.addEventListener('click', () => {
                ManagedWindow.restore(id);
            });
            this._containerEl.appendChild(btn);
        }

        this._updateDividers();
    }
}

// Singleton instance
export const WindowTaskbar = new WindowTaskbarManager();
