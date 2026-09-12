/**
 * tile_breadcrumb.js — per-tile breadcrumb strip rendered above each
 * page's content.
 *
 * Reuses the existing `topbar-breadcrumb__*` CSS classes so the look
 * matches the rest of the app (notebook editor, etc.). Segments are
 * built from the leaf's content kind + props.id, and clicking a
 * non-current segment routes through wm.navigate so the user jumps to
 * that level.
 *
 * The path is assembled from FOUR taxonomy questions, none of which this
 * module answers itself:
 *
 *   1. `ctx.rootCrumb`          the leading segment + how its label stays fresh
 *   2. `taxonomy.topNavFor`     which section owns the kind
 *   3. `taxonomy.ancestors`     the entity-level chain above ONE instance
 *   4. `taxonomy.labelOf`       what to call that instance
 *
 * (3) is the one that matters. Deriving an instance's parent from its id
 * is a naming convention, and naming conventions belong to the embedder;
 * this file used to hardcode two of them.
 */

/** Build a breadcrumb strip element + render initial state. Returns
 *  `{ el, destroy }`. The strip is wired to the WM (clicks open content
 *  in the primary tile) and, when the embedder supplies a `rootCrumb`
 *  with a `subscribe` hook, to whatever keeps the root label fresh. */
export function mountTileBreadcrumb(kind, props, ctx) {
    const eventBus  = ctx?.eventBus;
    const taxonomy  = ctx?.taxonomy;
    const rootCrumb = ctx?.rootCrumb || null;
    if (!taxonomy) {
        console.error('[breadcrumb] no taxonomy in ctx — cannot render');
        return { el: document.createElement('nav'), destroy: () => {} };
    }
    const root = document.createElement('nav');
    root.className = 'twm-topbar-breadcrumb twm-tile-breadcrumb';
    root.setAttribute('aria-label', 'Tile breadcrumb');

    // Look up wm late (at click time) instead of capturing it once at
    // mount. ctx.wm should always be set by the renderer, but fall
    // back to the global escape hatch (set by install.js after
    // wm.load()) so a closure that lost ctx.wm — or a mount called
    // before the renderer threaded wm through — still navigates.
    const getWm = () => ctx?.wm || window.__twm?.wm || null;

    // Breadcrumb segments route through the canonical `wm.navigate`
    // helper so the same three-axis routing (window → replace window,
    // tile → replace active tab, panel/none → primary) lives in one
    // place. Critically, this is what makes the breadcrumb work in
    // WINDOWED mode — passing `ctx` keeps windowId in scope so the
    // segment click stays inside the floating window instead of
    // jumping back to the primary tile.
    const navigate = (k, p = {}) => {
        const wm = getWm();
        if (!wm) {
            console.error('[breadcrumb] no WM available — click ignored', k);
            return;
        }
        if (typeof wm.navigate === 'function') {
            wm.navigate(k, p, { ctx, dest: 'origin' });
        } else if (typeof wm.openInPrimary === 'function') {
            // Fallback for older WM revisions.
            wm.openInPrimary(k, p);
        } else {
            console.error('[breadcrumb] WM has no navigate/openInPrimary');
        }
    };

    // The root segment's label is the embedder's to supply and to keep
    // fresh (it names whatever the root entity is — a project, a
    // workspace, a document). Absent `rootCrumb` ⇒ no root segment, and
    // the breadcrumb simply starts at the top-nav.
    let rootLabel = rootCrumb?.label || '';

    // Read at RENDER time, not captured: the trail grows with every
    // click-through, and a breadcrumb that showed the trail as it was when the
    // tile mounted would be describing a journey the user has since continued.
    const trailOf = () => {
        if (typeof ctx?.trailSegments !== 'function') return [];
        try { return ctx.trailSegments() || []; }
        catch (err) { console.warn('[breadcrumb] trailSegments threw', err); return []; }
    };
    const render = () => {
        _renderInto(root,
            _segments(kind, props, taxonomy, rootCrumb, rootLabel, navigate, trailOf()));
    };
    render();

    let unsubscribe = null;
    if (typeof rootCrumb?.subscribe === 'function') {
        try {
            unsubscribe = rootCrumb.subscribe((next) => {
                if (next?.label) rootLabel = next.label;
                render();
            }, { api: ctx?.api, host: ctx?.host, eventBus });
        } catch (err) {
            console.warn('[breadcrumb] rootCrumb.subscribe threw', err);
        }
    }

    return {
        el: root,
        /** Repaint. A trail-driven breadcrumb changes without the tile
         *  remounting — following a lookup replaces the active tab's content in
         *  place — so the embedder that grew the trail says when. */
        refresh: render,
        destroy: () => {
            try { unsubscribe?.(); }
            catch (err) { console.warn('[breadcrumb] rootCrumb teardown threw', err); }
        },
    };
}

function _segments(kind, props, taxonomy, rootCrumb, rootLabel, navigate, trail) {
    const segs = [];
    const meta = taxonomy.meta(kind);

    // App-global kinds (e.g. a preferences page) aren't scoped to the
    // root entity — they open with no project loaded and persist to
    // app-level storage — so their breadcrumb has no root ancestor.
    if (meta?.appGlobal) {
        return [{ icon: meta.icon, label: meta.label, onClick: null }];
    }

    // 1. The root segment → clicks back to the root page.
    if (rootCrumb) {
        segs.push({
            icon:  rootCrumb.icon,
            label: rootLabel || rootCrumb.label,
            onClick: () => navigate(rootCrumb.navKind ?? taxonomy.root),
        });
    }

    // 2. The top-nav segment. Skipped on the root itself (the root
    //    segment already names it) and when the kind isn't in the
    //    taxonomy at all.
    const topNav     = taxonomy.topNavFor(kind);
    const topNavMeta = topNav ? taxonomy.meta(topNav) : null;
    if (topNav && topNav !== taxonomy.root && topNavMeta) {
        segs.push({
            icon:  topNavMeta.icon,
            label: topNavMeta.label,
            onClick: () => navigate(topNav),
        });
    }

    // 2b. THE TRAIL. An embedder whose navigation is a walk rather than a
    //     descent — click a customer, follow a lookup to its region, follow
    //     that to a country — has a real path that the taxonomy cannot know,
    //     because none of those is an ANCESTOR of the next. The tree already
    //     records it: every in-tile navigation pushes the outgoing content
    //     onto the active tab's `history` stack, which is what Backspace pops.
    //
    //     `ctx.trailSegments` hands that stack over, already shaped. Absent, or
    //     empty, this is a no-op and the breadcrumb is exactly the ancestor
    //     walk it has always been.
    for (const step of (trail || [])) {
        if (!step?.kind) continue;
        segs.push({
            icon:  taxonomy.meta(step.kind)?.icon || 'description',
            label: step.title || step.props?.label || step.props?.id || step.kind,
            onClick: () => navigate(step.kind, step.props || {}),
        });
    }

    // 3. Entity-level ancestors, root-most first — supplied by the
    //    taxonomy, not by string surgery on the id.
    for (const anc of taxonomy.ancestors(kind, props)) {
        segs.push({
            icon:  taxonomy.meta(anc.kind)?.icon || 'description',
            label: anc.props.label ?? anc.props.id,
            onClick: () => navigate(anc.kind, anc.props),
        });
    }

    // 4. The node itself.
    const hasEntity = !!props?.id;
    if (meta) {
        if (hasEntity) {
            segs.push({
                icon:  meta.icon,
                label: taxonomy.labelOf(kind, props),
                onClick: null,
            });
        } else if (kind !== topNav) {
            // The kind IS the top-nav (e.g. opening a landing page).
            // Don't duplicate the chip — the segment above already
            // names it.
            segs.push({
                icon:  meta.icon,
                label: meta.label,
                onClick: null,
            });
        }
    } else if (hasEntity) {
        // Kind isn't in the taxonomy yet — still surface the entity
        // name so the user sees where they are, just without an icon.
        segs.push({
            icon:  'description',
            label: props.label || props.id,
            onClick: null,
        });
    }
    return segs;
}

function _renderInto(container, segments) {
    container.innerHTML = '';
    if (!segments?.length) return;
    const ol = document.createElement('ol');
    ol.className = 'twm-topbar-breadcrumb__list';
    segments.forEach((seg, i) => {
        const li = document.createElement('li');
        li.className = 'twm-topbar-breadcrumb__item';
        const isLast = i === segments.length - 1;
        if (isLast || !seg.onClick) {
            li.classList.add('twm-topbar-breadcrumb__item--current');
            li.innerHTML = `
                <span class="material-symbols-outlined twm-topbar-breadcrumb__icon">${_esc(seg.icon)}</span>
                <span class="twm-topbar-breadcrumb__current">${_esc(seg.label)}</span>
            `;
        } else {
            const btn = document.createElement('button');
            btn.className = 'twm-topbar-breadcrumb__link';
            btn.type = 'button';
            btn.innerHTML = `
                <span class="material-symbols-outlined twm-topbar-breadcrumb__icon">${_esc(seg.icon)}</span>
                <span>${_esc(seg.label)}</span>
            `;
            btn.addEventListener('click', () => {
                btn.classList.add('twm-tile-breadcrumb__link--flash');
                setTimeout(() => {
                    btn.classList.remove('twm-tile-breadcrumb__link--flash');
                }, 180);
                try { seg.onClick(); }
                catch (e) { console.error('[breadcrumb] segment click threw', e); }
            });
            li.appendChild(btn);
            const sep = document.createElement('span');
            sep.className = 'twm-topbar-breadcrumb__separator';
            sep.textContent = '›';
            li.appendChild(sep);
        }
        ol.appendChild(li);
    });
    container.appendChild(ol);
}

function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
