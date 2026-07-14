/**
 * Overlay scrollbar utilities for the js_new UI stack.
 * Ports the unified hover-only scrollbar system from the legacy UI manager.
 */

import { createRafResizeObserver } from './raf_resize_observer.js';

function normalizeOrientation(value) {
    return String(value || 'horizontal').toLowerCase() === 'vertical' ? 'vertical' : 'horizontal';
}

function ensureInstallState(container) {
    if (!container.__overlayScrollbarInstalled) {
        Object.defineProperty(container, '__overlayScrollbarInstalled', {
            value: {},
            writable: true,
            configurable: true,
        });
    }
}

export function installOverlayScrollbar(container, options = {}) {
    if (!container) return null;

    const orientation = normalizeOrientation(options.orientation);
    const className = options.className || 'overlay-scrollbar';
    const isHorizontal = orientation !== 'vertical';
    const orientationKey = isHorizontal ? 'horizontal' : 'vertical';

    ensureInstallState(container);
    if (container.__overlayScrollbarInstalled[orientationKey]) {
        return container.__overlayScrollbarInstalled[orientationKey];
    }

    if (options.setOverflow !== false) {
        container.style.overflow = options.overflow || 'auto';
    }
    if (options.setPosition !== false && getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }

    // When externalBar is true, place the bar on the parent element instead of
    // inside the scroll container. This avoids overflow clipping issues in certain
    // flex+overflow layouts (e.g. bottom-tabs-header .tabs).
    const externalBar = !!options.externalBar;
    const barHost = externalBar ? container.parentElement : container;
    if (externalBar && barHost && getComputedStyle(barHost).position === 'static') {
        barHost.style.position = 'relative';
    }

    const bar = document.createElement('div');
    bar.className = className;
    bar.classList.add(`overlay-scrollbar-${isHorizontal ? 'h' : 'v'}`);
    const track = document.createElement('div');
    track.className = 'track';
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    bar.appendChild(track);
    bar.appendChild(thumb);
    (barHost || container).appendChild(bar);

    const getScrollProps = () => ({
        scrollSize: isHorizontal ? container.scrollWidth : container.scrollHeight,
        clientSize: isHorizontal ? container.clientWidth : container.clientHeight,
        scrollPos: isHorizontal ? (container.scrollLeft || 0) : (container.scrollTop || 0),
    });

    // Dragging and hover state - must be declared early so event handlers can access it
    let dragging = false;
    let hovered = false;
    let startPos = 0;
    let thumbStartPos = 0;

    let previousHasOverflow = null;
    let previousClientSize = null;
    let isResettingScroll = false;

    const update = () => {
        if (isResettingScroll) return;

        const { scrollSize, clientSize, scrollPos } = getScrollProps();
        const scrollLeft = container.scrollLeft || 0;
        const scrollTop = container.scrollTop || 0;
        const maxScroll = scrollSize - clientSize;
        const hasOverflow = maxScroll > 2;

        if (previousClientSize !== null && clientSize > previousClientSize && hasOverflow && scrollPos > 0) {
            const delta = clientSize - previousClientSize;
            const targetScroll = Math.max(0, scrollPos - delta);
            if (targetScroll !== scrollPos) {
                isResettingScroll = true;
                if (isHorizontal) {
                    container.scrollLeft = targetScroll;
                } else {
                    container.scrollTop = targetScroll;
                }
                requestAnimationFrame(() => {
                    isResettingScroll = false;
                    update();
                });
                previousClientSize = clientSize;
                previousHasOverflow = hasOverflow;
                return;
            }
        }

        previousClientSize = clientSize;

        if (previousHasOverflow === true && !hasOverflow && scrollPos > 0) {
            isResettingScroll = true;
            if (isHorizontal) {
                container.scrollLeft = 0;
            } else {
                container.scrollTop = 0;
            }
            requestAnimationFrame(() => {
                isResettingScroll = false;
                update();
            });
            previousHasOverflow = hasOverflow;
            return;
        }

        const clampedMaxScroll = Math.max(0, maxScroll);
        if (hasOverflow && scrollPos > clampedMaxScroll) {
            isResettingScroll = true;
            if (isHorizontal) {
                container.scrollLeft = clampedMaxScroll;
            } else {
                container.scrollTop = clampedMaxScroll;
            }
            requestAnimationFrame(() => {
                isResettingScroll = false;
                update();
            });
            previousHasOverflow = hasOverflow;
            return;
        }
        previousHasOverflow = hasOverflow;

        container.dataset.scrollable = hasOverflow ? '1' : '0';

        // Position the bar at the scroll viewport edge.
        if (externalBar) {
            // Bar lives on the parent element — position using container's offset.
            // No scroll-offset compensation needed since bar is outside scroll context.
            if (isHorizontal) {
                bar.style.left = `${container.offsetLeft}px`;
                bar.style.bottom = 'auto';
                bar.style.top = `${container.offsetTop + container.offsetHeight - 6}px`;
                bar.style.width = `${container.clientWidth}px`;
            } else {
                bar.style.top = `${container.offsetTop}px`;
                bar.style.right = 'auto';
                bar.style.left = `${container.offsetLeft + container.offsetWidth - 6}px`;
                bar.style.height = `${container.clientHeight}px`;
            }
        } else {
            // Bar lives inside the container — compensate for scroll offset
            // on BOTH axes so the bar stays pinned to the viewport edge.
            if (isHorizontal) {
                bar.style.left = `${scrollLeft}px`;
                bar.style.top = `${scrollTop + container.clientHeight - bar.offsetHeight}px`;
                bar.style.bottom = 'auto';
                bar.style.width = `${clientSize}px`;
            } else {
                bar.style.top = `${scrollTop}px`;
                bar.style.left = `${scrollLeft + container.clientWidth - bar.offsetWidth}px`;
                bar.style.right = 'auto';
                bar.style.height = `${clientSize}px`;
            }
        }

        if (!hasOverflow) {
            bar.style.opacity = '0';
            bar.style.pointerEvents = 'none';
            thumb.style[isHorizontal ? 'width' : 'height'] = '0px';
            thumb.style[isHorizontal ? 'left' : 'top'] = '0px';
            return;
        }

        // Don't hide while dragging or hovering
        if (!dragging && !hovered) {
            bar.style.opacity = '0';       // hidden until hover
            bar.style.pointerEvents = 'none';
        }

        const ratio = clientSize / scrollSize;
        const thumbSize = Math.max(30, Math.floor(ratio * clientSize));
        const maxThumbPos = clientSize - thumbSize;
        const scrollRatio = maxScroll > 0 ? scrollPos / maxScroll : 0;
        const thumbPos = Math.round(maxThumbPos * scrollRatio);

        if (isHorizontal) {
            thumb.style.width = `${thumbSize}px`;
            thumb.style.left = `${thumbPos}px`;
        } else {
            thumb.style.height = `${thumbSize}px`;
            thumb.style.top = `${thumbPos}px`;
        }
    };

    const onScroll = () => update();
    container.addEventListener('scroll', onScroll, { passive: true });
    
    // Manage hover visibility entirely in JS to avoid CSS specificity issues.
    // Show bar on mouseenter if scrollable, hide on mouseleave.
    const onMouseEnter = () => {
        hovered = true;
        update();
        if (container.dataset.scrollable === '1') {
            bar.style.opacity = '1';
            bar.style.pointerEvents = '';
        }
    };
    const onMouseLeave = () => {
        hovered = false;
        // Don't hide while dragging
        if (dragging) return;
        bar.style.opacity = '0';
        bar.style.pointerEvents = 'none';
    };
    container.addEventListener('mouseenter', onMouseEnter, { passive: true });
    container.addEventListener('mouseleave', onMouseLeave, { passive: true });
    // When bar is external (sibling of container), also listen for hover on the bar
    // itself so moving the mouse to the thumb doesn't trigger a hide.
    if (externalBar) {
        bar.addEventListener('mouseenter', onMouseEnter, { passive: true });
        bar.addEventListener('mouseleave', onMouseLeave, { passive: true });
    }

    // Also handle focus-within for keyboard accessibility
    container.addEventListener('focusin', onMouseEnter, { passive: true });
    container.addEventListener('focusout', onMouseLeave, { passive: true });

    const resizeObserver = createRafResizeObserver(update);
    try { resizeObserver.observe(container); } catch (_) {}

    const mo = new MutationObserver(update);
    try { mo.observe(container, { childList: true, subtree: options.watchSubtree !== false }); } catch (_) {}

    let resizeTimeout;
    const onWindowResize = () => {
        update();
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(update, 150);
    };
    window.addEventListener('resize', onWindowResize, { passive: true });

    const onMouseDown = (e) => {
        dragging = true;
        startPos = isHorizontal ? e.clientX : e.clientY;
        thumbStartPos = parseFloat(thumb.style[isHorizontal ? 'left' : 'top']) || 0;
        // Keep bar visible while dragging
        bar.style.opacity = '1';
        bar.style.pointerEvents = '';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
        e.preventDefault();
        e.stopPropagation();
    };

    const onMouseMove = (e) => {
        if (!dragging) return;
        e.preventDefault();

        const { scrollSize, clientSize } = getScrollProps();
        const maxScroll = scrollSize - clientSize;
        if (maxScroll <= 0) return;

        const thumbSize = parseFloat(thumb.style[isHorizontal ? 'width' : 'height']) || 30;
        const maxThumbPos = clientSize - thumbSize;

        const delta = (isHorizontal ? e.clientX : e.clientY) - startPos;
        let newThumbPos = thumbStartPos + delta;
        newThumbPos = Math.max(0, Math.min(maxThumbPos, newThumbPos));

        const thumbRatio = maxThumbPos > 0 ? newThumbPos / maxThumbPos : 0;
        if (isHorizontal) {
            container.scrollLeft = thumbRatio * maxScroll;
        } else {
            container.scrollTop = thumbRatio * maxScroll;
        }
    };

    const onMouseUp = () => {
        dragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        // Check if mouse is still over container - if not, hide the bar
        const rect = container.getBoundingClientRect();
        const isMouseOver = document.elementsFromPoint(
            (rect.left + rect.right) / 2,
            (rect.top + rect.bottom) / 2
        ).includes(container);
        if (!isMouseOver) {
            bar.style.opacity = '0';
            bar.style.pointerEvents = 'none';
        }
    };

    thumb.addEventListener('mousedown', onMouseDown);

    // Wheel-to-horizontal: convert vertical wheel into horizontal scroll,
    // but only when the container has no vertical overflow (otherwise let
    // the browser handle normal vertical scrolling).
    let onWheel = null;
    if (isHorizontal) {
        onWheel = (e) => {
            const { scrollSize, clientSize } = getScrollProps();
            if (scrollSize <= clientSize) return;
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            // If the container also scrolls vertically, don't hijack the wheel
            if (container.scrollHeight > container.clientHeight) return;
            e.preventDefault();
            container.scrollLeft += e.deltaY;
        };
        container.addEventListener('wheel', onWheel, { passive: false });
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(update);
    });
    setTimeout(update, 50);

    const cleanup = () => {
        container.removeEventListener('scroll', onScroll);
        container.removeEventListener('mouseenter', onMouseEnter);
        container.removeEventListener('mouseleave', onMouseLeave);
        container.removeEventListener('focusin', onMouseEnter);
        container.removeEventListener('focusout', onMouseLeave);
        if (externalBar) {
            bar.removeEventListener('mouseenter', onMouseEnter);
            bar.removeEventListener('mouseleave', onMouseLeave);
        }
        if (onWheel) container.removeEventListener('wheel', onWheel);
        window.removeEventListener('resize', onWindowResize);
        try { resizeObserver.disconnect(); } catch (_) {}
        try { mo.disconnect(); } catch (_) {}
        bar.remove();
    };

    const handle = { update, cleanup, bar, thumb };
    container.__overlayScrollbarInstalled[orientationKey] = handle;
    return handle;
}

export function installWorkspaceScrollbars(workspace, options = {}) {
    if (!workspace) return null;
    if (workspace.__workspaceOverlayScrollbarsInstalled) return workspace.__workspaceOverlayScrollbarsUpdate;

    installOverlayScrollbar(workspace, {
        orientation: 'vertical',
        className: options.verticalClass || 'panel-scrollbar',
        watchSubtree: options.watchSubtree ?? true,
    });
    installOverlayScrollbar(workspace, {
        orientation: 'horizontal',
        className: options.horizontalClass || 'tabs-scrollbar',
        watchSubtree: options.watchSubtree ?? true,
    });

    const update = () => {
        const maxX = Math.max(0, workspace.scrollWidth - workspace.clientWidth);
        const maxY = Math.max(0, workspace.scrollHeight - workspace.clientHeight);
        workspace.dataset.scrollableX = maxX > 1 ? '1' : '0';
        workspace.dataset.scrollableY = maxY > 1 ? '1' : '0';
    };

    workspace.__workspaceOverlayScrollbarsInstalled = true;
    workspace.__workspaceOverlayScrollbarsUpdate = update;
    workspace.addEventListener('scroll', update, { passive: true });
    const ro = createRafResizeObserver(update);
    try { ro.observe(workspace); } catch (_) {}
    const mo = new MutationObserver(update);
    try { mo.observe(workspace, { childList: true, subtree: true }); } catch (_) {}
    requestAnimationFrame(update);
    return update;
}

/**
 * Auto-discover and install vertical overlay scrollbars on `.collapsible-content.visible`
 * elements inside `#fixed-200`. Uses a MutationObserver to handle dynamically created
 * content (pages mount lazily) and class toggles (expand/collapse).
 *
 * Only adds the visual overlay bar — does NOT change overflow. Elements that are already
 * scrollable via CSS (e.g. accordion `.collapsible-content.visible { overflow-y: auto }`)
 * get the bar; non-scrollable elements get a no-op bar that stays hidden.
 *
 * @returns {Function} disconnect — stops watching
 */
export function installCollapsibleScrollbars() {
    const installOnElement = (el) => {
        installOverlayScrollbar(el, {
            orientation: 'vertical',
            setOverflow: false,
            watchSubtree: true,
        });
    };

    const root = document.getElementById('twm-fixed-200');
    if (root) {
        root.querySelectorAll('.twm-collapsible-content.visible').forEach(installOnElement);
    }

    // Watch for new elements AND class changes (visible toggled by toggleCategory)
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Class change — check if .collapsible-content just gained .visible
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const el = mutation.target;
                if (el.classList.contains('twm-collapsible-content') && el.classList.contains('visible')) {
                    installOnElement(el);
                }
                continue;
            }
            // New subtrees added (lazy page mount)
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.classList?.contains('twm-collapsible-content') && node.classList?.contains('visible')) {
                    installOnElement(node);
                }
                node.querySelectorAll?.('.twm-collapsible-content.visible')?.forEach(installOnElement);
            }
        }
    });

    const target = root || document.body;
    observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
    });
    return () => observer.disconnect();
}

/**
 * Auto-discover and install horizontal overlay scrollbars on tab strips.
 *
 * Uses a MutationObserver so dynamically created tab strips are picked up
 * without per-page manual setup.
 *
 * The selector list used to be hardcoded as `.tabs, .scenario-detail-tabs`, so
 * a generic scrollbar utility carried the name of one EcoAgent page's tab bar.
 * The caller names its own strips now.
 *
 * @param {string[]} [selectors=['.tabs']] Which elements count as a tab strip.
 * @returns {Function} disconnect — stops watching for new tabs
 */
export function installTabsScrollbars(selectors = ['.tabs']) {
    const selector = selectors.join(', ');
    const classes = selectors
        .filter((s) => s.startsWith('.'))
        .map((s) => s.slice(1));
    const installOnElement = (el) => {
        installOverlayScrollbar(el, {
            orientation: 'horizontal',
            className: 'tabs-scrollbar',
            setOverflow: false,
            externalBar: true,
            watchSubtree: true,
        });
    };

    const cleanupElement = (el) => {
        el.__overlayScrollbarInstalled?.horizontal?.cleanup?.();
        delete el.__overlayScrollbarInstalled;
    };

    const matches = (el) => classes.some((c) => el.classList?.contains(c));

    document.querySelectorAll(selector).forEach(installOnElement);

    // Watch for dynamically added/removed elements
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (matches(node)) installOnElement(node);
                node.querySelectorAll?.(selector)?.forEach(installOnElement);
            }
            for (const node of mutation.removedNodes) {
                if (node.nodeType !== 1) continue;
                if (matches(node)) cleanupElement(node);
                node.querySelectorAll?.(selector)?.forEach(cleanupElement);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
}
