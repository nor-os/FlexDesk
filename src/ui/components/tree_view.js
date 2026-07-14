/**
 * Tree View Component
 *
 * A reusable hierarchical tree view component for displaying nested data.
 * Used by Functions Page (modules/functions) and Data Page (datasets/series).
 *
 * Structure:
 * - TreeView: Container for multiple categories
 * - TreeCategory: Top-level collapsible group (e.g., "Built-in", "Project")
 * - TreeNode: Expandable node with children (e.g., module, dataset)
 * - TreeItem: Leaf item (e.g., function, series)
 */

/**
 * Create a tree category (top-level collapsible section)
 * @param {Object} options - Category options
 * @param {string} options.id - Unique category ID
 * @param {string} options.label - Display label
 * @param {string} [options.icon] - Material icon name
 * @param {string} [options.iconClass] - Additional icon CSS class
 * @param {number} [options.count] - Item count to display
 * @param {boolean} [options.expanded=false] - Initial expanded state
 * @param {boolean} [options.readonly=false] - Whether items are readonly
 * @returns {HTMLElement} - Category element
 */
export function createTreeCategory(options) {
    const {
        id,
        label,
        icon = 'folder',
        iconClass = '',
        count = 0,
        expanded = false,
        readonly = false,
    } = options;

    const node = document.createElement('div');
    node.className = 'twm-collapsible-box twm-tree-category';
    node.dataset.categoryId = id;
    node.dataset.collapsibleId = `tree-category-${id}`;
    node.dataset.collapsibleDefault = expanded ? 'expanded' : 'collapsed';
    if (readonly) node.dataset.readonly = 'true';

    node.innerHTML = `
        <div class="twm-collapsible-header" data-collapsible-header="true">
            <button class="twm-arrow-toggle" type="button">
                <span class="twm-collapsible-arrow material-symbols-outlined${expanded ? '' : ' collapsed'}">expand_more</span>
            </button>
            <span class="twm-tree-category__icon ${iconClass}">
                <span class="material-symbols-outlined">${icon}</span>
            </span>
            <span class="twm-tree-category__label">${label}</span>
            <span class="twm-tree-category__count">(${count})</span>
        </div>
        <div class="twm-collapsible-content${expanded ? ' visible' : ''}" data-collapsible-content="true"></div>
    `;

    return node;
}

/**
 * Create a tree node (expandable container with children)
 * @param {Object} options - Node options
 * @param {string} options.id - Unique node ID
 * @param {string} options.label - Display label
 * @param {string} [options.icon] - Material icon name (optional)
 * @param {number} [options.count] - Child count to display
 * @param {boolean} [options.expanded=false] - Initial expanded state
 * @param {boolean} [options.readonly=false] - Whether node is readonly
 * @param {Object} [options.actions] - Action buttons config
 * @returns {HTMLElement} - Node element
 */
export function createTreeNode(options) {
    const {
        id,
        label,
        icon = null,
        count = 0,
        expanded = false,
        readonly = false,
        actions = null,
    } = options;

    const node = document.createElement('div');
    node.className = `twm-tree-node${readonly ? ' readonly' : ''}`;
    node.dataset.nodeId = id;

    const iconHtml = icon
        ? `<span class="twm-tree-node__icon"><span class="material-symbols-outlined">${icon}</span></span>`
        : '';

    const actionsHtml = actions ? '<span class="twm-tree-node__actions"></span>' : '';

    node.innerHTML = `
        <div class="twm-tree-node__header">
            <span class="twm-tree-node__toggle">
                <span class="material-symbols-outlined">${expanded ? 'expand_more' : 'chevron_right'}</span>
            </span>
            ${iconHtml}
            <span class="twm-tree-node__label">${label}</span>
            <span class="twm-tree-node__count">(${count})</span>
            ${actionsHtml}
        </div>
        <div class="twm-tree-node__children" style="display: ${expanded ? 'block' : 'none'};"></div>
    `;

    // Add action buttons if specified
    if (actions) {
        const actionsEl = node.querySelector('.twm-tree-node__actions');
        Object.entries(actions).forEach(([actionId, actionConfig]) => {
            const btn = document.createElement('button');
            btn.className = 'twm-tree-node__action-btn';
            btn.dataset.action = actionId;
            btn.title = actionConfig.title || actionId;
            btn.innerHTML = `<span class="material-symbols-outlined">${actionConfig.icon}</span>`;
            if (actionConfig.onClick) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    actionConfig.onClick(id, e);
                });
            }
            actionsEl.appendChild(btn);
        });
    }

    return node;
}

/**
 * Create a tree item (leaf node)
 * @param {Object} options - Item options
 * @param {string} options.id - Unique item ID
 * @param {string} options.label - Display label
 * @param {string} [options.icon] - Material icon or symbol (e.g., 'ƒ', 'insights')
 * @param {boolean} [options.isMaterialIcon=true] - Whether icon is Material icon
 * @param {boolean} [options.readonly=false] - Whether item is readonly
 * @param {boolean} [options.selected=false] - Whether item is selected
 * @param {string} [options.subtitle] - Optional subtitle text
 * @param {Object} [options.data] - Additional data to attach
 * @param {Object} [options.badge] - Optional badge config
 * @param {string} [options.badge.text] - Badge text (if empty, renders as status dot)
 * @param {string} [options.badge.variant] - 'muted'|'pass'|'fail'|'error'
 * @returns {HTMLElement} - Item element
 */
export function createTreeItem(options) {
    const {
        id,
        label,
        icon = null,
        isMaterialIcon = true,
        readonly = false,
        selected = false,
        subtitle = null,
        data = null,
        badge = null,
    } = options;

    const item = document.createElement('div');
    item.className = `twm-tree-item${readonly ? ' readonly' : ''}${selected ? ' selected' : ''}`;
    item.dataset.itemId = id;

    // Attach custom data
    if (data) {
        Object.entries(data).forEach(([key, value]) => {
            item.dataset[key] = value;
        });
    }

    const iconHtml = icon
        ? isMaterialIcon
            ? `<span class="twm-tree-item__icon"><span class="material-symbols-outlined">${icon}</span></span>`
            : `<span class="twm-tree-item__icon twm-tree-item__icon--symbol">${icon}</span>`
        : '';

    const subtitleHtml = subtitle
        ? `<span class="twm-tree-item__subtitle">${subtitle}</span>`
        : '';

    let badgeHtml = '';
    if (badge) {
        const variant = badge.variant || 'muted';
        if (badge.text) {
            badgeHtml = `<span class="twm-tree-item__badge tree-item__badge--${variant}">${badge.text}</span>`;
        } else {
            badgeHtml = `<span class="twm-tree-item__status-dot tree-item__status-dot--${variant}"></span>`;
        }
    }

    item.innerHTML = `
        ${iconHtml}
        <span class="twm-tree-item__label">${label}</span>
        ${subtitleHtml}
        ${badgeHtml}
    `;

    return item;
}

/**
 * Toggle a collapsible category
 * @param {HTMLElement} categoryEl - Category element
 * @param {boolean} [force] - Force specific state (true = expand, false = collapse)
 */
export function toggleCategory(categoryEl, force) {
    if (!categoryEl) return;

    const arrow = categoryEl.querySelector(':scope > .twm-collapsible-header .twm-collapsible-arrow');
    const content = categoryEl.querySelector(':scope > .twm-collapsible-content');

    if (!content) return;

    // Determine whether we should expand
    // force=true means expand, force=false means collapse, undefined means toggle
    const isCurrentlyExpanded = content.classList.contains('visible');
    const shouldExpand = force !== undefined ? force : !isCurrentlyExpanded;

    if (shouldExpand) {
        // Expand
        if (arrow) {
            arrow.classList.remove('collapsed');
        }
        content.classList.add('visible');
    } else {
        // Collapse
        if (arrow) {
            arrow.classList.add('collapsed');
        }
        content.classList.remove('visible');
    }
}

/**
 * Toggle a tree node
 * @param {HTMLElement} nodeEl - Node element
 * @param {boolean} [force] - Force specific state
 */
export function toggleNode(nodeEl, force) {
    if (!nodeEl) return;

    const toggle = nodeEl.querySelector(':scope > .twm-tree-node__header .twm-tree-node__toggle .material-symbols-outlined');
    const children = nodeEl.querySelector(':scope > .twm-tree-node__children');

    if (!children) return;

    const isExpanded = force !== undefined
        ? force
        : children.style.display === 'none';

    if (isExpanded) {
        children.style.display = 'block';
        if (toggle) toggle.textContent = 'expand_more';
    } else {
        children.style.display = 'none';
        if (toggle) toggle.textContent = 'chevron_right';
    }
}

/**
 * Filter tree items by text match
 * @param {HTMLElement} container - Tree container
 * @param {string} filter - Filter text (case-insensitive)
 * @param {Object} [options] - Filter options
 * @param {boolean} [options.expandMatches=true] - Auto-expand nodes with matches
 */
export function filterTree(container, filter, options = {}) {
    const { expandMatches = true } = options;
    const normalizedFilter = (filter || '').toLowerCase().trim();

    const items = container.querySelectorAll('.twm-tree-item');
    const nodes = container.querySelectorAll('.twm-tree-node');
    const categories = container.querySelectorAll('.twm-tree-category');

    // Reset visibility
    items.forEach((item) => {
        const label = item.querySelector('.twm-tree-item__label')?.textContent || '';
        const matches = !normalizedFilter || label.toLowerCase().includes(normalizedFilter);
        item.style.display = matches ? '' : 'none';
        item.classList.toggle('twm-filter-match', matches && !!normalizedFilter);
    });

    // Show/hide nodes based on visible children
    nodes.forEach((node) => {
        const visibleChildren = node.querySelectorAll('.twm-tree-item:not([style*="display: none"])');
        const hasVisibleChildren = visibleChildren.length > 0;
        node.style.display = hasVisibleChildren ? '' : 'none';

        // Auto-expand nodes with matches
        if (expandMatches && hasVisibleChildren && normalizedFilter) {
            toggleNode(node, true);
        }
    });

    // Show/hide categories based on visible nodes
    categories.forEach((category) => {
        const visibleNodes = category.querySelectorAll('.twm-tree-node:not([style*="display: none"])');
        const hasVisibleNodes = visibleNodes.length > 0;
        category.style.display = hasVisibleNodes ? '' : 'none';

        // Auto-expand categories with matches
        if (expandMatches && hasVisibleNodes && normalizedFilter) {
            toggleCategory(category, true);
        }
    });
}

/**
 * Select a tree item
 * @param {HTMLElement} container - Tree container
 * @param {string} itemId - Item ID to select
 * @param {Object} [options] - Selection options
 * @param {boolean} [options.scrollIntoView=true] - Scroll item into view
 * @param {boolean} [options.expandParents=true] - Expand parent nodes
 */
export function selectItem(container, itemId, options = {}) {
    const { scrollIntoView = true, expandParents = true } = options;

    // Deselect all
    container.querySelectorAll('.twm-tree-item.selected').forEach((el) => {
        el.classList.remove('selected');
    });

    // Find and select item
    const item = container.querySelector(`.twm-tree-item[data-item-id="${itemId}"]`);
    if (!item) return null;

    item.classList.add('selected');

    // Expand parent nodes
    if (expandParents) {
        let parent = item.parentElement;
        while (parent && parent !== container) {
            if (parent.classList.contains('twm-tree-node__children')) {
                const node = parent.closest('.twm-tree-node');
                if (node) toggleNode(node, true);
            }
            if (parent.classList.contains('twm-collapsible-content')) {
                const category = parent.closest('.twm-tree-category');
                if (category) toggleCategory(category, true);
            }
            parent = parent.parentElement;
        }
    }

    // Scroll into view
    if (scrollIntoView) {
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    return item;
}

/**
 * TreeView class for managing a complete tree structure
 */
export class TreeView {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            onItemClick: null,
            onItemDoubleClick: null,
            onNodeToggle: null,
            onCategoryToggle: null,
            ...options,
        };

        this._boundHandleClick = this._handleClick.bind(this);
        this._boundHandleDblClick = this._handleDoubleClick.bind(this);

        if (container) {
            container.classList.add('twm-tree-view');
            container.addEventListener('click', this._boundHandleClick);
            container.addEventListener('dblclick', this._boundHandleDblClick);
        }
    }

    _handleClick(e) {
        // Handle category toggle
        const collapsibleHeader = e.target.closest('.twm-collapsible-header');
        if (collapsibleHeader) {
            const category = collapsibleHeader.closest('.twm-tree-category');
            if (category) {
                toggleCategory(category);
                this.options.onCategoryToggle?.(category.dataset.categoryId, category);
            }
            return;
        }

        // Handle node toggle
        const nodeHeader = e.target.closest('.twm-tree-node__header');
        if (nodeHeader) {
            const node = nodeHeader.closest('.twm-tree-node');
            if (node) {
                toggleNode(node);
                this.options.onNodeToggle?.(node.dataset.nodeId, node);
            }
            return;
        }

        // Handle item click
        const item = e.target.closest('.twm-tree-item');
        if (item) {
            this.select(item.dataset.itemId);
            this.options.onItemClick?.(item.dataset.itemId, item, e);
        }
    }

    _handleDoubleClick(e) {
        const item = e.target.closest('.twm-tree-item');
        if (item) {
            this.options.onItemDoubleClick?.(item.dataset.itemId, item, e);
        }
    }

    addCategory(options) {
        const category = createTreeCategory(options);
        this.container.appendChild(category);
        return category;
    }

    addNode(categoryId, options) {
        const category = this.container.querySelector(`.twm-tree-category[data-category-id="${categoryId}"]`);
        const content = category?.querySelector('.twm-collapsible-content');
        if (!content) return null;

        const node = createTreeNode(options);
        content.appendChild(node);
        return node;
    }

    addItem(nodeId, options) {
        const node = this.container.querySelector(`.twm-tree-node[data-node-id="${nodeId}"]`);
        const children = node?.querySelector('.twm-tree-node__children');
        if (!children) return null;

        const item = createTreeItem(options);
        children.appendChild(item);
        return item;
    }

    select(itemId) {
        return selectItem(this.container, itemId);
    }

    filter(text) {
        filterTree(this.container, text);
    }

    clear() {
        this.container.innerHTML = '';
    }

    dispose() {
        if (this.container) {
            this.container.removeEventListener('click', this._boundHandleClick);
            this.container.removeEventListener('dblclick', this._boundHandleDblClick);
        }
    }
}

export default TreeView;
