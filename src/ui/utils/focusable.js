/**
 * Collect the focusable elements inside `root`, in DOM order: what a focus trap
 * cycles through. Hidden and zero-size elements are skipped, since Tab visits only
 * what the reader can see.
 *
 * @param {HTMLElement|null} root
 * @returns {HTMLElement[]}
 */
export function collectFocusable(root) {
    if (!root) return [];
    const sel = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    return Array.from(root.querySelectorAll(sel)).filter((el) => {
        if (el.hidden) return false;
        if (el.closest('[hidden]')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
    });
}
