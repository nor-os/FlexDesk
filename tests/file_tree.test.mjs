/**
 * THE FILE TREE, AND THE PIECES THAT LET TWO APPLICATIONS SHARE ONE NAVIGATOR
 *
 *   §1  createFileTree builds folders from paths and `folders`, folders first,
 *       with descendant counts; the active file is selected and its folders open
 *   §2  A folder stays as the user left it across `setData`
 *   §3  A click opens, a quick second click pins; a row's buttons and the menu
 *       offer only the actions that have a callback
 *   §4  The filter keeps matching files (name, path or `matchText`) and their folders
 *   §5  F2 renames in place through onRename, keeping the extension; a refusal
 *       puts the old name back
 *   §6  Dropping a file on a folder calls onMove; not onto itself
 *   §7  Badges and open marks are set without a redraw
 *   §8  A nav panel mode is told when another mode is chosen (`deactivate`) and
 *       can put a count on its strip button (`setBadge`)
 *   §9  The git panel filters changed-file rows, and createGitPane builds the
 *       panel on first visit, polls only while shown and reports the count
 *   §10 withTileBreadcrumb mounts the crumb above the content, repaints it on
 *       setBreadcrumbProps, and mounts none in a window
 *
 *     node tests/file_tree.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('file tree');
const { check, ok, section, done, click, key, tick, document, window } = T;
const { createFileTree } = await import('../src/ui/components/file_tree.js');
const { mountNavPanel } = await import('../src/tiling/nav_panel.js');
const { createGitPane } = await import('../src/git/git_pane.js');
const { withTileBreadcrumb } = await import('../src/tiling/tile_breadcrumb.js');

const mountTree = (options = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const tree = createFileTree(host, { scrollbar: false, ...options });
    return { host, tree };
};
const FILES = [
    { path: 'readme.md' },
    { path: 'models/a.json' },
    { path: 'models/b.json' },
    { path: 'models/old/c.json' },
    { path: 'zeta.json' },
];
const ids = (host) => [...host.querySelectorAll('.twm-tree-item')].map((e) => e.dataset.itemId);
const folderIds = (host) => [...host.querySelectorAll('.twm-tree-node')].map((e) => e.dataset.nodeId);
const open = (host, id) => host.querySelector(`.twm-tree-node[data-node-id="${id}"] > .twm-tree-node__children`).style.display !== 'none';

section('§1 folders, counts and the active file');
{
    const { host, tree } = mountTree();
    tree.setData({ files: FILES, folders: ['empty'] });
    check('folders', folderIds(host), ['folder:empty', 'folder:models', 'folder:models/old']);
    check('files in document order: a folder\'s subfolders first, then its files',
        ids(host), ['models/old/c.json', 'models/a.json', 'models/b.json', 'readme.md', 'zeta.json']);
    check('models counts every file under it',
        host.querySelector('[data-node-id="folder:models"] .twm-tree-node__count').textContent, '(3)');
    ok('a folder holding nothing active is closed', !open(host, 'folder:models/old'));
    tree.setActive('models/old/c.json');
    ok('the active file is selected', host.querySelector('.twm-tree-item.selected')?.dataset.itemId === 'models/old/c.json');
    ok('and its folders open', open(host, 'folder:models') && open(host, 'folder:models/old'));
    tree.destroy();
}

section('§1b pinFirst and compareFiles');
{
    const { host, tree } = mountTree({
        pinFirst: (f) => f.path === 'zeta.json',
        compareFiles: (a, b) => b.path.localeCompare(a.path),
    });
    tree.setData({ files: FILES });
    check('a pinned file leads, before the folders; the rest in the given order',
        ids(host), ['zeta.json', 'models/old/c.json', 'models/b.json', 'models/a.json', 'readme.md']);
    tree.destroy();
}

section('§2 the user\'s open and closed folders survive setData');
{
    const { host, tree } = mountTree();
    tree.setData({ files: FILES });
    click(host.querySelector('[data-node-id="folder:models"] > .twm-tree-node__header'));
    ok('opened by a click', open(host, 'folder:models'));
    tree.setData({ files: [...FILES, { path: 'new.json' }] });
    ok('still open after a redraw', open(host, 'folder:models'));
    click(host.querySelector('[data-node-id="folder:models"] > .twm-tree-node__header'));
    tree.setData({ files: FILES });
    ok('and closed again', !open(host, 'folder:models'));
    tree.destroy();
}

section('§3 clicks, and only the actions with a callback');
{
    const opened = [];
    const pinned = [];
    const { host, tree } = mountTree({ onOpen: (p) => opened.push(p), onPin: (p) => pinned.push(p) });
    tree.setData({ files: FILES });
    const row = host.querySelector('[data-item-id="readme.md"]');
    click(row);
    check('a click opens', opened, ['readme.md']);
    click(row);
    check('a quick second click pins', pinned, ['readme.md']);
    ok('no rename or delete button with no callback', !row.querySelector('.twm-tree-item__actions'));
    tree.destroy();

    const deleted = [];
    const b = mountTree({ onDelete: (p) => deleted.push(p), onRename: async () => false });
    b.tree.setData({ files: FILES });
    const actions = [...b.host.querySelector('[data-item-id="readme.md"]').querySelectorAll('.twm-tree-node__action-btn')].map((x) => x.dataset.action);
    check('buttons: rename and delete', actions, ['rename', 'delete']);
    b.host.querySelector('[data-item-id="readme.md"] [data-action="delete"]').click();
    check('delete button calls onDelete', deleted, ['readme.md']);
    b.tree.destroy();
}

section('§4 the filter');
{
    const { host, tree } = mountTree({ matchText: (f) => (f.path === 'zeta.json' ? 'secret wage' : '') });
    tree.setData({ files: FILES });
    tree.setFilter('c.json');
    check('only the match', ids(host), ['models/old/c.json']);
    ok('its folders are open', open(host, 'folder:models') && open(host, 'folder:models/old'));
    tree.setFilter('wage');
    check('matchText is searched', ids(host), ['zeta.json']);
    tree.setFilter('');
    check('clearing restores every file', ids(host).length, 5);
    ok('and the folders as the user had them', !open(host, 'folder:models'));
    tree.destroy();
}

section('§5 rename in place');
{
    const renames = [];
    const { host, tree } = mountTree({
        onRename: async (path, name) => { renames.push([path, name]); return name === 'refused.json' ? false : `models/${name}`; },
    });
    tree.setData({ files: FILES });
    tree.setActive('models/a.json');
    host.focus();
    key(host, 'F2');
    const input = host.querySelector('input.twm-node-edit-input');
    ok('F2 opens the name for editing', !!input);
    input.value = 'renamed';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick(10);
    check('the extension is kept', renames, [['models/a.json', 'renamed.json']]);
    tree.destroy();
}

section('§6 drag and drop');
{
    const moves = [];
    const { host, tree } = mountTree({ onMove: (a, b) => moves.push([a, b]) });
    tree.setData({ files: FILES, folders: ['empty'] });
    const drop = (el, data) => {
        const ev = new window.Event('drop', { bubbles: true, cancelable: true });
        ev.dataTransfer = { getData: () => data, types: ['application/x-twm-file-tree'] };
        el.dispatchEvent(ev);
    };
    drop(host.querySelector('[data-node-id="folder:empty"] > .twm-tree-node__header'), 'readme.md');
    check('a file into a folder', moves, [['readme.md', 'empty/readme.md']]);
    drop(host.querySelector('[data-node-id="folder:models"] > .twm-tree-node__header'), 'models');
    check('a folder onto itself moves nothing', moves.length, 1);
    ok('files and folders are draggable', host.querySelector('[data-item-id="readme.md"]').draggable);
    tree.destroy();
}

section('§6b a redraw keeps the overlay scrollbar; labels; the cursor follows a rename');
{
    const { createFileTree: make } = await import('../src/ui/components/file_tree.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const tree = make(host, { onRename: async (p, n) => `models/${n}` });   // scrollbar on
    tree.setData({ files: FILES });
    const bars = () => host.querySelectorAll('.overlay-scrollbar-v, .overlay-scrollbar').length;
    const before = bars();
    ok('the overlay scrollbar is installed', before > 0);
    tree.setData({ files: [...FILES, { path: 'more.json' }] });
    check('and is still there after a redraw', bars(), before);
    tree.setLabels({ rootLabel: 'Other project' });
    check('setLabels renames the root', host.querySelector('.twm-tree-category__label').textContent, 'Other project');
    tree.setActive('models/a.json');
    tree.setActive('models/b.json');
    ok('the cursor follows the active file', host.querySelector('.twm-file-tree__focus')?.dataset.itemId === 'models/b.json');
    tree.setData({ files: FILES.filter((f) => f.path !== 'models/b.json') });
    ok('a cursor on a row that is gone is dropped', !host.querySelector('.twm-file-tree__focus'));
    tree.expand('section:none', true);
    tree.destroy();
}

section('§7 badges and open marks without a redraw');
{
    const { host, tree } = mountTree();
    tree.setData({ files: FILES });
    const row = host.querySelector('[data-item-id="readme.md"]');
    tree.setBadge('readme.md', { text: '2', variant: 'fail' });
    ok('badge drawn', row.querySelector('.twm-tree-item__badge--fail')?.textContent === '2');
    tree.setBadge('readme.md', null);
    ok('badge cleared', !row.querySelector('.twm-tree-item__badge'));
    tree.setOpen(['readme.md']);
    ok('open mark', row.classList.contains('open') && host.querySelector('[data-item-id="readme.md"]') === row);
    tree.destroy();
}

section('§8 nav panel: deactivate and setBadge');
{
    const events = [];
    let badge = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const nav = mountNavPanel(host, {
        modes: [
            { id: 'a', icon: 'a', label: 'A', mount: (_el, ctx) => { badge = ctx.setBadge; return { activate: () => events.push('a+'), deactivate: () => events.push('a-') }; } },
            { id: 'b', icon: 'b', label: 'B', mount: () => ({ activate: () => events.push('b+'), deactivate: () => events.push('b-') }) },
        ],
    });
    await tick(5);
    await nav.select('b');
    check('a mode is deactivated when another is chosen', events, ['a+', 'a-', 'b+']);
    badge(3, 'warning');
    const strip = host.querySelector('[data-mode="a"] .twm-nav__badge');
    ok('count on the strip button', strip?.textContent === '3' && strip.classList.contains('twm-nav__badge--warning'));
    nav.setBadge('a', 0);
    ok('0 removes it', !host.querySelector('.twm-nav__badge'));
    nav.destroy();
}

section('§9 git pane');
{
    const calls = [];
    const adapter = {
        isRepo: () => ({ ok: true, isRepo: true }),
        status: () => ({ ok: true, branch: 'main', ahead: 0, behind: 0, hasUpstream: false, files: [
            { path: 'src/a.js', status: 'M', staged: false },
            { path: 'docs/b.md', status: 'A', staged: false },
        ] }),
        branches: () => ({ ok: true, branches: [] }),
    };
    let counts = [];
    const paneEl = document.createElement('div');
    document.body.appendChild(paneEl);
    const pane = createGitPane(paneEl, {
        getAdapter: () => { calls.push('adapter'); return adapter; },
        setBadge: (n) => counts.push(n),
        pollInterval: 0,
        scrollbar: false,
    });
    ok('nothing is built before the first visit', !pane.panel);
    pane.activate();
    await tick(30);
    ok('the panel exists after activate', !!pane.panel);
    ok('the change count is reported', counts.includes(2));
    const rows = () => [...paneEl.querySelectorAll('.twm-git-panel__file')].filter((r) => !r.hidden).map((r) => r.title);
    check('both rows', rows(), ['src/a.js', 'docs/b.md']);
    pane.filter('docs');
    check('filtered', rows(), ['docs/b.md']);
    pane.deactivate();
    pane.destroy();
    ok('destroy removes the pane', !paneEl.querySelector('.twm-git-pane'));
    check('a pane with no getAdapter is refused', (() => { try { createGitPane(paneEl, {}); return 'built'; } catch (e) { return e.constructor.name; } })(), 'TypeError');
}

section('§9b createBridgeGitAdapter');
{
    const { createBridgeGitAdapter, GIT_ADAPTER_METHODS } = await import('../src/git/bridge_adapter.js');
    const seen = [];
    const backend = { git_stash_pop: (p) => { seen.push(p); return { ok: true }; }, git_is_repo: (p) => { seen.push(p); return { ok: true, isRepo: true }; } };
    const adapter = createBridgeGitAdapter(() => backend, '/work/p');
    check('every contract method is there', Object.keys(adapter), [...GIT_ADAPTER_METHODS]);
    await adapter.stashPop({ a: 1 });
    await adapter.isRepo();
    check('names map to git_snake_case and carry the repository', seen, [{ repoPath: '/work/p', a: 1 }, { repoPath: '/work/p' }]);
    check('no repository, no adapter', createBridgeGitAdapter(backend, null), null);
}

section('§10 withTileBreadcrumb');
{
    const taxonomy = {
        topNavFor: () => ({ id: 'home', label: 'Home', icon: 'home' }),
        ancestors: () => [],
        labelOf: (_k, p) => p.label ?? 'x',
        meta: () => ({}),
    };
    const ctx = { taxonomy, wm: null, eventBus: null };
    let seen = null;
    const factory = withTileBreadcrumb('thing', (el, props, c) => {
        seen = c;
        el.textContent = 'content';
        return { destroy() { el.textContent = ''; } };
    });
    const host = document.createElement('div');
    const handle = factory(host, { id: 'one', label: 'One' }, ctx);
    ok('page shell with a crumb slot and a content slot',
        host.classList.contains('twm-page-shell')
        && host.querySelector('.twm-page-shell__breadcrumb')
        && host.querySelector('.twm-page-shell__content')?.textContent === 'content');
    ok('ctx gains setBreadcrumbProps, setTitle and setChromeActions',
        ['setBreadcrumbProps', 'setTitle', 'setChromeActions'].every((k) => typeof seen[k] === 'function'));
    seen.setBreadcrumbProps({ label: 'Two' });
    handle.destroy();
    ok('destroy removes the shell', !host.classList.contains('twm-page-shell') && !host.querySelector('.twm-page-shell__breadcrumb'));

    const inWindow = document.createElement('div');
    const h2 = factory(inWindow, { id: 'one' }, { ...ctx, windowId: 'w1' });
    ok('no breadcrumb in a window', !inWindow.querySelector('.twm-page-shell__breadcrumb'));
    h2.destroy();
}

done();
