/**
 * InlineRenamer (js_new)
 * Minimal inline editing helper used by node labels and scenario titles.
 * Attaches an input on demand, commits through provided callback, and cleans up deterministically.
 */

function assertLabel(label) {
    if (!label || typeof label.appendChild !== 'function') {
        throw new Error('[InlineRenamer] options.label must be an HTMLElement');
    }
}

function buildInput(label, options) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = ['twm-node-edit-input', options?.inputClass || ''].join(' ').trim();
    input.placeholder = options?.placeholder || label.textContent || 'Name';
    input.value = options?.initialValue ?? label.textContent ?? '';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Edit name');
    return input;
}

export function attachInlineRenamer(options = {}) {
    const label = options.label;
    assertLabel(label);

    let input = null;
    let editing = false;
    let destroyed = false;
    let originalText = label.textContent || '';

    const cleanup = () => {
        if (input && input.parentNode === label) {
            input.remove();
        }
        input = null;
        editing = false;
    };

    const cancel = () => {
        if (destroyed) return;
        cleanup();
        label.textContent = originalText;
        options.onCancel?.({ value: originalText });
    };

    const commit = async (reason = 'commit') => {
        if (destroyed || !input) return;
        const raw = input.value;
        let next = raw;
        try {
            next = options.transformInput ? options.transformInput(raw, { reason }) : raw;
        } catch (err) {
            window.logger?.warn('inline-renamer', 'transformInput failed', err);
        }

        try {
            const result = (await options.onCommit?.(next, { reason })) || {};
            if (result.success === false) {
                if (result.keepEditing) {
                    input.focus();
                    input.select();
                    return;
                }
                cancel();
                return;
            }
            const finalValue = result.newValue ?? next ?? '';
            label.textContent = finalValue;
            cleanup();
            options.onFinish?.({ value: finalValue });
        } catch (err) {
            window.logger?.warn('inline-renamer', 'onCommit failed', err);
            cancel();
        }
    };

    const start = (triggerEvent = null) => {
        if (destroyed || editing) return;
        editing = true;
        originalText = label.textContent || '';
        label.textContent = '';
        input = buildInput(label, { ...options, initialValue: originalText });
        label.appendChild(input);

        const stopEvents = (ev) => ev.stopPropagation();
        input.addEventListener('mousedown', stopEvents);
        input.addEventListener('click', stopEvents);

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                commit('enter');
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                cancel();
            }
        });

        input.addEventListener('blur', () => commit('blur'));

        options.onStart?.({ value: originalText, triggerEvent });
        setTimeout(() => {
            input?.focus();
            input?.select?.();
        }, 0);
    };

    const destroy = () => {
        destroyed = true;
        cleanup();
    };

    return { start, cancel, commit, destroy };
}

// `window.InlineRenamer` used to be installed here, at module scope, "for existing
// callers". There are none: every caller in the tree — EcoAgent's and the
// library's — uses the `attachInlineRenamer` named export. It was a global that
// nothing read.
//
// It also made this module UNIMPORTABLE outside a browser, because the assignment
// ran on import. That is how it was found: a node test that does nothing but
// `import '@flexdesk/widgets'` died with `ReferenceError: window is not defined`. A
// library whose entry point cannot be imported without a DOM is a library that
// cannot be unit-tested, server-rendered, or loaded in a worker — and
// package.json's `"sideEffects": ["*.css"]` was a lie while this line existed.
