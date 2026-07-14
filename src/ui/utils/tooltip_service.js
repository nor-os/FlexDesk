/**
 * tooltip_service.js
 *
 * JS-driven tooltip system for elements with `has-tooltip` class and `data-tooltip` attribute.
 * Also supports LaTeX tooltips with `has-latex-tooltip` and `data-latex-tooltip`.
 *
 * This replaces CSS-based ::after pseudo-element tooltips for better stacking context
 * and dynamic content support.
 */

let tooltipElement = null;
let currentTarget = null;
let listenersAttached = false;
let mouseCheckInterval = null;
let lastMousePosition = { x: 0, y: 0 };

/**
 * Create or get the tooltip DOM element.
 * @returns {HTMLElement}
 */
function createTooltipElement() {
    if (tooltipElement) return tooltipElement;

    tooltipElement = document.createElement('div');
    tooltipElement.className = 'twm-latex-tooltip';
    document.body.appendChild(tooltipElement);
    return tooltipElement;
}

/**
 * Position the tooltip relative to target element with smart auto-positioning.
 * Automatically flips placement if tooltip would extend outside viewport.
 * @param {HTMLElement} target - Element to position near
 * @param {HTMLElement} tooltip - Tooltip element
 */
function positionTooltip(target, tooltip) {
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 12;
    const margin = 10; // Minimum distance from viewport edge

    // Get requested placement from data attributes or context
    const requestedPlacement = (target.dataset?.tooltipPlacement || target.getAttribute('data-tooltip-placement') || '').toLowerCase() ||
        (target.dataset?.latexPlacement || target.getAttribute('data-latex-placement') || '').toLowerCase() ||
        (target.closest('.twm-global-top-bar') ? 'bottom' : (target.closest('.twm-fl-bar') ? 'right' : 'top'));

    // Auto-positioning: determine best placement based on available space
    let placement = requestedPlacement || 'top';

    // Check if explicit placement is set (not auto)
    const isExplicitPlacement = target.hasAttribute('data-tooltip-placement') ||
                                 target.hasAttribute('data-latex-placement');

    if (!isExplicitPlacement) {
        // Calculate available space in each direction
        const spaceAbove = rect.top - margin;
        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceLeft = rect.left - margin;
        const spaceRight = window.innerWidth - rect.right - margin;

        // Auto-select placement based on available space
        if (placement === 'top' && tooltipRect.height > spaceAbove && spaceBelow > spaceAbove) {
            placement = 'bottom';
        } else if (placement === 'bottom' && tooltipRect.height > spaceBelow && spaceAbove > spaceBelow) {
            placement = 'top';
        } else if (placement === 'left' && tooltipRect.width > spaceLeft && spaceRight > spaceLeft) {
            placement = 'right';
        } else if (placement === 'right' && tooltipRect.width > spaceRight && spaceLeft > spaceRight) {
            placement = 'left';
        }
    }

    // Calculate position based on final placement
    let left, top;

    if (placement === 'top') {
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        top = rect.top - tooltipRect.height - gap;
    } else if (placement === 'bottom') {
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        top = rect.bottom + gap;
    } else if (placement === 'left') {
        left = rect.left - tooltipRect.width - gap;
        top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
    } else if (placement === 'right') {
        left = rect.right + gap;
        top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
    }

    // Clamp to viewport
    const clampedLeft = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    const clampedTop = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

    tooltip.style.left = `${clampedLeft}px`;
    tooltip.style.top = `${clampedTop}px`;

    // Calculate notch/arrow offset to point toward the target element center
    const targetCenterX = rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;
    let notchOffset = 0;

    if (placement === 'top' || placement === 'bottom') {
        // Horizontal offset for notch
        const tooltipCenterX = clampedLeft + tooltipRect.width / 2;
        notchOffset = targetCenterX - tooltipCenterX;
        // Clamp notch offset to stay within tooltip bounds
        const maxOffset = (tooltipRect.width / 2) - 16; // 16px from edge minimum
        notchOffset = Math.max(-maxOffset, Math.min(notchOffset, maxOffset));
    } else {
        // Vertical offset for notch
        const tooltipCenterY = clampedTop + tooltipRect.height / 2;
        notchOffset = targetCenterY - tooltipCenterY;
        // Clamp notch offset
        const maxOffset = (tooltipRect.height / 2) - 16;
        notchOffset = Math.max(-maxOffset, Math.min(notchOffset, maxOffset));
    }

    // Set placement and notch offset attributes for CSS styling
    const setAttributes = () => {
        tooltip.setAttribute('data-placement', placement);
        tooltip.style.setProperty('--notch-offset', `${notchOffset}px`);
    };

    const guard = window.stateGuard;
    if (guard?.executeWithBypass) {
        guard.executeWithBypass('latex-tooltip:set-placement', setAttributes);
    } else {
        setAttributes();
    }
}

/**
 * Show tooltip for a target element.
 * @param {HTMLElement} target - Element with tooltip data
 */
function showTooltip(target) {
    if (!target || !target.getAttribute) return;

    const hasLatex = target.classList && target.classList.contains('has-latex-tooltip');
    const hasPlain = target.classList && target.classList.contains('twm-has-tooltip');

    if (!hasLatex && !hasPlain) return;

    currentTarget = target;
    const tooltip = createTooltipElement();

    if (hasLatex) {
        // Render LaTeX using KaTeX
        const latex = target.getAttribute('data-latex-tooltip');
        if (!latex) return;

        try {
            if (typeof katex !== 'undefined') {
                katex.render(latex, tooltip, {
                    displayMode: true,
                    throwOnError: false,
                    trust: false
                });
            } else {
                tooltip.textContent = latex;
            }
        } catch (err) {
            window.logger?.error('nodes', 'KaTeX rendering error:', err);
            tooltip.textContent = latex;
        }
    } else if (hasPlain) {
        // Plain text tooltip with line breaks preserved
        const text = target.getAttribute('data-tooltip');
        if (!text) return;

        // Replace &#10; with actual line breaks, preserve formatting
        const formattedText = text.replace(/&#10;/g, '\n');
        const lines = formattedText.split('\n');

        tooltip.innerHTML = '';
        lines.forEach((line, index) => {
            if (index === 0) {
                // First line is bold header
                const header = document.createElement('strong');
                header.textContent = line;
                tooltip.appendChild(header);
            } else {
                // Add line break and text
                tooltip.appendChild(document.createElement('br'));
                const textNode = document.createTextNode(line);
                tooltip.appendChild(textNode);
            }
        });
    }

    // Optional per-target width override (for long plain-text content like
    // widget documentation).  Set data-tooltip-max-width on the target with a
    // CSS length (e.g. "420px").  Reset between shows so sticky values don't
    // leak across unrelated targets.
    const widthOverride = target.getAttribute('data-tooltip-max-width');
    tooltip.style.maxWidth = widthOverride || '';

    // Position and show
    requestAnimationFrame(() => {
        positionTooltip(target, tooltip);
        tooltip.classList.add('visible');

        // Start mouse position check for auto-hide
        startMouseCheck();
    });
}

/**
 * Hide the tooltip and clean up.
 */
function hideTooltip() {
    if (tooltipElement) {
        tooltipElement.classList.remove('visible');
    }
    currentTarget = null;

    // Clear mouse check interval
    if (mouseCheckInterval) {
        clearInterval(mouseCheckInterval);
        mouseCheckInterval = null;
    }
}

/**
 * Start the mouse position check interval.
 * Hides tooltip if mouse is no longer over the target element.
 */
function startMouseCheck() {
    // Clear any existing interval
    if (mouseCheckInterval) {
        clearInterval(mouseCheckInterval);
    }

    // Check every 3 seconds if mouse is still on the target element
    mouseCheckInterval = setInterval(() => {
        if (!currentTarget) {
            clearInterval(mouseCheckInterval);
            mouseCheckInterval = null;
            return;
        }

        // Get element under the last known mouse position
        const elementUnderMouse = document.elementFromPoint(lastMousePosition.x, lastMousePosition.y);

        // Check if the element under mouse is the target or a child of it
        if (elementUnderMouse) {
            const isStillOnTarget = elementUnderMouse === currentTarget ||
                                     currentTarget.contains(elementUnderMouse) ||
                                     elementUnderMouse.closest('.twm-has-tooltip, .has-latex-tooltip') === currentTarget;

            if (!isStillOnTarget) {
                hideTooltip();
            }
        } else {
            // Mouse is outside the document
            hideTooltip();
        }
    }, 3000);
}

/**
 * Attach global event listeners for tooltips.
 */
function attachListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    // Remove all title attributes from elements with custom tooltips
    document.querySelectorAll('.twm-has-tooltip, .has-latex-tooltip').forEach(el => {
        el.removeAttribute('title');
    });

    // Track mouse position for the 3-second auto-hide check
    document.addEventListener('mousemove', (event) => {
        lastMousePosition.x = event.clientX;
        lastMousePosition.y = event.clientY;
    }, { passive: true });

    document.addEventListener('mouseenter', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const tooltipTarget = target.closest('.has-latex-tooltip, .twm-has-tooltip');
        if (!tooltipTarget) return;
        // Skip template nodes in fixed-200 panel - handled elsewhere
        if (tooltipTarget.closest('.panel.twm-fixed-200 .node.template')) {
            return;
        }
        showTooltip(tooltipTarget);
    }, true);

    document.addEventListener('mouseleave', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const tooltipTarget = target.closest('.has-latex-tooltip, .twm-has-tooltip');
        if (!tooltipTarget) return;
        // Skip template nodes in fixed-200 panel
        if (tooltipTarget.closest('.panel.twm-fixed-200 .node.template')) {
            return;
        }
        hideTooltip();
    }, true);

    // Hide on scroll
    document.addEventListener('scroll', hideTooltip, true);

    // ESC key hides all tooltips application-wide (does not stop propagation)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            hideTooltip();
            // Note: We intentionally do NOT call event.stopPropagation()
            // so other listeners can also respond to ESC
        }
    }, true);
}

/**
 * Initialize the tooltip system.
 */
function initializeTooltips() {
    // Wait for KaTeX to load (optional, for latex tooltips)
    const initInterval = setInterval(() => {
        if (typeof katex !== 'undefined') {
            clearInterval(initInterval);
            if (!listenersAttached) {
                attachListeners();
            }
        }
    }, 100);

    // Timeout after 2 seconds - attach listeners anyway for plain tooltips
    setTimeout(() => {
        clearInterval(initInterval);
        if (!listenersAttached) {
            attachListeners();
        }
    }, 2000);
}

/**
 * Set a tooltip on an element programmatically.
 * @param {HTMLElement} element - Target element
 * @param {string} text - Tooltip text
 * @param {boolean} [isLatex=false] - Whether to render as LaTeX
 */
function setTooltip(element, text, isLatex = false) {
    if (!element || !text) return;

    // Remove any existing title attribute
    element.removeAttribute('title');

    if (isLatex) {
        element.classList.add('has-latex-tooltip');
        element.classList.remove('twm-has-tooltip');
        element.setAttribute('data-latex-tooltip', text);
    } else {
        element.classList.add('twm-has-tooltip');
        element.classList.remove('has-latex-tooltip');
        element.setAttribute('data-tooltip', text);
    }
}

/**
 * Refresh tooltips for dynamically added content.
 * Removes title attributes that might cause native tooltips.
 * @param {HTMLElement} [container=document] - Container to search within
 */
function refreshTooltips(container = document) {
    container.querySelectorAll('.twm-has-tooltip, .has-latex-tooltip').forEach(el => {
        el.removeAttribute('title');
    });
}

// ES module exports — the real interface.
export const TooltipService = {
    show: showTooltip,
    hide: hideTooltip,
    set: setTooltip,
    refresh: refreshTooltips,
    init: initializeTooltips
};

export default TooltipService;

// Everything below is a side effect of IMPORTING this file, and it is guarded.
//
// Unguarded, it touched `document` and `window` at module scope, which made
// @flexdesk/widgets throw `ReferenceError: window is not defined` the moment anything
// imported it outside a browser. The DOM check is not defensive programming; it
// is the difference between a module and a script.
//
// `window.LatexTooltip` stays, because unlike `window.InlineRenamer` it is real:
// roughly 25 call sites read it, all as `window.LatexTooltip?.set(...)`, and one
// of them is INSIDE the library (window_chrome_controller.js). That last one is a
// hidden dependency on a global and should import TooltipService instead — a small
// piece of P6 cleanup, noted rather than smuggled in here.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTooltips);
    } else {
        initializeTooltips();
    }
}

if (typeof window !== 'undefined') {
    window.LatexTooltip = TooltipService;
}
