/**
 * file_tree.js — a project's files and folders as a tree.
 *
 *     const tree = createFileTree(el, {
 *         rootLabel: 'My project',
 *         onOpen: (path) => open(path),
 *         onRename: async (path, newName) => renamed(path, newName),   // the new path, or false
 *         onDelete: (path) => remove(path),
 *         onMove: (from, to) => move(from, to),
 *     });
 *     tree.setData({ folders: ['models/old'], files: [{ path: 'models/a.json', icon: 'description' }] });
 *     tree.setActive('models/a.json');
 *
 * The tree is built from TreeView's pieces (createTreeCategory, createTreeNode,
 * createTreeItem), so it looks like every other FlexDesk tree, and adds what a
 * file tree needs on top of them:
 *
 *   - folders from `folders` and from the files' paths, folders first, names in
 *     natural order; a folder's count is every file under it
 *   - a folder opens when the user opens it, and stays as they left it across
 *     `setData`; one holding the active or an open file starts open
 *   - the active file is highlighted, and its folders open; open files are
 *     bold; a file can carry a badge, a status dot or a tag
 *   - a double-click on a file pins it (`onPin`), found by timing, because a
 *     host often redraws the tree between the two clicks
 *   - rename in place (F2, the row's button, the menu) through
 *     attachInlineRenamer, for a file and for a folder
 *   - a row's buttons, a right-click menu on files, folders and the root, F2,
 *     Delete, Enter and the arrow keys on the focused tree
 *   - drag a file or folder onto a folder to move it
 *   - `setFilter(query)`: files whose name, path or `matchText` contain it, and the
 *     folders holding one, all open
 *   - fixed sections after the root's folders (a project's references) that are
 *     not files: nothing moves in or out of them
 *   - the host's scroll position survives a redraw; an overlay scrollbar
 *
 * Every action is an option. One with no callback is not offered: no `onDelete`,
 * no Delete in the menu and no delete button. A menu is the default one, or what
 * `fileMenu` / `folderMenu` / `rootMenu` return from it, and an item they add
 * with an `action` of their own reaches `onMenuAction`.
 *
 * `host` is the scroll container; give it a height (a flex child, or
 * `height: 100%`).
 */

import { installOverlayScrollbar } from '../utils/overlay_scrollbar.js';
import { attachInlineRenamer } from './inline_renamer.js';
import { showContextMenu } from './context_menu.js';
import { createTreeCategory, createTreeItem, createTreeNode } from './tree_view.js';

const DRAG_TYPE = 'application/x-twm-file-tree';
const FOLDER_PREFIX = 'folder:';
const SECTION_PREFIX = 'section:';
const DOUBLE_CLICK_MS = 400;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const cssEscape = (s) => String(s).replace(/["\\]/g, '\\$&').replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
const baseName = (path) => path.split('/').pop();
const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/**
 * @param {HTMLElement} host
 * @param {Object} [options]
 * @param {string|null} [options.rootLabel='Project'] - The root category's label; `null` draws the tree with no root.
 * @param {string} [options.rootIcon='account_tree']
 * @param {string} [options.folderIcon='folder']
 * @param {string} [options.fileIcon='description'] - For a file with no `icon`.
 * @param {string} [options.emptyLabel='No files'] - Shown while there are none.
 * @param {(file: Object) => string} [options.labelOf] - A file's label; its file name by default.
 * @param {(file: Object) => string} [options.matchText] - More text the filter looks in.
 * @param {(a: Object, b: Object) => number} [options.compareFiles] - Order of files in a folder (natural by path).
 * @param {(file: Object) => boolean} [options.pinFirst] - Files it names lead their folder, before its subfolders (a project's descriptor).
 * @param {(folderPath: string, facts: {count: number, hasActive: boolean, hasOpen: boolean, files: Object[]}) => boolean} [options.initiallyExpanded]
 * @param {(path: string, event: Event) => void} [options.onOpen] - A file is clicked.
 * @param {(path: string) => void} [options.onPin] - A file is double-clicked.
 * @param {(path: string, newName: string) => (string|false|Promise<string|false>)} [options.onRename]
 *   A file renamed in place, to `newName` (its extension kept when `keepExtension`); returns the new path, or false to refuse.
 * @param {(path: string) => void} [options.onRenameRequest] - A rename the host does itself (a form); wins over `onRename` for the menu, F2 and the button.
 * @param {(path: string) => void} [options.onDelete]
 * @param {(folderPath: string) => void} [options.onDeleteFolder]
 * @param {(path: string) => void} [options.onDuplicate]
 * @param {(path: string) => void} [options.onReveal] - A file's or folder's "Reveal in Explorer".
 * @param {(from: string, to: string) => void} [options.onMove] - A file or folder dragged into a folder, or a folder renamed.
 * @param {(path: string) => void} [options.onMovePrompt] - "Move to…" for a file or folder.
 * @param {(folderPath: string) => Array<Object>} [options.newItems] - The "New" menu entries for a folder ('' is the root); the root's "+" button and every folder's menu offer them.
 * @param {(file: Object, defaults: Array<Object>) => Array<Object>} [options.fileMenu]
 * @param {(folderPath: string, defaults: Array<Object>) => Array<Object>} [options.folderMenu]
 * @param {(defaults: Array<Object>) => Array<Object>} [options.rootMenu]
 * @param {(action: string, target: {path: string, kind: 'file'|'folder'|'root', x: number, y: number}) => void} [options.onMenuAction]
 *   A menu item that is not one of the tree's own.
 * @param {RegExp|((file: Object) => RegExp)} [options.namePattern=/^[\w][\w.-]*$/] - What a typed file name (without its extension) may be.
 * @param {(file: Object, newName: string, newPath: string) => string} [options.labelAfterRename] - The label a file shows once renamed in place, until the host redraws; its file name by default (or the file's own `label`).
 * @param {boolean} [options.keepExtension=true] - A file renamed in place keeps its extension, typed or not.
 * @param {boolean} [options.scrollbar=true]
 */
export function createFileTree(host, options = {}) {
    let { rootLabel = 'Project', emptyLabel = 'No files' } = options;
    const {
        rootIcon = 'account_tree',
        folderIcon = 'folder',
        fileIcon = 'description',
        labelOf = (file) => baseName(file.path),
        matchText = () => '',
        compareFiles = (a, b) => collator.compare(a.path, b.path),
        initiallyExpanded = (_path, facts) => facts.hasActive || facts.hasOpen,
        namePattern = /^[\w][\w.-]*$/,
        keepExtension = true,
    } = options;

    host.classList.add('twm-tree-view', 'twm-file-tree');
    host.tabIndex = 0;

    let files = [];
    let folders = [];
    let sections = [];
    let activePath = null;
    let openPaths = new Set();
    let badges = new Map();
    let query = '';
    let renamer = null;          // { label, renamer }
    let destroyed = false;
    let focusedId = null;
    let lastClick = { id: null, at: 0 };
    const folderOpen = new Map(); // folder path (or `section:<id>`) -> the user's choice
    const fileByPath = new Map();

    // What the tree draws goes in one child, so a redraw leaves the overlay
    // scrollbar (a sibling, appended to the host) in place.
    const content = document.createElement('div');
    content.className = 'twm-file-tree__content';
    host.appendChild(content);

    const overlay = options.scrollbar === false
        ? null
        : installOverlayScrollbar(host, { orientation: 'vertical', watchSubtree: true });

    // ── data → a folder tree ────────────────────────────────────────────

    const buildTree = () => {
        const root = { folders: new Map(), files: [] };
        const at = (path) => {
            let node = root;
            for (const part of path ? path.split('/') : []) {
                if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [] });
                node = node.folders.get(part);
            }
            return node;
        };
        for (const path of folders) at(path);
        for (const file of files) at(parentOf(file.path)).files.push(file);
        return root;
    };

    const matches = (file) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return labelOf(file).toLowerCase().includes(q)
            || file.path.toLowerCase().includes(q)
            || String(matchText(file) ?? '').toLowerCase().includes(q);
    };

    /** What a folder holds, filtered files only. */
    const facts = (node) => {
        const here = node.files.filter(matches);
        let hasActive = here.some((f) => f.path === activePath);
        let hasOpen = here.some((f) => openPaths.has(f.path));
        const all = [...here];
        for (const child of node.folders.values()) {
            const f = facts(child);
            all.push(...f.files);
            hasActive ||= f.hasActive;
            hasOpen ||= f.hasOpen;
        }
        return { count: all.length, hasActive, hasOpen, files: all };
    };

    // ── menus ───────────────────────────────────────────────────────────

    const canRename = (file) => file.canRename !== false && !!(options.onRename || options.onRenameRequest);
    const canDelete = (file) => file.canDelete !== false && !!options.onDelete;
    const canDuplicate = (file) => file.canDuplicate !== false && !!options.onDuplicate;
    const canMove = (file) => file.canMove !== false && !!options.onMove;

    const defaultFileMenu = (file) => [
        ...(options.onOpen ? [{ label: 'Open', icon: 'open_in_new', action: 'open' }, { separator: true }] : []),
        ...(options.onRename || options.onRenameRequest ? [{ label: 'Rename', icon: 'edit', action: 'rename', disabled: !canRename(file) }] : []),
        ...(options.onDuplicate ? [{ label: 'Duplicate', icon: 'content_copy', action: 'duplicate', disabled: !canDuplicate(file) }] : []),
        ...(options.onMovePrompt ? [{ label: 'Move to…', icon: 'drive_file_move', action: 'move', disabled: !canMove(file) }] : []),
        ...(options.onDelete ? [{ label: 'Delete', icon: 'delete', action: 'delete', disabled: !canDelete(file), danger: true }] : []),
        ...(options.onReveal ? [{ separator: true }, { label: 'Reveal in Explorer', icon: 'folder_open', action: 'reveal' }] : []),
    ];

    const newMenu = (folderPath) => (options.newItems ? options.newItems(folderPath) : []);

    const defaultFolderMenu = (folderPath) => {
        const news = newMenu(folderPath);
        const own = [
            ...(options.onMove ? [{ label: 'Rename', icon: 'edit', action: 'rename' }] : []),
            ...(options.onMovePrompt ? [{ label: 'Move to…', icon: 'drive_file_move', action: 'move' }] : []),
            ...(options.onDeleteFolder ? [{ label: 'Delete', icon: 'delete', action: 'delete', danger: true }] : []),
            ...(options.onReveal ? [{ separator: true }, { label: 'Reveal in Explorer', icon: 'folder_open', action: 'reveal' }] : []),
        ];
        return [...news, ...(news.length && own.length ? [{ separator: true }] : []), ...own];
    };

    const cleanMenu = (items) => items.filter((it, i, all) => !it.separator
        || (i > 0 && !all[i - 1].separator && i < all.length - 1));

    const openMenu = (x, y, items, handle) => {
        const clean = cleanMenu(items ?? []);
        if (clean.length === 0) return;
        showContextMenu(x, y, clean, (action) => handle(action));
    };

    const fileMenuAt = (x, y, file) => {
        const defaults = defaultFileMenu(file);
        openMenu(x, y, options.fileMenu ? options.fileMenu(file, defaults) : defaults, (action) => {
            switch (action) {
                case 'open': options.onOpen?.(file.path, null); break;
                case 'rename': startRename(file.path); break;
                case 'duplicate': options.onDuplicate?.(file.path); break;
                case 'move': options.onMovePrompt?.(file.path); break;
                case 'delete': options.onDelete?.(file.path); break;
                case 'reveal': options.onReveal?.(file.path); break;
                default: options.onMenuAction?.(action, { path: file.path, kind: 'file', x, y });
            }
        });
    };

    const folderMenuAt = (x, y, folderPath) => {
        const defaults = defaultFolderMenu(folderPath);
        openMenu(x, y, options.folderMenu ? options.folderMenu(folderPath, defaults) : defaults, (action) => {
            switch (action) {
                case 'rename': startFolderRename(folderPath); break;
                case 'move': options.onMovePrompt?.(folderPath); break;
                case 'delete': options.onDeleteFolder?.(folderPath); break;
                case 'reveal': options.onReveal?.(folderPath); break;
                default:
                    folderOpen.set(folderPath, true);
                    options.onMenuAction?.(action, { path: folderPath, kind: 'folder', x, y });
            }
        });
    };

    const rootMenuAt = (x, y) => {
        const defaults = newMenu('');
        openMenu(x, y, options.rootMenu ? options.rootMenu(defaults) : defaults, (action) => {
            options.onMenuAction?.(action, { path: '', kind: 'root', x, y });
        });
    };

    // ── drag and drop ───────────────────────────────────────────────────

    const makeDraggable = (el, path) => {
        el.draggable = true;
        el.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData(DRAG_TYPE, path);
        });
    };

    const makeDropTarget = (el, folderPath) => {
        el.addEventListener('dragover', (e) => {
            if (!e.dataTransfer?.types?.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('twm-file-tree__drop-target');
        });
        el.addEventListener('dragleave', () => el.classList.remove('twm-file-tree__drop-target'));
        el.addEventListener('drop', (e) => {
            const source = e.dataTransfer?.getData(DRAG_TYPE);
            el.classList.remove('twm-file-tree__drop-target');
            if (!source) return;
            e.preventDefault();
            e.stopPropagation();
            const target = folderPath ? `${folderPath}/${baseName(source)}` : baseName(source);
            // Not into itself, and not where it already is.
            if (target === source || `${folderPath}/`.startsWith(`${source}/`)) return;
            options.onMove?.(source, target);
        });
    };

    // ── rendering ───────────────────────────────────────────────────────

    const renderFile = (file) => {
        const rename = canRename(file);
        const remove = canDelete(file);
        const actions = {};
        if (rename) actions.rename = { icon: 'edit', title: 'Rename', onClick: () => startRename(file.path) };
        if (remove) actions.delete = { icon: 'delete', title: 'Delete', onClick: () => options.onDelete(file.path) };
        const badge = badges.get(file.path) ?? file.badge ?? null;
        const item = createTreeItem({
            id: file.path,
            label: file.label ?? labelOf(file),
            icon: file.icon ?? fileIcon,
            selected: file.path === activePath,
            badge,
            subtitle: file.subtitle ?? null,
            actions: Object.keys(actions).length ? actions : null,
        });
        if (openPaths.has(file.path)) item.classList.add('open');
        if (file.className) item.classList.add(...String(file.className).split(/\s+/).filter(Boolean));
        if (file.tag) {
            const tag = document.createElement('span');
            tag.className = `twm-tree-item__tag${file.tag.variant ? ` twm-tree-item__tag--${file.tag.variant}` : ''}`;
            tag.textContent = file.tag.text;
            if (file.tag.title) tag.title = file.tag.title;
            item.insertBefore(tag, item.querySelector('.twm-tree-item__actions'));
        }
        if (file.title) item.title = file.title;
        if (options.onMove && canMove(file)) makeDraggable(item, file.path);
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileMenuAt(e.clientX, e.clientY, file);
        });
        return item;
    };

    const renderFolder = (parentEl, node, path) => {
        // Files `pinFirst` names lead their folder, ahead of its subfolders.
        const pinned = options.pinFirst ? node.files.filter((f) => options.pinFirst(f) && matches(f)).sort(compareFiles) : [];
        for (const file of pinned) parentEl.appendChild(renderFile(file));
        const names = [...node.folders.keys()].sort(collator.compare);
        for (const name of names) {
            const child = node.folders.get(name);
            const folderPath = path ? `${path}/${name}` : name;
            const f = facts(child);
            if (query && f.count === 0) continue;
            const expanded = query ? true : (folderOpen.get(folderPath) ?? initiallyExpanded(folderPath, f));
            const folderEl = createTreeNode({
                id: `${FOLDER_PREFIX}${folderPath}`,
                label: name,
                icon: folderIcon,
                count: f.count,
                expanded,
            });
            const header = folderEl.querySelector(':scope > .twm-tree-node__header');
            header.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                folderMenuAt(e.clientX, e.clientY, folderPath);
            });
            if (options.onMove) makeDraggable(header, folderPath);
            if (options.onMove) makeDropTarget(header, folderPath);
            renderFolder(folderEl.querySelector(':scope > .twm-tree-node__children'), child, folderPath);
            parentEl.appendChild(folderEl);
        }
        for (const file of [...node.files].filter((f) => matches(f) && !pinned.includes(f)).sort(compareFiles)) {
            parentEl.appendChild(renderFile(file));
        }
    };

    const renderSection = (section) => {
        const key = `${SECTION_PREFIX}${section.id}`;
        const items = (section.items ?? []).filter((it) => !query
            || `${it.label} ${it.subtitle ?? ''}`.toLowerCase().includes(query.toLowerCase()));
        if (query && items.length === 0) return null;
        const node = createTreeNode({
            id: key,
            label: section.label,
            icon: section.icon ?? 'link',
            count: items.length,
            expanded: query ? true : (folderOpen.get(key) ?? section.expanded ?? false),
            readonly: true,
        });
        const children = node.querySelector(':scope > .twm-tree-node__children');
        for (const it of items) {
            const el = createTreeItem({
                id: `${SECTION_PREFIX}${section.id}/${it.id}`,
                label: it.label,
                icon: it.icon ?? 'menu_book',
                readonly: true,
                subtitle: it.subtitle ?? null,
            });
            el.title = it.title ?? it.label;
            // Sections hold no files: a click opens nothing unless the host says so.
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                section.onActivate?.(it);
            });
            el.addEventListener('contextmenu', (e) => e.preventDefault());
            children.appendChild(el);
        }
        return node;
    };

    const render = () => {
        if (destroyed) return;
        endRename();
        const scrollTop = host.scrollTop;
        content.replaceChildren();
        const tree = buildTree();
        const total = files.length;
        let body = content;
        if (rootLabel !== null) {
            const category = createTreeCategory({
                id: 'root',
                label: rootLabel,
                icon: rootIcon,
                count: total,
                expanded: true,
            });
            const header = category.querySelector('.twm-collapsible-header');
            if (options.newItems) {
                const add = document.createElement('button');
                add.type = 'button';
                add.className = 'twm-tree-node__action-btn';
                add.title = 'New…';
                add.innerHTML = '<span class="material-symbols-outlined">add</span>';
                add.addEventListener('click', (e) => {
                    e.stopPropagation();
                    rootMenuAt(e.clientX, e.clientY);
                });
                header.appendChild(add);
            }
            header.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                rootMenuAt(e.clientX, e.clientY);
            });
            if (options.onMove) makeDropTarget(header, '');
            content.appendChild(category);
            body = category.querySelector('.twm-collapsible-content');
        }
        for (const section of sections) {
            const el = renderSection(section);
            if (el) body.appendChild(el);
        }
        renderFolder(body, tree, '');
        if (total === 0 && sections.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'twm-file-tree__empty';
            empty.textContent = emptyLabel;
            body.appendChild(empty);
        }
        // A cursor on a row that is gone (renamed, deleted, filtered out) is dropped.
        if (focusedId && rowOf(focusedId)) markFocus(focusedId); else focusedId = null;
        host.scrollTop = scrollTop;
    };

    // ── clicks ──────────────────────────────────────────────────────────

    host.addEventListener('click', (e) => {
        const header = e.target.closest('.twm-tree-node__header');
        if (header && host.contains(header)) {
            const node = header.closest('.twm-tree-node');
            const id = node?.dataset.nodeId ?? '';
            const key = id.startsWith(FOLDER_PREFIX) ? id.slice(FOLDER_PREFIX.length) : id;
            const children = node?.querySelector(':scope > .twm-tree-node__children');
            if (!children) return;
            const open = children.style.display === 'none';
            children.style.display = open ? 'block' : 'none';
            const arrow = header.querySelector('.twm-tree-node__toggle .material-symbols-outlined');
            if (arrow) arrow.textContent = open ? 'expand_more' : 'chevron_right';
            if (!query) folderOpen.set(key, open);
            host.focus({ preventScroll: true });
            markFocus(id);
            return;
        }
        const category = e.target.closest('.twm-collapsible-header');
        if (category && host.contains(category)) {
            const box = category.closest('.twm-tree-category');
            const content = box?.querySelector(':scope > .twm-collapsible-content');
            const arrow = category.querySelector('.twm-collapsible-arrow');
            const open = !content?.classList.contains('visible');
            content?.classList.toggle('visible', open);
            arrow?.classList.toggle('collapsed', !open);
            return;
        }
        const item = e.target.closest('.twm-tree-item');
        if (!item || !host.contains(item) || item.classList.contains('readonly')) return;
        const id = item.dataset.itemId;
        host.focus({ preventScroll: true });
        const now = performance.now();
        if (id === lastClick.id && now - lastClick.at < DOUBLE_CLICK_MS) {
            lastClick = { id: null, at: 0 };
            options.onPin?.(id);
        } else {
            lastClick = { id, at: now };
            markActiveDom(id);
            options.onOpen?.(id, e);
        }
        markFocus(id);
    });

    // ── keyboard ────────────────────────────────────────────────────────

    const rows = () => [...host.querySelectorAll('.twm-tree-item:not(.readonly), .twm-tree-node:not(.readonly) > .twm-tree-node__header')]
        .filter((el) => !el.closest('.twm-tree-node__children[style*="display: none"]'));
    const idOf = (el) => el.dataset.itemId ?? el.parentElement?.dataset.nodeId ?? null;

    /** The row element of a file (its id is its path) or a folder (`folder:<path>`), or null. */
    function rowOf(id) {
        const el = [...host.querySelectorAll('.twm-tree-item, .twm-tree-node')]
            .find((n) => (n.dataset.itemId ?? n.dataset.nodeId) === id);
        return el?.classList.contains('twm-tree-node') ? el.querySelector(':scope > .twm-tree-node__header') : (el ?? null);
    }

    function markFocus(id) {
        focusedId = id;
        host.querySelectorAll('.twm-file-tree__focus').forEach((el) => el.classList.remove('twm-file-tree__focus'));
        if (!id) return;
        const row = rowOf(id);
        row?.classList.add('twm-file-tree__focus');
        row?.scrollIntoView?.({ block: 'nearest' });
    };

    host.addEventListener('keydown', (e) => {
        if (renamer || e.target !== host) return;
        const current = focusedId ?? activePath;
        const isFolder = typeof current === 'string' && current.startsWith(FOLDER_PREFIX);
        switch (e.key) {
            case 'F2':
                if (!current) return;
                e.preventDefault();
                if (isFolder) startFolderRename(current.slice(FOLDER_PREFIX.length));
                else startRename(current);
                return;
            case 'Delete': {
                const file = fileByPath.get(current);
                if (file && canDelete(file)) { e.preventDefault(); options.onDelete(file.path); }
                else if (isFolder && options.onDeleteFolder) { e.preventDefault(); options.onDeleteFolder(current.slice(FOLDER_PREFIX.length)); }
                return;
            }
            case 'Enter':
                if (fileByPath.has(current)) { e.preventDefault(); options.onOpen?.(current, e); }
                else if (isFolder) { e.preventDefault(); toggleFolderDom(current, undefined); }
                return;
            case 'ArrowDown':
            case 'ArrowUp': {
                e.preventDefault();
                const ids = rows().map(idOf);
                if (!ids.length) return;
                const at = ids.indexOf(current);
                const next = e.key === 'ArrowDown' ? Math.min(ids.length - 1, at + 1) : Math.max(0, at <= 0 ? 0 : at - 1);
                markFocus(ids[next]);
                return;
            }
            case 'ArrowRight':
            case 'ArrowLeft':
                if (isFolder) { e.preventDefault(); toggleFolderDom(current, e.key === 'ArrowRight'); }
                return;
            default:
        }
    });

    const toggleFolderDom = (id, force) => {
        const node = [...host.querySelectorAll('.twm-tree-node')].find((n) => n.dataset.nodeId === id);
        const children = node?.querySelector(':scope > .twm-tree-node__children');
        if (!children) return;
        const open = force ?? children.style.display === 'none';
        children.style.display = open ? 'block' : 'none';
        const arrow = node.querySelector(':scope > .twm-tree-node__header .twm-tree-node__toggle .material-symbols-outlined');
        if (arrow) arrow.textContent = open ? 'expand_more' : 'chevron_right';
        if (!query) folderOpen.set(id.slice(FOLDER_PREFIX.length), open);
    };

    // ── selection ───────────────────────────────────────────────────────

    const itemEl = (path) => host.querySelector(`.twm-tree-item[data-item-id="${cssEscape(path)}"]`);

    const markActiveDom = (path) => {
        host.querySelectorAll('.twm-tree-item.selected').forEach((el) => el.classList.remove('selected'));
        if (path) itemEl(path)?.classList.add('selected');
    };

    const expandParents = (path) => {
        for (let dir = parentOf(path); dir; dir = parentOf(dir)) {
            folderOpen.set(dir, true);
            toggleFolderDom(`${FOLDER_PREFIX}${dir}`, true);
        }
    };

    // ── rename in place ─────────────────────────────────────────────────

    function endRename(which = renamer?.renamer) {
        if (!which || which !== renamer?.renamer) return;
        const r = renamer;
        renamer = null;
        r.renamer.destroy();
    }

    function startRename(path) {
        const file = fileByPath.get(path);
        if (!file || !canRename(file)) return;
        if (options.onRenameRequest) { options.onRenameRequest(path); return; }
        if (renamer?.label.isConnected) return;
        endRename();
        const label = itemEl(path)?.querySelector('.twm-tree-item__label');
        if (!label) return;
        const oldName = baseName(path);
        const dot = path.lastIndexOf('.');
        const suffix = keepExtension && dot > path.lastIndexOf('/') ? path.slice(dot) : '';
        const pattern = typeof namePattern === 'function' ? namePattern(file) : namePattern;
        let committed = null;
        const commit = async (typed) => {
            const stem = suffix && typed.endsWith(suffix) ? typed.slice(0, -suffix.length) : typed;
            const newName = `${stem}${suffix}`;
            if (!stem || newName === oldName || !pattern.test(stem)) return { success: false };
            const newPath = await options.onRename(path, newName);
            if (!newPath) return { success: false };
            return { success: true, newValue: options.labelAfterRename?.(file, newName, newPath) ?? file.label ?? newName };
        };
        const r = attachInlineRenamer({
            label,
            transformInput: (raw) => raw.trim(),
            // Keys typed into the name stay in the field.
            onStart: () => label.querySelector('input')?.addEventListener('keydown', (e) => e.stopPropagation()),
            // Enter, and the blur that follows when the renamed tree is redrawn, commit once.
            onCommit: (typed) => (committed ??= commit(typed)),
            onFinish: () => endRename(r),
            onCancel: () => endRename(r),
        });
        renamer = { label, renamer: r };
        r.start();
    }

    function startFolderRename(folderPath) {
        if (!options.onMove) return;
        if (renamer?.label.isConnected) return;
        endRename();
        const node = [...host.querySelectorAll('.twm-tree-node')].find((n) => n.dataset.nodeId === `${FOLDER_PREFIX}${folderPath}`);
        const label = node?.querySelector(':scope > .twm-tree-node__header .twm-tree-node__label');
        if (!label) return;
        const oldName = baseName(folderPath);
        const parent = folderPath.slice(0, folderPath.length - oldName.length);
        let committed = null;
        const commit = async (typed) => {
            if (!typed || typed === oldName || !/^[\w][\w. -]*$/.test(typed)) return { success: false };
            await options.onMove(folderPath, `${parent}${typed}`);
            return { success: true, newValue: typed };
        };
        const r = attachInlineRenamer({
            label,
            transformInput: (raw) => raw.trim(),
            onStart: () => label.querySelector('input')?.addEventListener('keydown', (e) => e.stopPropagation()),
            onCommit: (typed) => (committed ??= commit(typed)),
            onFinish: () => endRename(r),
            onCancel: () => endRename(r),
        });
        renamer = { label, renamer: r };
        r.start();
    }

    // ── the handle ──────────────────────────────────────────────────────

    const index = () => {
        fileByPath.clear();
        for (const f of files) fileByPath.set(f.path, f);
    };

    const setBadgeDom = (path, badge) => {
        const item = itemEl(path);
        if (!item) return;
        item.querySelector('.twm-tree-item__badge, .twm-tree-item__status-dot')?.remove();
        if (!badge) return;
        const variant = badge.variant || 'muted';
        const el = document.createElement('span');
        if (badge.text) {
            el.className = `twm-tree-item__badge twm-tree-item__badge--${variant}`;
            el.textContent = badge.text;
        } else {
            el.className = `twm-tree-item__status-dot twm-tree-item__status-dot--${variant}`;
        }
        item.insertBefore(el, item.querySelector('.twm-tree-item__actions'));
    };

    return {
        el: host,
        /** The files and folders to show; the tree redraws, keeping what the user opened. */
        setData(data = {}) {
            files = [...(data.files ?? [])];
            folders = [...(data.folders ?? [])];
            index();
            render();
        },
        /** Sections after the root's folders that are not files: `[{ id, label, icon?, items: [{id, label, icon?, subtitle?, title?}], expanded?, onActivate?(item) }]`. */
        setSections(next) {
            sections = [...(next ?? [])];
            render();
        },
        /** Highlight a file (null clears it) and open its folders, without a redraw. */
        setActive(path, { reveal = true } = {}) {
            activePath = path ?? null;
            if (activePath && reveal) expandParents(activePath);
            markActiveDom(activePath);
            // The keyboard cursor follows the active file (F2 after a rename acts on the new path).
            if (activePath) markFocus(activePath); else if (focusedId && !rowOf(focusedId)) focusedId = null;
            if (activePath && reveal) itemEl(activePath)?.scrollIntoView?.({ block: 'nearest' });
        },
        /** The paths shown bold as open. */
        setOpen(paths) {
            openPaths = new Set(paths ?? []);
            host.querySelectorAll('.twm-tree-item.open').forEach((el) => el.classList.remove('open'));
            for (const p of openPaths) itemEl(p)?.classList.add('open');
        },
        /** A badge (`{text?, variant}`, no text is a dot) on a file; null clears it. */
        setBadge(path, badge) {
            if (badge) badges.set(path, badge); else badges.delete(path);
            setBadgeDom(path, badge);
        },
        setBadges(map) {
            for (const [path, badge] of map) this.setBadge(path, badge);
        },
        /** Show only files matching `text`, in folders opened to them. */
        setFilter(text) {
            const next = String(text ?? '').trim();
            if (next === query) return;
            query = next;
            render();
        },
        /** Edit a file's name in place (after the tree has drawn it). */
        startRename(path) {
            requestAnimationFrame(() => startRename(path));
        },
        /** Edit a folder's name in place, opening it first. */
        startFolderRename(path) {
            folderOpen.set(path, true);
            render();
            startFolderRename(path);
        },
        /** Change the root's label and the empty-state text (a project's name) and redraw, keeping the open folders. */
        setLabels(labels = {}) {
            if ('rootLabel' in labels) rootLabel = labels.rootLabel;
            if ('emptyLabel' in labels) emptyLabel = labels.emptyLabel;
            render();
        },
        /** Open or close a folder. */
        expand(path, open = true) {
            folderOpen.set(path, open);
            toggleFolderDom(path.startsWith(SECTION_PREFIX) ? path : `${FOLDER_PREFIX}${path}`, open);
        },
        refresh: render,
        destroy() {
            destroyed = true;
            endRename();
            overlay?.cleanup?.();
            content.remove();
            host.classList.remove('twm-tree-view', 'twm-file-tree');
        },
    };
}
