/**
 * DetailHeader — shared header bar for detail views.
 *
 * Usage:
 *   import { createDetailHeader, updateDetailHeader } from '../ui/components/detail_header.js';
 *
 *   const header = createDetailHeader({
 *       title: 'My Scenario',
 *       badges: [{ text: 'Static' }],
 *       renameable: true,
 *       onRename: async (name) => ({ success: true }),
 *       actions: [
 *           { key: 'run', label: 'Run', icon: 'play_arrow', variant: 'primary', handler: () => {} },
 *           { key: 'delete', label: 'Delete', icon: 'delete', variant: 'danger', handler: () => {} },
 *       ],
 *   });
 *   container.appendChild(header);
 *
 * To update in place (e.g., running state changed):
 *   updateDetailHeader(header, { ...newConfig });
 */

import { attachInlineRenamer } from './inline_renamer.js';

const ESC = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @typedef {Object} DetailHeaderBadge
 * @property {string} text
 * @property {string} [className]  - Extra class(es) of your own (e.g., 'my-badge--live'); the
 *                                   pill itself is `.twm-detail-header__badge`
 * @property {string} [icon]       - Material Symbols icon name
 */

/**
 * @typedef {Object} DetailHeaderAction
 * @property {string} key           - data-action value
 * @property {string} label         - Button text
 * @property {string} [icon]        - Material Symbols icon name (none: label only)
 * @property {'primary'|'secondary'|'danger'} [variant='secondary'] - The button is a `.twm-btn`;
 *           'primary' and 'danger' add `.twm-btn--primary` / `.twm-btn--danger`, and every
 *           variant is also named `.twm-detail-header__btn--<variant>`
 * @property {boolean} [disabled=false]
 * @property {string} [title]       - Tooltip
 * @property {Function} handler     - Click callback
 */

/**
 * @typedef {Object} DetailHeaderConfig
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [icon]              - Material icon before title
 * @property {DetailHeaderBadge[]} [badges]
 * @property {DetailHeaderAction[]} [actions]
 * @property {HTMLElement[]} [extraElements]  - Custom elements appended to actions area
 * @property {boolean} [renameable=false]
 * @property {Function} [onRename]         - (newName) => Promise<{success, newValue?}>
 */

/**
 * Create a detail header element.
 * @param {DetailHeaderConfig} config
 * @returns {HTMLElement}
 */
export function createDetailHeader(config) {
    const header = document.createElement('header');
    header.className = 'twm-detail-header';
    _populate(header, config);
    return header;
}

/**
 * Update an existing detail header in place.
 * Destroys previous inline renamer and rebuilds inner DOM.
 * @param {HTMLElement} headerEl
 * @param {DetailHeaderConfig} config
 */
export function updateDetailHeader(headerEl, config) {
    // Destroy previous renamer if any
    headerEl._renamer?.destroy();
    headerEl._renamer = null;
    headerEl.innerHTML = '';
    _populate(headerEl, config);
}

// ─── Internal ────────────────────────────────────────────────────────────────

function _populate(header, config) {
    const { title, subtitle, icon, badges = [], actions = [], extraElements = [], renameable = false, onRename } = config;

    // Title row
    const titleRow = document.createElement('div');
    titleRow.className = 'twm-detail-header__title-row';

    if (icon) {
        const iconEl = document.createElement('span');
        iconEl.className = 'twm-detail-header__icon material-symbols-outlined';
        iconEl.textContent = icon;
        titleRow.appendChild(iconEl);
    }

    const nameEl = document.createElement('h2');
    nameEl.className = 'twm-detail-header__name';
    nameEl.textContent = title || '';
    if (renameable) {
        nameEl.dataset.renameable = '';
        nameEl.title = 'Double-click to rename';
    }
    titleRow.appendChild(nameEl);

    for (const badge of badges) {
        const badgeEl = document.createElement('span');
        badgeEl.className = `twm-detail-header__badge${badge.className ? ` ${badge.className}` : ''}`;
        if (badge.icon) {
            const bi = document.createElement('span');
            bi.className = 'twm-detail-header__badge-icon material-symbols-outlined';
            bi.textContent = badge.icon;
            badgeEl.appendChild(bi);
        }
        badgeEl.appendChild(document.createTextNode(badge.text));
        titleRow.appendChild(badgeEl);
    }

    header.appendChild(titleRow);

    // Subtitle
    if (subtitle) {
        const sub = document.createElement('div');
        sub.className = 'twm-detail-header__subtitle';
        sub.innerHTML = subtitle; // may contain <strong> etc.
        header.appendChild(sub);
    }

    // Actions
    if (actions.length > 0 || extraElements.length > 0) {
        const actionsEl = document.createElement('div');
        actionsEl.className = 'twm-detail-header__actions';

        for (const extra of extraElements) {
            actionsEl.appendChild(extra);
        }

        for (const action of actions) {
            const btn = document.createElement('button');
            btn.type = 'button';
            const variant = action.variant || 'secondary';
            // The shared `.twm-btn` look (BUG-0015): 'primary' and 'danger'
            // wear its colour variants; 'secondary' is the plain button.
            const look = variant === 'secondary' ? '' : ` twm-btn--${variant}`;
            btn.className = `twm-btn${look} twm-detail-header__btn twm-detail-header__btn--${variant}`;
            btn.dataset.action = action.key;
            if (action.disabled) btn.disabled = true;
            if (action.title) btn.title = action.title;

            if (action.icon) {
                const iconSpan = document.createElement('span');
                iconSpan.className = 'material-symbols-outlined twm-btn__glyph';
                iconSpan.textContent = action.icon;
                btn.appendChild(iconSpan);
            }
            const labelSpan = document.createElement('span');
            labelSpan.className = 'twm-btn__label';
            labelSpan.textContent = action.label ?? '';
            btn.appendChild(labelSpan);

            btn.addEventListener('click', () => action.handler?.());
            actionsEl.appendChild(btn);
        }

        header.appendChild(actionsEl);
    }

    // Inline rename
    if (renameable && onRename) {
        const renamer = attachInlineRenamer({
            label: nameEl,
            onCommit: async (newName) => {
                if (!newName?.trim()) return { success: false };
                return await onRename(newName.trim());
            },
        });
        nameEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            renamer.start(e);
        });
        header._renamer = renamer;
    }
}
