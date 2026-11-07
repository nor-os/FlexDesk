# File tree

`createFileTree(host, options)` draws a project's files and folders as a tree, from the same pieces as `TreeView` (`createTreeCategory`, `createTreeNode`, `createTreeItem`). It is what an application's Files navigator mounts; with the git pane and the page shell below, two applications can share one navigator.

```js
import { createFileTree } from '@flexdesk/widgets';

const tree = createFileTree(paneEl, {
    rootLabel: 'My project',
    onOpen: (path) => open(path),
    onPin: (path) => pin(path),                          // a quick second click
    onRename: async (path, newName) => renamed(path, newName),   // the new path, or false
    onDelete: (path) => remove(path),
    onMove: (from, to) => move(from, to),                // a drop on a folder, or a folder renamed
    newItems: (folder) => [{ label: 'New folder', icon: 'create_new_folder', action: 'new-folder' }],
    onMenuAction: (action, { path, kind, x, y }) => run(action, path),
});
tree.setData({ folders: ['empty'], files: [{ path: 'models/a.json', icon: 'description' }] });
tree.setActive('models/a.json');
```

`host` is the scroll container: give it a height. It takes focus, so F2, Delete, Enter and the arrow keys act on the focused row.

## Data

`setData({ files, folders })` redraws the tree. Folders come from `folders` and from the files' paths, folders first, names in natural order. A file is `{ path, label?, icon?, subtitle?, title?, badge?, tag?, className?, canRename?, canDelete?, canDuplicate?, canMove? }`; the four `can…` flags default to true, and an action with no callback is never offered whatever the flag says. `tag` is `{ text, title?, variant? }` and draws a small label at the row's end (`variant: 'type'` is muted italic).

`compareFiles(a, b)` orders the files in a folder (natural order of paths by default); `pinFirst(file)` names files that lead their folder, before its subfolders (a project's descriptor).

A folder is open as the user left it across `setData`; one the user has not touched starts open when `initiallyExpanded(path, { count, hasActive, hasOpen, files })` says so (`files` is every file under the folder, for a rule of your own) (by default when it holds the active or an open file).

`setSections([{ id, label, icon?, items: [{ id, label, icon?, subtitle?, title? }], expanded?, onActivate?(item) }])` draws nodes before the root's folders that are not files (a project's references). Nothing moves in or out of one.

## The handle

| | |
|---|---|
| `setData(data)` / `setSections(list)` | redraw |
| `setActive(path, { reveal })` | highlight a file and open its folders, with no redraw |
| `setOpen(paths)` | the paths shown bold |
| `setBadge(path, badge)` / `setBadges(map)` | `{ text?, variant }` (no text is a dot); null clears |
| `setFilter(text)` | files whose label, path or `matchText(file)` contain it, in open folders |
| `startRename(path)` / `startFolderRename(path)` | edit a name in place |
| `setLabels({ rootLabel, emptyLabel })` | change the root's label (a project's name) and redraw, keeping open folders |
| `expand(path, open)` | open or close a folder (`section:<id>` for a section) |
| `refresh()` / `destroy()` | |

## Menus

A right-click menu on files, folders and the root is the default one, built from the callbacks you gave (`onOpen`, `onRename`, `onDuplicate`, `onMovePrompt`, `onDelete`, `onReveal`, `newItems`, …). `fileMenu(file, defaults)`, `folderMenu(path, defaults)` and `rootMenu(defaults)` return the menu to show, from the defaults. An item with an `action` of the tree's own (`open`, `rename`, `duplicate`, `move`, `delete`, `reveal`) runs the matching callback; any other action reaches `onMenuAction(action, { path, kind, x, y })`.

`onRenameRequest(path)` is for a host that renames through a form of its own: it wins over the in-place rename for the menu, F2 and the row's button.

# The git pane

`createGitPane(paneEl, { getAdapter, onOpenDiff, setBadge })` (`@flexdesk/git`) is the git panel as a navigator pane: it builds the panel on the first visit, points it at the adapter `getAdapter()` returns on every visit (return the same object while the repository is the same), polls only while the pane is shown, reports the change count through `setBadge`, filters the changed-file rows with `filter(query)` and gives the pane an overlay scrollbar. `createGitPanel` has `setFilter(query)` for the same filter on its own.

`createBridgeGitAdapter(api, repoPath)` is the adapter over a backend object (a pywebview `api`, given as the object or as a function returning it) whose methods are `git_<operation>` as deskkit's `GitBridge` names them; it returns null with no `repoPath`.

A `mountNavPanel` mode calls `deactivate()` when another mode is chosen, and its `mount` context has `setBadge(count, level?)`, a count on the mode's strip button; the handle has `setBadge(modeId, count, level?)`.

# The page shell

`withTileBreadcrumb(kind, factory, { inWindow })` (`@flexdesk/wm`) mounts a content factory under its tile breadcrumb in a `twm-page-shell`. The content's `ctx` gains `setBreadcrumbProps(patch)`, which repaints the crumb (an entity renamed while its tile shows it), and `setTitle` / `setChromeActions` that do nothing where the host has no tile. Its `destroy()` also removes the breadcrumb. In a managed window there is no crumb unless `inWindow: 'crumb'`.
