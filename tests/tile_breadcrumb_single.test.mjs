/**
 * STORY-0124 — A TILE BREADCRUMB WHOSE PATH IS ONE SEGMENT IS NOT DRAWN.
 *
 * A top-level page's tile showed its title bar ("Model") and under it a tile
 * breadcrumb whose only segment was the same page. The tile's title already
 * names it, so the strip is hidden until there is a level above.
 *
 *   §1  a top-nav page with no root crumb: one segment, the strip is `hidden`
 *   §2  an entity under that page: two segments, drawn as before
 *   §3  a trail that grows makes a one-segment strip appear on `refresh()`
 *   §4  a root crumb makes two segments on the page itself: drawn
 *   §5  flexdesk.css takes a hidden strip's page-shell slot out of the layout
 *
 *     node tests/tile_breadcrumb_single.test.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('tile breadcrumb single segment');
const { check, ok, section, done } = T;
const { mountTileBreadcrumb } = await import('../src/tiling/tile_breadcrumb.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, '..', 'css', 'flexdesk.css'), 'utf8');
const overrides = readFileSync(join(HERE, '..', 'css', 'overrides.css'), 'utf8');

const taxonomy = createTaxonomy({
    root: 'start',
    kinds: {
        start: { label: 'Start', icon: 'apps' },
        model: { label: 'Model', icon: 'functions', isTopNav: true },
        data: { label: 'Data', icon: 'database', isTopNav: true },
        series: { label: 'Series', icon: 'insights', topNav: 'data' },
    },
});
const labels = (el) => [...el.querySelectorAll('.twm-topbar-breadcrumb__item')].map((li) => li.textContent.trim());

section('§1 a top-nav page alone: one segment, not drawn');
{
    const crumb = mountTileBreadcrumb('model', {}, { taxonomy });
    check('one segment, the page', labels(crumb.el).length, 1);
    ok('naming the page', /Model/.test(labels(crumb.el)[0]));
    check('the strip is hidden', crumb.el.hidden, true);
}

section('§2 an entity under a page: two segments, drawn');
{
    const crumb = mountTileBreadcrumb('series', { id: 'run-1', label: 'Run 1' }, { taxonomy });
    check('two segments', labels(crumb.el).length, 2);
    check('the strip is shown', crumb.el.hidden, false);
}

section('§3 a growing trail shows the strip on refresh()');
{
    const trail = [];
    const crumb = mountTileBreadcrumb('model', {}, { taxonomy, trailSegments: () => trail });
    check('hidden at first', crumb.el.hidden, true);
    trail.push({ kind: 'data', props: {}, title: 'Data' });
    crumb.refresh();
    check('shown once the trail has a step', crumb.el.hidden, false);
    check('with both segments', labels(crumb.el).length, 2);
}

section('§4 a root crumb makes two segments on the page itself');
{
    const crumb = mountTileBreadcrumb('model', {}, { taxonomy, rootCrumb: { label: 'My project', icon: 'folder' } });
    check('root and page', labels(crumb.el).length, 2);
    check('drawn', crumb.el.hidden, false);
}

section('§5 a hidden strip takes its slot out of the layout');
const rule = /\.twm-page-shell__breadcrumb \.twm-tile-breadcrumb\[hidden\],\s*\.twm-page-shell__breadcrumb:has\(> \.twm-tile-breadcrumb\[hidden\]\) \{\s*display: none;\s*\}/;
ok('flexdesk.css hides the strip and its slot', rule.test(css));
ok('overrides.css carries the same rule', rule.test(overrides));

done();
