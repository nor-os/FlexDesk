/**
 * Autocomplete Field Component
 * Location: ui/components/autocomplete_field.js
 *
 * Purpose: Provide autocomplete dropdown for text input fields,
 * specifically designed for variable reference inputs.
 *
 * Usage:
 *   const ac = new AutocompleteField({
 *     fieldId: 'my-input',
 *     field: { placeholder: '...', value: '...' },
 *     provider: ({ value }) => [{ label: 'foo', type: 'variable' }, ...],
 *     onChange: (value) => { ... }
 *   });
 *   container.appendChild(ac.render());
 */

export class AutocompleteField {
    constructor({
        fieldId,
        field = {},
        provider = null,
        onChange = null,
        logger = null,
        namespace = null,
        namespaceOptions = [],
        showNamespaceSelect = false,
        variant = null,
        showNamespaceChip = false,
        allowScopeToggle = false,
        namespaceLabel = null,
        scopeMode = 'current',
        skipNamespacePrefix = false,
        // Material symbol per completion type, merged over the generic set. The
        // framework's map used to include `sector: 'domain'` — an EcoAgent
        // completion type — so the widget knew one application's ontology.
        typeIcons = {},
    } = {}) {
        if (!fieldId) {
            throw new Error('AutocompleteField requires a fieldId');
        }
        this.fieldId = fieldId;
        this.field = field;
        this.provider = typeof provider === 'function' ? provider : () => [];
        this.onChange = typeof onChange === 'function' ? onChange : null;
        this.logger = logger;
        this.typeIcons = typeIcons ?? {};
        this.namespace = namespace;
        this.namespaceOptions = Array.isArray(namespaceOptions) ? [...namespaceOptions] : [];
        // Ensure the active namespace is always present as an option, even if
        // it was not provided (e.g., data manager not yet hydrated).
        if (this.namespace && !this.namespaceOptions.some((opt) => opt.value === this.namespace)) {
            const fallbackLabel = this.field.namespaceLabel || 'This Tab';
            this.namespaceOptions.push({ value: this.namespace, label: fallbackLabel, token: fallbackLabel });
        }
        this.showNamespaceSelect = Boolean(showNamespaceSelect);
        this.variant = variant;
        this.showNamespaceChip = Boolean(showNamespaceChip);
        this.allowScopeToggle = Boolean(allowScopeToggle);
        this.namespaceLabel = namespaceLabel;
        this.scope = scopeMode === 'all' ? 'all' : 'current';
        this.skipNamespacePrefix = Boolean(skipNamespacePrefix);
        this.disabled = Boolean(field.disabled);

        const parsed = this.#parseInitialNamespace(field.value ?? '');
        this.selectedNamespace = parsed.initialNamespace;
        this.initialFragment = parsed.initialFragment;

        this._lastDropdownRect = null;

        this.root = null;
        this.input = null;
        this.dropdown = null;
        this.helperEl = null;
        this.scopeControl = null;
        this.namespaceSelect = null;
        this.ghost = null;

        this._items = [];
        this._activeIndex = -1;
        this._isOpen = false;
        this._disposers = [];
        // Every call to the provider is numbered. See `#updateSuggestions`: a
        // provider that answers over the network answers out of order, and the
        // reply to "No" must not be allowed to overwrite the reply to "North".
        this._suggestSeq = 0;
    }

    getValue() {
        return this.#composeValue();
    }

    setComposedValue(value) {
        if (!this.input) return;
        const safeValue = typeof value === 'string' ? value : '';

        // When namespace prefixing is disabled, store the raw value
        if (this.skipNamespacePrefix) {
            this.input.value = safeValue;
            this.initialFragment = safeValue;
            this.#renderGhost();
            this.#close();
            return;
        }

        const parsed = this.#parseInitialNamespace(safeValue);
        this.selectedNamespace = parsed.initialNamespace;
        this.initialFragment = parsed.initialFragment;

        if (this.namespaceSelect) {
            this.namespaceSelect.value = this.selectedNamespace;
        }
        this.#updateNamespaceChip();
        this.input.value = parsed.initialFragment;
        this.#renderGhost();
        this.#close();
    }

    #parseInitialNamespace(rawValue) {
        const value = typeof rawValue === 'string' ? rawValue.trim() : '';
        const options = this.namespaceOptions;
        
        // Default to provided namespace when available; otherwise fall back to first option or '__ALL__'.
        const defaultNs = this.namespace 
            ? (options.find((opt) => opt.value === this.namespace)?.value ?? this.namespace)
            : (options[0]?.value ?? '__ALL__');
        
        if (!options.length) {
            return { initialNamespace: defaultNs, initialFragment: value };
        }
        if (!value) {
            return { initialNamespace: defaultNs, initialFragment: '' };
        }
        
        // Check for namespace prefix (by value OR label)
        const dotIndex = value.indexOf('.');
        if (dotIndex > 0) {
            const nsCandidate = value.slice(0, dotIndex);
            const match = options.find((opt) => 
                (opt.value || '').toLowerCase() === nsCandidate.toLowerCase() ||
                (opt.label || '').toLowerCase() === nsCandidate.toLowerCase()
            );
            if (match) {
                return { initialNamespace: match.value, initialFragment: value.slice(dotIndex + 1) };
            }
        }
        return { initialNamespace: defaultNs, initialFragment: value };
    }

    #resolveNamespaceLabel() {
        if (this.scope === 'all') {
            return 'All Namespaces';
        }
        if (typeof this.namespaceLabel === 'string' && this.namespaceLabel.trim()) {
            return this.namespaceLabel.trim();
        }
        if (typeof this.field.namespaceLabel === 'string' && this.field.namespaceLabel.trim()) {
            return this.field.namespaceLabel.trim();
        }
        if (typeof this.namespace === 'string' && this.namespace.trim()) {
            return this.namespace.trim();
        }
        return 'This Tab';
    }

    #toggleScope() {
        if (this.disabled) return;
        this.scope = this.scope === 'all' ? 'current' : 'all';
        this.root?.classList?.toggle('twm-autocomplete-field--scope-all', this.scope === 'all');
        this.#updateNamespaceChip();
        this.#updateSuggestions();
    }

    #updateNamespaceChip() {
        if (!this.scopeControl) return;
        this.scopeControl.textContent = this.#resolveNamespaceLabel();
        this.scopeControl.dataset.scope = this.scope;
        this.scopeControl.title = this.scope === 'all'
            ? 'Searching across all namespaces (click to limit to this tab)'
            : 'Searching this tab (click to search all namespaces)';
    }

    render() {
        if (this.root) {
            return this.root;
        }

        this.root = document.createElement('div');
        this.root.className = 'twm-autocomplete-field';
        if (this.variant) {
            this.root.classList.add(`twm-autocomplete-field--${this.variant}`);
        }
        this.root.classList.toggle('twm-autocomplete-field--scope-all', this.scope === 'all');

        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'twm-autocomplete-field__input-wrapper';

        if (this.showNamespaceSelect && this.namespaceOptions.length) {
            const select = document.createElement('select');
            select.className = 'twm-autocomplete-field__namespace-select';
            this.namespaceOptions.forEach((opt) => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label ?? opt.value;
                if (opt.value === this.selectedNamespace) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            this.namespaceSelect = select;
            inputWrapper.appendChild(select);
        }

        if (this.showNamespaceChip) {
            const nsChip = document.createElement(this.allowScopeToggle ? 'button' : 'span');
            nsChip.className = 'twm-autocomplete-field__namespace';
            if (this.allowScopeToggle) {
                nsChip.setAttribute('type', 'button');
            }
            if (this.allowScopeToggle) {
                nsChip.classList.add('twm-autocomplete-field__namespace--toggle');
                nsChip.addEventListener('click', () => this.#toggleScope());
            }
            this.scopeControl = nsChip;
            this.#updateNamespaceChip();
            inputWrapper.appendChild(nsChip);
        }

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'twm-autocomplete-field__input';
        this.input.id = this.fieldId;
        this.input.autocomplete = 'off';
        this.input.spellcheck = false;
        if (this.field.placeholder) {
            this.input.placeholder = this.field.placeholder;
        }
        if (this.field.value != null) {
            this.input.value = this.initialFragment;
        }
        if (this.disabled) {
            this.input.disabled = true;
            this.root.classList.add('twm-autocomplete-field--disabled');
        }
        inputWrapper.appendChild(this.input);

        // Ghost overlay disabled - namespace select provides visual context
        this.ghost = null;

        this.dropdown = document.createElement('div');
        this.dropdown.className = 'twm-autocomplete-field__dropdown';
        this.dropdown.setAttribute('role', 'listbox');
        // Append dropdown to body to escape stacking context limitations
        document.body.appendChild(this.dropdown);

        this.helperEl = document.createElement('div');
        this.helperEl.className = 'twm-autocomplete-field__helper twm-config-hint';
        if (this.field.helperText) {
            this.helperEl.textContent = this.field.helperText;
        }

        this.root.appendChild(inputWrapper);
        this.root.appendChild(this.helperEl);

        this.#wireEvents();
        this.#renderGhost();
        return this.root;
    }

    #wireEvents() {
        const onInput = () => {
            if (this.disabled) return;
            this.#syncNamespaceFromInput();
            this.#renderGhost();
            this.#updateSuggestions();
        };

        const onChange = () => {
            this.onChange?.(this.#composeValue(), { immediate: false, namespace: this.selectedNamespace });
        };

        const onPaste = () => {
            // No special paste handling needed
        };

        const onKeyDown = (e) => {
            if (this.disabled) return;
            this.#handleKeyDown(e);
        };

        const onFocus = () => {
            if (this.disabled) return;
            this.#updateSuggestions();
        };

        const onBlur = (e) => {
            // Delay close to allow click on dropdown items
            setTimeout(() => {
                if (!this.root?.contains(document.activeElement)) {
                    this.#close();
                    // Trigger save on blur (similar to change event)
                    this.onChange?.(this.#composeValue(), { immediate: false, namespace: this.selectedNamespace });
                }
            }, 150);
        };

        const onDropdownMouseDown = (e) => {
            // Prevent blur when clicking dropdown
            e.preventDefault();
        };

        const onDropdownClick = (e) => {
            const item = e.target.closest('.twm-autocomplete-field__item');
            if (item) {
                const index = parseInt(item.dataset.index, 10);
                if (!isNaN(index)) {
                    this.#selectItem(index);
                }
            }
        };

        this.input.addEventListener('input', onInput);
        this.input.addEventListener('change', onChange);
        this.input.addEventListener('paste', onPaste);
        this.input.addEventListener('keydown', onKeyDown);
        this.input.addEventListener('focus', onFocus);
        this.input.addEventListener('blur', onBlur);
        this.dropdown.addEventListener('mousedown', onDropdownMouseDown);
        this.dropdown.addEventListener('click', onDropdownClick);

        if (this.namespaceSelect) {
            const onSelectChange = () => {
                // Store the new namespace selection
                this.selectedNamespace = this.namespaceSelect.value;
                // Refresh suggestions and notify listener so selection can be persisted
                this.#updateSuggestions();
                this.onChange?.(this.#composeValue(), { 
                    immediate: false, 
                    namespace: this.selectedNamespace,
                    viewNamespace: this.selectedNamespace
                });
            };
            this.namespaceSelect.addEventListener('change', onSelectChange);
            this._disposers.push(() => this.namespaceSelect.removeEventListener('change', onSelectChange));
        }

        const onWindowResize = () => {
            if (this._isOpen) {
                this.#positionDropdown();
            }
        };
        window.addEventListener('resize', onWindowResize);

        // Close dropdown when user scrolls (dropdown is position: fixed so doesn't move with content)
        const onScroll = (e) => {
            if (!this._isOpen) return;
            // Don't close if scrolling inside the dropdown itself
            if (this.dropdown?.contains(e.target)) return;
            this.#close();
        };
        document.addEventListener('scroll', onScroll, true); // capture phase catches all scroll events
        this._disposers.push(() => {
            document.removeEventListener('scroll', onScroll, true);
        });

        // Close dropdown when clicking outside (anywhere not in root or dropdown)
        const onDocumentClick = (e) => {
            if (!this._isOpen) return;
            const clickedInRoot = this.root?.contains(e.target);
            const clickedInDropdown = this.dropdown?.contains(e.target);
            if (!clickedInRoot && !clickedInDropdown) {
                this.#close();
            }
        };
        document.addEventListener('click', onDocumentClick, true);

        this._disposers.push(() => {
            window.removeEventListener('resize', onWindowResize);
        });
        this._disposers.push(() => {
            document.removeEventListener('click', onDocumentClick, true);
        });

        this._disposers.push(() => {
            this.input.removeEventListener('input', onInput);
            this.input.removeEventListener('change', onChange);
            this.input.removeEventListener('paste', onPaste);
            this.input.removeEventListener('keydown', onKeyDown);
            this.input.removeEventListener('focus', onFocus);
            this.input.removeEventListener('blur', onBlur);
            this.dropdown.removeEventListener('mousedown', onDropdownMouseDown);
            this.dropdown.removeEventListener('click', onDropdownClick);
        });
    }

    #handleKeyDown(e) {
        if (!this._isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                this.#updateSuggestions();
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.#moveSelection(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.#moveSelection(-1);
                break;
            case 'Enter':
                e.preventDefault();
                if (this._activeIndex >= 0) {
                    this.#selectItem(this._activeIndex);
                }
                // Always blur on Enter to trigger save
                this.input?.blur();
                break;
            case 'Tab':
                if (this._activeIndex >= 0) {
                    e.preventDefault();
                    this.#selectItem(this._activeIndex);
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.#close();
                break;
        }
    }

    #updateSuggestions() {
        // Pass the fragment (variable part) for filtering, not the full composed value
        const fragment = this.#getInputFragment();

        // A PROVIDER MAY ANSWER LATER THAN IT WAS ASKED.
        //
        // This used to require the answer synchronously — `provider(...) || []`
        // straight into `Array.isArray`, so a provider that returned a promise
        // produced an empty list and a dropdown that closed on every keystroke.
        // That ruled out the entire class of completion source that lives on a
        // server, which is most of them outside a single-page simulation: a
        // table's rows, a query's result set, an index's matches.
        //
        // A provider that answers synchronously still takes the synchronous
        // path, unchanged and untouched, so nothing that works today changes.
        // A provider that hands back a thenable is awaited, and the reply is
        // used only if it is the reply to the most recent question — typing
        // "North" fires five requests and the network is free to answer them in
        // any order, so without the sequence number the list can settle on the
        // matches for "Nor".
        const request = ++this._suggestSeq;
        let produced;
        try {
            produced = this.provider({
                value: fragment,
                scope: this.scope,
                namespace: this.selectedNamespace
            });
        } catch (err) {
            this.logger?.warn?.('autocomplete', 'Provider error', { err });
            this._items = [];
            this.#close();
            return;
        }

        if (produced && typeof produced.then === 'function') {
            produced.then(
                (items) => {
                    if (request !== this._suggestSeq) return;
                    this.#applySuggestions(items);
                },
                (err) => {
                    this.logger?.warn?.('autocomplete', 'Provider error', { err });
                    if (request !== this._suggestSeq) return;
                    this._items = [];
                    this.#close();
                }
            );
            return;
        }

        this.#applySuggestions(produced);
    }

    /** Draw whatever the provider produced. Split out of `#updateSuggestions`
     *  so the synchronous and the awaited paths cannot drift apart. */
    #applySuggestions(produced) {
        const items = Array.isArray(produced) ? produced : [];
        this._items = items;
        this._activeIndex = items.length > 0 ? 0 : -1;
        this.#renderDropdown();
        if (items.length > 0) {
            this.#open();
        } else {
            this.#close();
        }
    }

    #renderDropdown() {
        this.dropdown.innerHTML = '';
        const showingAll = this.selectedNamespace === '__ALL__';
        
        this._items.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'twm-autocomplete-field__item';
            el.setAttribute('role', 'option');
            el.dataset.index = index;
            el.dataset.type = item.type || item.iconType || 'variable';
            if (index === this._activeIndex) {
                el.classList.add('active');
            }

            // Icon based on type
            const icon = document.createElement('span');
            icon.className = 'twm-autocomplete-field__icon material-symbols-outlined';
            icon.textContent = this.#getIconForType(item.type || item.iconType);
            el.appendChild(icon);

            // Label
            const label = document.createElement('span');
            label.className = 'twm-autocomplete-field__label';
            label.textContent = item.label || item.insertText || '';
            el.appendChild(label);

            // Show namespace indicator when viewing all namespaces
            if (showingAll && item.metadata?.namespaceId) {
                const nsLabel = this.#resolveNamespaceToken(item.metadata.namespaceId);
                if (nsLabel) {
                    const nsIndicator = document.createElement('span');
                    nsIndicator.className = 'twm-autocomplete-field__namespace-indicator';
                    nsIndicator.textContent = nsLabel;
                    el.appendChild(nsIndicator);
                }
            }

            // Optional badge (type)
            if (item.type && !showingAll) {
                const badge = document.createElement('span');
                badge.className = 'twm-autocomplete-field__badge';
                badge.textContent = item.type;
                el.appendChild(badge);
            }

            this.dropdown.appendChild(el);
        });
            if (this._isOpen) {
                this.#positionDropdown();
            }
    }

    #resolveNamespaceToken(namespaceId) {
        if (!namespaceId) return null;
        const opt = this.namespaceOptions.find((o) => o.value === namespaceId);
        return opt?.token || opt?.label || null;
    }

    #getIconForType(type) {
        const icons = {
            variable: 'functions',
            'variable-qualified': 'link',
            stock: 'account_balance',
            account: 'savings',
            function: 'code',
            constant: 'numbers',
            operator: 'calculate',
            snippet: 'content_paste',
            ...this.typeIcons,
        };
        return icons[type] || 'label';
    }

    #moveSelection(delta) {
        if (this._items.length === 0) return;
        let newIndex = this._activeIndex + delta;
        if (newIndex < 0) newIndex = this._items.length - 1;
        if (newIndex >= this._items.length) newIndex = 0;
        this._activeIndex = newIndex;
        this.#renderDropdown();
        this.#scrollToActive();
    }

    #scrollToActive() {
        const activeEl = this.dropdown.querySelector('.twm-autocomplete-field__item.active');
        if (activeEl) {
            activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    #selectItem(index) {
        const item = this._items[index];
        if (!item) return;
        
        // Extract namespace from the selected item's metadata
        const itemNamespace = item.metadata?.namespaceId || null;
        
        // Put just the variable name in the input (not qualified)
        const insertText = item.insertText || item.label || '';
        this.input.value = insertText;
        
        // When "All" is selected, do NOT change the dropdown - keep it at "All"
        // Instead, pass the item's namespace via the callback so it's saved correctly
        // This allows users to stay in "All" view while browsing/selecting variables
        const viewNamespace = this.selectedNamespace; // What the dropdown shows ("__ALL__" or specific)
        const resolvedNamespace = (viewNamespace === '__ALL__' && itemNamespace) 
            ? itemNamespace 
            : viewNamespace;
        
        this.#close();
        this.input.focus();
        // Emit composed value with both namespace values and item metadata
        this.onChange?.(this.#composeValue(), {
            immediate: true,
            namespace: resolvedNamespace,
            viewNamespace: viewNamespace,
            metadata: item.metadata || null,
        });
    }

    #open() {
        if (this._isOpen) {
            return;
        }
        this._isOpen = true;
        this.#positionDropdown();
        this.dropdown.classList.add('visible');
    }

    #close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this.dropdown.classList.remove('visible');
        this._activeIndex = -1;
    }

    #syncNamespaceFromInput() {
        // Auto-switch namespace dropdown when user types "Namespace." prefix
        // But do NOT modify the input value - keep what user typed
        // Also do NOT switch away from "__ALL__" unless user explicitly types a namespace prefix
        if (!this.namespaceOptions.length) return;
        const value = this.input?.value || '';
        const dotIndex = value.indexOf('.');
        if (dotIndex > 0) {
            const nsCandidate = value.slice(0, dotIndex);
            // Match by value OR display label
            const match = this.namespaceOptions.find((opt) => 
                opt.value !== '__ALL__' && (
                    (opt.value || '').toLowerCase() === nsCandidate.toLowerCase() ||
                    (opt.label || '').toLowerCase() === nsCandidate.toLowerCase() ||
                    (opt.token || '').toLowerCase() === nsCandidate.toLowerCase()
                )
            );
            if (match && this.namespaceSelect && this.namespaceSelect.value !== match.value) {
                this.namespaceSelect.value = match.value;
                this.selectedNamespace = match.value;
            }
        }
        // Note: We no longer auto-reset to a namespace when typing without a dot
        // This allows "All" selection to remain stable
    }

    #getInputFragment() {
        // Get the variable name fragment from input (strip namespace prefix if present)
        const value = this.input?.value || '';
        const dotIndex = value.indexOf('.');
        if (dotIndex > 0) {
            const nsCandidate = value.slice(0, dotIndex);
            const match = this.namespaceOptions.find((opt) => 
                opt.value !== '__ALL__' && (
                    (opt.value || '').toLowerCase() === nsCandidate.toLowerCase() ||
                    (opt.label || '').toLowerCase() === nsCandidate.toLowerCase()
                )
            );
            if (match) {
                return value.slice(dotIndex + 1);
            }
        }
        return value;
    }

    #composeValue() {
        // Compose the full reference value for saving
        // Use the raw input value - it may already contain namespace prefix
        const rawInput = this.input?.value || '';
        if (!rawInput) return '';
        
        // Skip namespace prefixing for simple value fields (e.g., sector, account name)
        if (this.skipNamespacePrefix) {
            return rawInput;
        }
        
        // If input already has a namespace prefix, return as-is
        const dotIndex = rawInput.indexOf('.');
        if (dotIndex > 0) {
            const nsCandidate = rawInput.slice(0, dotIndex);
            const match = this.namespaceOptions.find((opt) => 
                opt.value !== '__ALL__' && (
                    (opt.value || '').toLowerCase() === nsCandidate.toLowerCase() ||
                    (opt.label || '').toLowerCase() === nsCandidate.toLowerCase()
                )
            );
            if (match) {
                // Input already has valid namespace prefix, return as-is
                return rawInput;
            }
        }
        
        // No namespace prefix in input - prepend from dropdown if not "All"
        const ns = this.selectedNamespace;
        if (!ns || ns === '__ALL__') {
            return rawInput;
        }
        
        // Find display label for the namespace (case-insensitive search)
        const nsOption = this.namespaceOptions.find((opt) => 
            opt.value === ns || (opt.value || '').toLowerCase() === (ns || '').toLowerCase()
        );

        // Choose a human-friendly token; fall back to label. If we only have a UUID-looking
        // token, avoid prefixing to prevent UUIDs leaking into the input.
        const nsToken = nsOption?.token || nsOption?.label || '';
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (ns === '__ALL__' || (nsToken || '').toUpperCase() === '__ALL__') {
            return rawInput;
        }
        if (!nsToken || uuidPattern.test(nsToken)) {
            return rawInput;
        }

        return `${nsToken}.${rawInput}`;
    }

    #renderGhost() {
        // Ghost overlay is disabled - it interferes with the input
        // The namespace select already provides visual context
        if (this.ghost) {
            this.ghost.style.display = 'none';
        }
    }

    #positionDropdown() {
        if (!this.dropdown || !this.root) return;
        const wrapper = this.root.querySelector('.twm-autocomplete-field__input-wrapper');
        if (!wrapper) return;
        const rect = wrapper.getBoundingClientRect();
        this._lastDropdownRect = rect;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const width = Math.min(rect.width, viewportWidth - rect.left - 8);
        const maxHeight = Math.max(120, viewportHeight - rect.bottom - 12);
        Object.assign(this.dropdown.style, {
            position: 'fixed',
            top: `${rect.bottom}px`,
            left: `${rect.left}px`,
            width: `${width}px`,
            maxWidth: `${width}px`,
            maxHeight: `${maxHeight}px`,
        });
    }

    dispose() {
        // Retire the outstanding question first. An awaited provider can answer
        // after the field is gone, and `#applySuggestions` would then paint into
        // a dropdown that has been removed and nulled.
        this._suggestSeq += 1;
        // Close dropdown before cleanup
        this.#close();
        this._disposers.forEach((fn) => {
            try { fn(); } catch (e) { /* ignore */ }
        });
        this._disposers = [];
        // Remove dropdown from body since we appended it there
        if (this.dropdown && this.dropdown.parentNode) {
            this.dropdown.parentNode.removeChild(this.dropdown);
        }
        this.root = null;
        this.input = null;
        this.dropdown = null;
        this.helperEl = null;
    }
}
