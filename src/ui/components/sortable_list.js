/**
 * Sortable List Component
 * Location: ui/components/sortable_list.js
 *
 * Purpose: Provide a reusable list component with add, remove, reorder, and rename
 * capabilities. Used for named inputs in function nodes, rules in switch nodes, etc.
 *
 * Features:
 * - Add/remove items
 * - Drag-and-drop reordering
 * - Inline rename
 * - Custom item renderer
 * - Persistence via onChange callback
 *
 * Reordering is delegated to the shared DragReorder module (the same
 * ghost + drop-placeholder technique used by the tab bars and the schema
 * editor) so the reorder behaviour is implemented once.
 */

import { DragReorder } from './drag_reorder.js';

export class SortableList {
    /**
     * Create a sortable list.
     * @param {Object} options - Configuration options
     * @param {string} options.containerId - Unique ID for the container
     * @param {Array} options.items - Initial items array
     * @param {Function} options.onChange - Called with updated items array when list changes
     * @param {Function} options.renderItem - Custom renderer for item content (receives item, index, callbacks)
     * @param {Function} options.createItem - Factory function to create new items
     * @param {string} options.emptyMessage - Message to show when list is empty
     * @param {string} options.addButtonText - Text for add button
     * @param {boolean} options.allowReorder - Whether to allow drag-and-drop reordering
     * @param {boolean} options.allowRemove - Whether to allow removing items
     * @param {number} options.minItems - Minimum number of items (blocks removal if at min)
     */
    constructor({
        containerId,
        items = [],
        onChange = null,
        renderItem = null,
        createItem = null,
        emptyMessage = 'No items',
        addButtonText = 'Add Item',
        allowReorder = true,
        allowRemove = true,
        minItems = 0,
    } = {}) {
        this.containerId = containerId || `sortable-list-${Date.now()}`;
        this.items = Array.isArray(items) ? [...items] : [];
        this.onChange = typeof onChange === 'function' ? onChange : null;
        this.renderItem = typeof renderItem === 'function' ? renderItem : this.#defaultRenderItem.bind(this);
        this.createItem = typeof createItem === 'function' ? createItem : this.#defaultCreateItem.bind(this);
        this.emptyMessage = emptyMessage;
        this.addButtonText = addButtonText;
        this.allowReorder = allowReorder;
        this.allowRemove = allowRemove;
        this.minItems = minItems;

        this.root = null;
        this.listEl = null;
        this._dragReorder = null;
    }

    /**
     * Render the sortable list.
     * @returns {HTMLElement} The root container element
     */
    render() {
        if (this.root) {
            this.#refresh();
            return this.root;
        }

        this.root = document.createElement('div');
        this.root.className = 'twm-sortable-list';
        this.root.id = this.containerId;

        this.listEl = document.createElement('div');
        this.listEl.className = 'twm-sortable-list__items';

        this.root.appendChild(this.listEl);

        // Only show add button if addButtonText is provided
        if (this.addButtonText) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'twm-sortable-list__add';
            addBtn.innerHTML = `<span class="material-symbols-outlined">add</span> ${this.#escapeHtml(this.addButtonText)}`;
            addBtn.addEventListener('click', () => this.addItem());
            this.root.appendChild(addBtn);
        }

        this.#refresh();
        return this.root;
    }

    /**
     * Get current items.
     * @returns {Array} Copy of items array
     */
    getItems() {
        return [...this.items];
    }

    /**
     * Set items and re-render.
     * @param {Array} items - New items array
     */
    setItems(items) {
        this.items = Array.isArray(items) ? [...items] : [];
        this.#refresh();
    }

    /**
     * Add a new item.
     */
    addItem() {
        const newItem = this.createItem(this.items.length);
        this.items.push(newItem);
        this.#notifyChange();
        this.#refresh();
    }

    /**
     * Remove an item by index.
     * @param {number} index - Index of item to remove
     */
    removeItem(index) {
        if (index < 0 || index >= this.items.length) return;
        if (this.items.length <= this.minItems) return;
        
        this.items.splice(index, 1);
        this.#notifyChange();
        this.#refresh();
    }

    /**
     * Update an item at index.
     * @param {number} index - Index of item to update
     * @param {Object} updates - Properties to merge into item
     */
    updateItem(index, updates) {
        if (index < 0 || index >= this.items.length) return;
        
        this.items[index] = { ...this.items[index], ...updates };
        this.#notifyChange();
    }

    /**
     * Move an item from one index to another.
     * @param {number} fromIndex - Source index
     * @param {number} toIndex - Destination index
     */
    moveItem(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.items.length) return;
        if (toIndex < 0 || toIndex >= this.items.length) return;
        if (fromIndex === toIndex) return;

        const [item] = this.items.splice(fromIndex, 1);
        this.items.splice(toIndex, 0, item);
        this.#notifyChange();
        this.#refresh();
    }

    /**
     * Dispose the component.
     */
    dispose() {
        this._dragReorder?.destroy();
        this._dragReorder = null;
        this.root = null;
        this.listEl = null;
        this.items = [];
    }

    // ─── Private Methods ───────────────────────────────────────────────────

    #refresh() {
        if (!this.listEl) return;

        this.listEl.innerHTML = '';

        if (this.items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'twm-sortable-list__empty';
            empty.textContent = this.emptyMessage;
            this.listEl.appendChild(empty);
            return;
        }

        this.items.forEach((item, index) => {
            const row = this.#createRow(item, index);
            this.listEl.appendChild(row);
        });

        // Drag-to-reorder via the shared DragReorder module (ghost +
        // placeholder). Created once, bound to the persistent list
        // element; re-attached after each refresh to wire the rebuilt
        // rows. Drag is restricted to the grip handle.
        if (this.allowReorder) {
            if (!this._dragReorder) {
                this._dragReorder = new DragReorder({
                    container: this.listEl,
                    itemSelector: '.sortable-list__row',
                    keyAttr: 'index',
                    axis: 'y',
                    indicatorClass: 'twm-sortable-list__drop',
                    draggableGuard: (e) => !!e.target.closest('.twm-sortable-list__handle'),
                    onReorder: (order) => this.#applyReorder(order),
                });
            }
            this._dragReorder.attach();
        }
    }

    /** Reorder `items` to match the new DOM order produced by a drag,
     *  then notify + re-render. `order` holds the rows' pre-drag
     *  `data-index` values in their new arrangement. */
    #applyReorder(order) {
        const next = order
            .map((i) => this.items[Number(i)])
            .filter((it) => it !== undefined);
        if (next.length !== this.items.length) return;   // guard against drift
        this.items = next;
        this.#notifyChange();
        this.#refresh();
    }

    #createRow(item, index) {
        const row = document.createElement('div');
        row.className = 'twm-sortable-list__row';
        row.dataset.index = index;

        // Drag handle (if reordering enabled). The drag mechanics are
        // owned by the shared DragReorder instance (see #refresh); the
        // handle is just the grab affordance the drag is restricted to.
        if (this.allowReorder) {
            const handle = document.createElement('div');
            handle.className = 'twm-sortable-list__handle';
            handle.innerHTML = '<span class="material-symbols-outlined">drag_indicator</span>';
            row.appendChild(handle);
        }

        // Item content (custom renderer)
        const content = document.createElement('div');
        content.className = 'twm-sortable-list__content';
        
        const callbacks = {
            update: (updates) => this.updateItem(index, updates),
            remove: () => this.removeItem(index),
            moveUp: () => this.moveItem(index, index - 1),
            moveDown: () => this.moveItem(index, index + 1),
        };
        
        this.renderItem(content, item, index, callbacks);
        row.appendChild(content);

        // Remove button (if removal enabled)
        if (this.allowRemove) {
            const canRemove = this.items.length > this.minItems;
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'twm-sortable-list__remove';
            removeBtn.disabled = !canRemove;
            removeBtn.title = canRemove ? 'Remove' : `Minimum ${this.minItems} items required`;
            removeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
            removeBtn.addEventListener('click', () => {
                if (canRemove) this.removeItem(index);
            });
            row.appendChild(removeBtn);
        }

        return row;
    }

    #defaultRenderItem(container, item, index, callbacks) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'twm-sortable-list__input';
        input.value = item.name ?? item.label ?? '';
        input.placeholder = `Item ${index + 1}`;
        input.addEventListener('change', () => {
            callbacks.update({ name: input.value });
        });
        container.appendChild(input);
    }

    #defaultCreateItem(index) {
        return {
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: `item${index + 1}`,
        };
    }

    #notifyChange() {
        if (this.onChange) {
            this.onChange([...this.items]);
        }
    }


    #escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
