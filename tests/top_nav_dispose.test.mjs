/**
 * ══ THE TOP NAV COMES OFF WITH ITS SHELL ══
 *
 * `chrome.topNav` is the embedder's element and outlives the shell. Its click
 * listener closed over the shell's window manager and nothing took it off, so a
 * shell rebuilt on the same element (Tables does, on every project switch) left
 * every earlier shell listening: a press opened the page in each dead window
 * manager as well as in the live one.
 *
 *   §1  dispose empties the element and takes the listener off
 *   §2  a rebuilt shell paints its own, and only it hears a press
 *
 *     node tests/top_nav_dispose.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('top nav dispose');
const { document } = t;

const { createShell } = await import('../src/tiling/shell.js');
const { createTaxonomy } = await import('../src/tiling/kind_taxonomy.js');
const { createEntityCatalog } = await import('../src/tiling/entity_sources.js');

const KINDS = {
    start: { label: 'Start', icon: 'apps' },
    atlas: { label: 'Atlas', icon: 'map', isTopNav: true, order: 10 },
    log: { label: 'Log', icon: 'article', isTopNav: true, order: 20 },
};
const content = Object.fromEntries(Object.keys(KINDS).map((k) => [k, (h) => { h.textContent = k; return {}; }]));

function page() {
    document.body.innerHTML = '';
    const nav = document.createElement('nav');
    const root = document.createElement('div');
    document.body.append(nav, root);
    return { nav, root };
}
const build = ({ nav, root }) => createShell({
    root,
    entities: createEntityCatalog({ sources: [] }),
    taxonomy: createTaxonomy({ root: 'start', kinds: KINDS }),
    content,
    panels: { left: false, right: false, bottom: false },
    chrome: { topNav: nav },
});
const primaryKind = (shell) => {
    const tree = shell.wm.desktops.active().tree;
    return tree.get(tree.primaryLeafId())?.content?.kind ?? null;
};
const button = (nav, kind) => nav.querySelector(`[data-kind="${kind}"]`);

t.section('§1 dispose');
{
    const p = page();
    const shell = await build(p);
    t.ok('the shell hands the element back', shell.chrome.topNavEl === p.nav);
    button(p.nav, 'log').click();
    t.check('a press opens the page', primaryKind(shell), 'log');

    shell.dispose();
    t.check('dispose empties the element', p.nav.children.length, 0);
    // A button put back in the element reaches any listener still on it.
    const stale = document.createElement('button');
    stale.dataset.kind = 'atlas';
    p.nav.append(stale);
    let opened = 0;
    const open = shell.wm.openInPrimary;
    shell.wm.openInPrimary = (...args) => { opened++; return open.apply(shell.wm, args); };
    stale.click();
    t.check('the listener is off: the disposed shell heard nothing', opened, 0);
}

t.section('§2 a rebuilt shell on the same element');
{
    const p = page();
    const first = await build(p);
    first.dispose();
    let firstOpened = 0;
    const open = first.wm.openInPrimary;
    first.wm.openInPrimary = (...args) => { firstOpened++; return open.apply(first.wm, args); };
    p.root.replaceChildren();
    const second = await build(p);
    t.check('it paints its own', [...p.nav.querySelectorAll('[data-kind]')].map((b) => b.dataset.kind), ['atlas', 'log']);
    button(p.nav, 'atlas').click();
    t.check('a press drives the live shell', primaryKind(second), 'atlas');
    t.check('and not the disposed one', firstOpened, 0);
    second.dispose();
}

t.done();
