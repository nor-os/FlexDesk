/**
 * git_panel.js — a source-control panel: the branch and what can be done with
 * it, a commit box, the changed files, and the commit graph.
 *
 *     const panel = createGitPanel(el, { adapter, onCountChange: (n) => setBadge(n) });
 *     panel.setAdapter(otherRepository);   // or null: nothing to show
 *     panel.stopPolling();                 // while its tab is hidden
 *     panel.startPolling();
 *     panel.destroy();
 *
 * Every repository operation is a method of `adapter`, whose methods and
 * payloads are the written contract in docs/components/git.md: `isRepo` and
 * `status` are required, and an action whose method the adapter lacks is not
 * offered. The panel knows nothing of where the repository is or how the
 * adapter reaches it.
 *
 * The panel's own elements are built once and updated in place, so a status
 * change never touches what somebody is typing into the commit box. A failed
 * operation is an error toast carrying the backend's words, and the panel reads
 * the repository again either way. Nothing is stored on the DOM.
 *
 * An operation belongs to the repository it started on: whatever waits on a
 * dialog or on an earlier step holds that adapter, not the panel's current one,
 * so `setAdapter` can never send the rest of an operation to another repository.
 */

import { ActionDropdown } from '../ui/components/action_dropdown.js';
import { showConfirmDialog, showSelectDialog } from '../ui/components/confirm_dialog.js';
import { showContextMenu } from '../ui/components/context_menu.js';
import { toastInfo } from '../ui/components/toast.js';
import { createGitGraph } from './git_graph.js';
import { askFor, callGit, openDiffHandler } from './git_ops.js';

const DEFAULT_POLL_MS = 3000;
const COMMIT_BOX_MAX_PX = 80;

function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
}

function icon(name) {
    const span = el('span', 'material-symbols-outlined', name);
    span.setAttribute('aria-hidden', 'true');
    return span;
}

function iconButton(className, iconName, label, onClick) {
    const b = el('button', className);
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.appendChild(icon(iconName));
    b.addEventListener('click', onClick);
    return b;
}

/** ActionDropdown draws a label as markup; a branch name is text. */
const escapeLabel = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A path's last segment, and the folder before it. */
function splitPath(path) {
    const parts = String(path).replace(/\\/g, '/').split('/').filter(Boolean);
    return { name: parts[parts.length - 1] ?? String(path), dir: parts.slice(0, -1).join('/') };
}

function requireMethods(adapter) {
    const missing = ['isRepo', 'status'].filter((m) => typeof adapter[m] !== 'function');
    if (missing.length > 0) throw new TypeError(`createGitPanel: the adapter has no ${missing.join(' or ')} method`);
}

/**
 * @param {HTMLElement} host
 * @param {Object} [options]
 * @param {Object|null} [options.adapter] - The git adapter; null shows `emptyLabel`.
 * @param {(file: {path: string, status: string, staged?: boolean, renamedFrom?: string, ref?: string}) => void} [options.onOpenDiff]
 *   Opens a file's diff. Without it, a diff window when the adapter has `diffFile`.
 * @param {(count: number) => void} [options.onCountChange] - Told how many files have changes, whenever that is read.
 * @param {number} [options.pollInterval=3000] - Milliseconds between status reads; 0 reads only on `refresh()`.
 * @param {string} [options.emptyLabel='No repository'] - Shown while there is no adapter.
 * @param {boolean} [options.changesExpanded=true]
 * @param {boolean} [options.graphExpanded=false]
 * @param {boolean} [options.showRemoteRefs=false] - As for createGitGraph.
 * @returns {{ el: HTMLElement, refresh(): Promise<void>, setAdapter(adapter: Object|null): void,
 *   startPolling(): void, stopPolling(): void, destroy(): void }}
 */
export function createGitPanel(host, options = {}) {
    const {
        onCountChange = null,
        pollInterval = DEFAULT_POLL_MS,
        emptyLabel = 'No repository',
        showRemoteRefs = false,
    } = options;

    let adapter = options.adapter ?? null;
    if (adapter) requireMethods(adapter);
    const openDiff = openDiffHandler(() => adapter, options.onOpenDiff);

    let isRepo = false;
    let status = null;
    let statusJson = '';
    let branches = [];
    let busy = false;
    let pollTimer = null;
    let generation = 0;    // a newer read, or another adapter, makes an older answer stale
    let reading = false;
    let destroyed = false;
    let changesExpanded = options.changesExpanded ?? true;
    let graphExpanded = options.graphExpanded ?? false;
    let graph = null;

    // ── the elements ────────────────────────────────────────────────────

    const root = el('div', 'twm-git-panel');
    const messageView = el('div', 'twm-git-panel__empty');
    const mainView = el('div', 'twm-git-panel__main');
    const busyBar = el('div', 'twm-git-panel__busy-bar');
    root.append(messageView, mainView);

    const branchButton = el('button', 'twm-git-panel__branch');
    branchButton.type = 'button';
    const branchLabel = el('span', 'twm-git-panel__branch-label');
    branchButton.append(icon('commit'), branchLabel);
    const badges = el('div', 'twm-git-panel__badges');
    const barActions = el('div', 'twm-git-panel__bar-actions');
    const bar = el('div', 'twm-git-panel__bar');
    bar.append(branchButton, badges, barActions);

    const fetchButton = iconButton('twm-git-panel__bar-btn', 'sync', 'Fetch',
        () => runOp('fetch', () => adapter.fetch()));
    const pullButton = iconButton('twm-git-panel__bar-btn', 'arrow_downward', 'Pull',
        () => runOp('pull', () => adapter.pull()));
    const pushButton = iconButton('twm-git-panel__bar-btn', 'arrow_upward', 'Push',
        () => runOp('push', () => adapter.push({ setUpstream: !status?.hasUpstream })));
    const overflowButton = iconButton('twm-git-panel__bar-btn', 'more_horiz', 'More actions', () => {});
    barActions.append(fetchButton, pullButton, pushButton, overflowButton);

    const commitArea = el('div', 'twm-git-panel__commit');
    const commitBox = el('textarea', 'twm-git-panel__commit-box');
    commitBox.rows = 1;
    commitBox.placeholder = 'Commit message (Ctrl+Enter to commit)';
    commitBox.setAttribute('aria-label', 'Commit message');
    const commitButton = el('button', 'twm-git-panel__commit-btn', 'Commit');
    commitButton.type = 'button';
    const commitMenuButton = iconButton('twm-git-panel__commit-menu', 'expand_more', 'Commit options', () => {});
    const commitActions = el('div', 'twm-git-panel__commit-actions');
    commitActions.append(commitButton, commitMenuButton);
    commitArea.append(commitBox, commitActions);

    const section = (title, expanded, onToggle) => {
        const arrow = el('span', 'material-symbols-outlined twm-collapsible-arrow twm-git-panel__arrow', 'expand_more');
        arrow.setAttribute('aria-hidden', 'true');
        const count = el('span', 'twm-git-panel__count');
        const head = el('button', 'twm-collapsible-header twm-git-panel__section-head');
        head.type = 'button';
        head.append(arrow, title, count);
        const body = el('div', 'twm-git-panel__section-body');
        const setExpanded = (on) => {
            arrow.classList.toggle('twm-git-panel__arrow--collapsed', !on);
            head.setAttribute('aria-expanded', String(on));
            body.hidden = !on;
        };
        setExpanded(expanded);
        head.addEventListener('click', () => onToggle(setExpanded));
        const wrap = el('div', 'twm-git-panel__section');
        wrap.append(head, body);
        return { wrap, body, count };
    };

    const changes = section('Changes', changesExpanded, (setExpanded) => {
        changesExpanded = !changesExpanded;
        setExpanded(changesExpanded);
    });
    const history = section('Graph', graphExpanded, (setExpanded) => {
        graphExpanded = !graphExpanded;
        setExpanded(graphExpanded);
        if (graphExpanded) ensureGraph();
    });
    mainView.append(busyBar, bar, commitArea, changes.wrap, history.wrap);
    host.appendChild(root);

    // ── the views ───────────────────────────────────────────────────────

    const showMessage = (iconName, text, action = null) => {
        const parts = [icon(iconName), el('span', null, text)];
        if (action) parts.push(action);
        messageView.replaceChildren(...parts);
        messageView.hidden = false;
        mainView.hidden = true;
    };

    const showNotRepo = () => {
        let action = null;
        if (adapter.init) {
            action = el('button', 'twm-btn twm-btn--primary twm-git-panel__init', 'Initialize Repository');
            action.type = 'button';
            action.addEventListener('click', initRepo);
        }
        showMessage('source', 'Not a git repository', action);
    };

    const fileRow = (file) => {
        const { name, dir } = splitPath(file.path);
        const row = el('div', 'twm-git-panel__file');
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.title = file.renamedFrom ? `${file.renamedFrom} → ${file.path}` : file.path;
        row.append(
            el('span', `twm-git-panel__status twm-git-panel__status--${file.status}`, file.status),
            el('span', 'twm-git-panel__file-name', name),
        );
        if (dir) row.appendChild(el('span', 'twm-git-panel__file-dir', dir));
        const open = () => openDiff({ path: file.path, status: file.status, staged: file.staged,
            ...(file.renamedFrom ? { renamedFrom: file.renamedFrom } : {}) });
        row.addEventListener('click', open);
        row.addEventListener('keydown', (e) => {
            if (e.target === row && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                open();
            }
        });

        const actions = el('div', 'twm-git-panel__file-actions');
        const action = (iconName, label, fn) => {
            actions.appendChild(iconButton('twm-git-panel__file-btn', iconName, label, (e) => {
                e.stopPropagation();
                fn();
            }));
        };
        if (!file.staged && adapter.stage) {
            action('add', 'Stage', () => runOp('stage', () => adapter.stage({ paths: [file.path] })));
        }
        if (file.staged && adapter.unstage) {
            // A rename is two paths to the index: the new one alone would leave the old one staged as deleted.
            const paths = file.renamedFrom ? [file.renamedFrom, file.path] : [file.path];
            action('remove', 'Unstage', () => runOp('unstage', () => adapter.unstage({ paths })));
        }
        // A conflict is resolved or the merge aborted; there is no one state to put it back to.
        if (adapter.discard && file.status !== 'C') action('undo', 'Discard changes', () => discard(file));
        row.appendChild(actions);
        return row;
    };

    const drawStatus = () => {
        branchLabel.textContent = status.branch ?? '';
        const marks = [];
        if (status.hasUpstream && status.ahead > 0) marks.push(el('span', 'twm-git-panel__badge', `↑${status.ahead}`));
        if (status.hasUpstream && status.behind > 0) marks.push(el('span', 'twm-git-panel__badge', `↓${status.behind}`));
        badges.replaceChildren(...marks);

        const files = status.files ?? [];
        changes.count.textContent = String(files.length);
        changes.body.replaceChildren(...(files.length > 0
            ? files.map(fileRow)
            : [el('div', 'twm-git-panel__no-changes', 'No changes')]));
        overflowDropdown.setOptions(overflowOptions());
    };

    const drawBusy = () => {
        busyBar.hidden = !busy;
        for (const b of [branchButton, fetchButton, pullButton, pushButton, overflowButton, commitButton, commitMenuButton]) {
            b.disabled = busy;
        }
    };

    /** What is on offer is what the adapter can do. */
    const drawCapabilities = () => {
        if (!adapter) return;
        fetchButton.hidden = !adapter.fetch;
        pullButton.hidden = !adapter.pull;
        pushButton.hidden = !adapter.push;
        commitArea.hidden = !adapter.commit;
        const overflow = overflowOptions();
        overflowButton.hidden = overflow.every((o) => o.separator);
        overflowDropdown.setOptions(overflow);
        commitDropdown.setOptions(commitOptions());
        branchDropdown.setOptions(branchOptions());
    };

    // ── the menus ───────────────────────────────────────────────────────

    const commitOptions = () => [
        { type: 'commit', label: 'Commit', icon: 'check' },
        { type: 'amend', label: 'Commit (Amend)', icon: 'edit' },
        { separator: true },
        ...(adapter?.push ? [{ type: 'commitPush', label: 'Commit &amp; Push', icon: 'arrow_upward' }] : []),
        ...(adapter?.pull && adapter?.push ? [{ type: 'commitSync', label: 'Commit &amp; Sync', icon: 'sync' }] : []),
    ];

    const overflowOptions = () => {
        if (!adapter) return [];
        return [
            ...(adapter.stash ? [{ type: 'stash', label: 'Stash', icon: 'archive' }] : []),
            ...(adapter.stashPop ? [{ type: 'stashPop', label: 'Pop Stash', icon: 'unarchive' }] : []),
            { separator: true },
            ...(adapter.merge ? [{ type: 'merge', label: 'Merge…', icon: 'merge' }] : []),
            ...(adapter.rebase ? [{ type: 'rebase', label: 'Rebase…', icon: 'rebase_edit' }] : []),
            ...(adapter.rebase && status?.rebasing ? [
                { type: 'rebaseContinue', label: 'Continue Rebase', icon: 'play_arrow' },
                { type: 'rebaseAbort', label: 'Abort Rebase', icon: 'cancel' },
            ] : []),
            { separator: true },
            ...(adapter.remotes ? [{ type: 'remotes', label: 'Remotes…', icon: 'cloud' }] : []),
            ...(adapter.tags ? [{ type: 'tags', label: 'Tags…', icon: 'sell' }]
                : adapter.createTag ? [{ type: 'createTag', label: 'Create Tag…', icon: 'sell' }] : []),
        ];
    };

    /** Local then remote branches to check out, then making and removing branches. */
    const branchOptions = () => {
        if (!adapter) return [];
        const ref = (b, iconName) => ({ type: 'checkout', ref: b.name, label: escapeLabel(b.name), icon: iconName });
        return [
            ...(adapter.checkout ? [
                ...branches.filter((b) => !b.isRemote).map((b) => ref(b, b.isCurrent ? 'check' : 'commit')),
                { separator: true },
                ...branches.filter((b) => b.isRemote).map((b) => ref(b, 'cloud')),
            ] : []),
            { separator: true },
            ...(adapter.createBranch ? [{ type: 'createBranch', label: 'Create Branch…', icon: 'add' }] : []),
            ...(adapter.deleteBranch ? [{ type: 'deleteBranch', label: 'Delete Branch…', icon: 'delete' }] : []),
        ];
    };

    const branchDropdown = new ActionDropdown({
        trigger: branchButton,
        options: [],
        onSelect: (option) => onBranchOption(option),
    });
    const commitDropdown = new ActionDropdown({
        trigger: commitMenuButton,
        options: [],
        onSelect: (option) => commit(option.type),
    });
    const overflowDropdown = new ActionDropdown({
        trigger: overflowButton,
        options: [],
        onSelect: (option) => onOverflowOption(option),
    });

    // ── reading the repository ──────────────────────────────────────────

    const readBranches = async (gen) => {
        if (!adapter?.branches) return;
        let result;
        try {
            result = await adapter.branches();
        } catch {
            return;   // the branch menu keeps what it has; the next read tries again
        }
        if (gen !== generation || destroyed || !result?.ok) return;
        branches = result.branches ?? [];
        branchDropdown.setOptions(branchOptions());
    };

    const refresh = async () => {
        const gen = ++generation;
        if (!adapter) {
            showMessage('folder_off', emptyLabel);
            onCountChange?.(0);
            return;
        }
        reading = true;
        try {
            // Asked until it is yes, so a repository made outside the panel is
            // noticed; a repository that goes away fails `status` and is asked again.
            if (!isRepo) {
                const check = await adapter.isRepo();
                if (gen !== generation || destroyed) return;
                if (!check?.ok) {
                    showMessage('error', check?.error || 'The repository could not be read.');
                    onCountChange?.(0);
                    return;
                }
                if (!check.isRepo) {
                    showNotRepo();
                    onCountChange?.(0);
                    return;
                }
                isRepo = true;
            }
            const result = await adapter.status();
            if (gen !== generation || destroyed) return;
            if (!result?.ok) {
                isRepo = false;
                statusJson = '';
                showMessage('error', result?.error || 'The repository could not be read.');
                onCountChange?.(0);
                return;
            }
            messageView.hidden = true;
            mainView.hidden = false;
            const json = JSON.stringify(result);
            if (json === statusJson) return;
            statusJson = json;
            status = result;
            drawStatus();
            onCountChange?.((result.files ?? []).length);
            readBranches(gen);
            graph?.refresh();
        } catch (e) {
            if (gen !== generation || destroyed) return;
            isRepo = false;
            statusJson = '';
            showMessage('error', e?.message || String(e));
            onCountChange?.(0);
        } finally {
            if (gen === generation) reading = false;
        }
    };

    /** A poll that finds the last read still out waits for the next tick; it never queues. */
    const poll = () => {
        if (!reading && !busy) refresh();
    };

    const startPolling = () => {
        if (pollTimer !== null || destroyed) return;
        refresh();
        if (pollInterval > 0) pollTimer = setInterval(poll, pollInterval);
    };

    const stopPolling = () => {
        if (pollTimer !== null) clearInterval(pollTimer);
        pollTimer = null;
    };

    // ── operations ──────────────────────────────────────────────────────

    /**
     * Run an operation with the panel busy, one at a time; one asked for while
     * another runs does not run, and says so. The panel reads the repository
     * again however it went.
     */
    async function runOp(opName, fn) {
        if (busy) {
            toastInfo('Git is busy', `The ${opName} did not run: another operation is still going.`);
            return;
        }
        busy = true;
        drawBusy();
        await callGit(`Git ${opName}`, fn);
        busy = false;
        drawBusy();
        statusJson = '';
        await refresh();
    }

    async function initRepo() {
        const result = await callGit('Git init', () => adapter.init());
        if (result) await refresh();
    }

    /** The answer of the first step that failed, else of the last. */
    async function inSteps(steps) {
        let result;
        for (const step of steps) {
            result = await step();
            if (result && result.ok === false) return result;
        }
        return result;
    }

    async function commit(mode) {
        const message = commitBox.value.trim();
        const amend = mode === 'amend';
        if (!message && !amend) {
            commitBox.focus();
            return;
        }
        const files = status?.files ?? [];
        if (!amend && files.length === 0) {
            toastInfo('Nothing to commit', 'There are no changes.');
            return;
        }
        const git = adapter;
        // A branch with no upstream yet gets one on its first push.
        const setUpstream = !status?.hasUpstream;
        // With nothing staged, a commit takes every change.
        const stageAll = !amend && git.stage && !files.some((f) => f.staged);
        await runOp('commit', () => inSteps([
            ...(stageAll ? [() => git.stage({ paths: 'all' })] : []),
            async () => {
                const result = await git.commit({ message: message || null, amend });
                if (git === adapter && (!result || result.ok !== false)) {
                    commitBox.value = '';
                    commitBox.style.height = '';
                }
                return result;
            },
            ...(mode === 'commitSync' ? [() => git.pull()] : []),
            ...(mode === 'commitPush' || mode === 'commitSync' ? [() => git.push({ setUpstream })] : []),
        ]));
    }

    /** What the dialog says, by what discarding does to this kind of change. */
    const discardWords = ({ path, status: letter, renamedFrom }) => {
        const { name } = splitPath(path);
        if (letter === 'U') {
            return { title: 'Delete File', okLabel: 'Delete', message: `Delete the untracked file "${name}"? This cannot be undone.` };
        }
        if (letter === 'A') {
            return { title: 'Delete File', okLabel: 'Delete', message: `Delete the new file "${name}"? It was never committed, so this cannot be undone.` };
        }
        if (renamedFrom) {
            return { title: 'Discard Changes', okLabel: 'Discard', message: `Put "${splitPath(renamedFrom).name}" back and discard all changes to "${name}"?` };
        }
        return { title: 'Discard Changes', okLabel: 'Discard', message: `Discard all changes to "${name}"?` };
    };

    async function discard(file) {
        const git = adapter;
        const confirmed = await showConfirmDialog({ ...discardWords(file), icon: 'warning', okVariant: 'danger' });
        if (!confirmed) return;
        await runOp('discard', () => git.discard({ path: file.path, status: file.status,
            ...(file.renamedFrom ? { renamedFrom: file.renamedFrom } : {}) }));
    }

    async function onBranchOption(option) {
        if (option.type === 'checkout') {
            await runOp('checkout', () => adapter.checkout({ ref: option.ref }));
        } else if (option.type === 'createBranch') {
            const git = adapter;
            const values = await askFor('Create Branch', 'Create', [['name', 'Branch name']]);
            if (values) await runOp('create branch', () => git.createBranch({ name: values.name }));
        } else if (option.type === 'deleteBranch') {
            await deleteBranch();
        }
    }

    const otherLocalBranches = () => branches.filter((b) => !b.isCurrent && !b.isRemote);

    /** A branch the adapter refuses as not merged is offered once more, forced; any other refusal is only that. */
    async function deleteBranch() {
        const git = adapter;
        const others = otherLocalBranches();
        if (others.length === 0) {
            toastInfo('Nothing to delete', 'There is no other local branch.');
            return;
        }
        const name = await showSelectDialog({
            title: 'Delete Branch',
            okLabel: 'Delete',
            items: others.map((b) => ({ value: b.name, label: b.name })),
        });
        if (!name) return;
        let notMerged = false;
        await runOp('delete branch', async () => {
            const result = await git.deleteBranch({ name, force: false });
            notMerged = result?.notMerged === true;
            return notMerged ? { ok: true } : result;   // the dialog below says it, not a toast as well
        });
        if (!notMerged) return;
        const force = await showConfirmDialog({
            title: 'Force Delete Branch',
            message: `"${name}" is not fully merged. Delete it anyway? Commits only on it may be lost.`,
            icon: 'warning',
            okLabel: 'Force Delete',
            okVariant: 'danger',
        });
        if (force) await runOp('delete branch', () => git.deleteBranch({ name, force: true }));
    }

    async function onOverflowOption(option) {
        switch (option.type) {
            case 'stash':
                await runOp('stash', () => adapter.stash({}));
                break;
            case 'stashPop':
                await runOp('stash pop', () => adapter.stashPop());
                break;
            case 'merge':
            case 'rebase':
                await mergeOrRebase(option.type);
                break;
            case 'rebaseContinue':
                await runOp('rebase', () => adapter.rebase({ continue: true }));
                break;
            case 'rebaseAbort':
                await runOp('rebase', () => adapter.rebase({ abort: true }));
                break;
            case 'remotes':
                await showRemotesMenu();
                break;
            case 'tags':
                await showTagsMenu();
                break;
            case 'createTag':
                await createTag(adapter);
                break;
        }
    }

    /** Merge another local branch into the current one, or rebase onto it. */
    async function mergeOrRebase(op) {
        const git = adapter;
        const others = otherLocalBranches();
        if (others.length === 0) {
            toastInfo(`Nothing to ${op}`, 'There is no other local branch.');
            return;
        }
        const branch = await showSelectDialog({
            title: op === 'merge' ? 'Merge Branch' : 'Rebase onto Branch',
            okLabel: op === 'merge' ? 'Merge' : 'Rebase',
            items: others.map((b) => ({ value: b.name, label: b.name })),
        });
        if (!branch) return;
        await runOp(op, () => (op === 'merge' ? git.merge({ branch }) : git.rebase({ onto: branch })));
    }

    /** A menu under the bar's actions: one item per thing listed, then a way to add one. */
    const barMenu = (items, emptyTitle, onAction) => {
        if (items.length === 0) {
            toastInfo(emptyTitle, 'There are none in this repository.');
            return;
        }
        const anchor = barActions.getBoundingClientRect();
        showContextMenu(anchor.left, anchor.bottom + 4, items, onAction);
    };

    async function showRemotesMenu() {
        const git = adapter;
        const result = await callGit('Git remotes', () => git.remotes());
        if (!result || git !== adapter) return;
        const remotes = result.remotes ?? [];
        const items = git.removeRemote ? remotes.map((r, i) => ({
            label: `Remove ${r.name}`, title: r.url, icon: 'cloud_off', action: String(i), danger: true,
        })) : remotes.map((r) => ({ label: r.name, title: r.url, icon: 'cloud', disabled: true }));
        if (git.addRemote) {
            if (items.length > 0) items.push({ separator: true });
            items.push({ label: 'Add Remote…', icon: 'add', action: 'add' });
        }
        barMenu(items, 'No remotes', async (action) => {
            if (action === 'add') {
                const values = await askFor('Add Remote', 'Add', [['name', 'Name'], ['url', 'URL']]);
                if (values) await runOp('add remote', () => git.addRemote(values));
                return;
            }
            const { name } = remotes[Number(action)];
            const confirmed = await showConfirmDialog({
                title: 'Remove Remote',
                message: `Remove remote "${name}"?`,
                icon: 'warning',
                okLabel: 'Remove',
                okVariant: 'danger',
            });
            if (confirmed) await runOp('remove remote', () => git.removeRemote({ name }));
        });
    }

    async function createTag(git) {
        const values = await askFor('Create Tag', 'Create', [['name', 'Tag name']]);
        if (values) await runOp('create tag', () => git.createTag({ name: values.name }));
    }

    async function showTagsMenu() {
        const git = adapter;
        const result = await callGit('Git tags', () => git.tags());
        if (!result || git !== adapter) return;
        const tags = result.tags ?? [];
        const items = git.deleteTag ? tags.map((t, i) => ({
            label: `Delete ${t.name}`, title: t.hash, icon: 'delete', action: String(i), danger: true,
        })) : tags.map((t) => ({ label: t.name, title: t.hash, icon: 'sell', disabled: true }));
        if (git.createTag) {
            if (items.length > 0) items.push({ separator: true });
            items.push({ label: 'Create Tag…', icon: 'add', action: 'add' });
        }
        barMenu(items, 'No tags', async (action) => {
            if (action === 'add') {
                await createTag(git);
                return;
            }
            const { name } = tags[Number(action)];
            const confirmed = await showConfirmDialog({
                title: 'Delete Tag',
                message: `Delete tag "${name}"?`,
                icon: 'warning',
                okLabel: 'Delete',
                okVariant: 'danger',
            });
            if (confirmed) await runOp('delete tag', () => git.deleteTag({ name }));
        });
    }

    function ensureGraph() {
        if (graph || !adapter?.log) return;
        graph = createGitGraph(history.body, {
            adapter,
            onOpenDiff: openDiff,
            showRemoteRefs,
            onChanged: () => {
                statusJson = '';
                refresh();
            },
        });
    }

    // ── wiring ──────────────────────────────────────────────────────────

    commitButton.addEventListener('click', () => commit('commit'));
    commitBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit('commit');
        }
    });
    commitBox.addEventListener('input', () => {
        commitBox.style.height = 'auto';
        commitBox.style.height = `${Math.min(commitBox.scrollHeight, COMMIT_BOX_MAX_PX)}px`;
    });
    // The menu opens on what is known; a branch made elsewhere arrives while it is open.
    branchButton.addEventListener('click', () => readBranches(generation));

    drawBusy();
    drawCapabilities();
    if (graphExpanded) ensureGraph();
    showMessage('hourglass_empty', 'Checking repository…');
    startPolling();

    return {
        el: root,
        refresh,
        startPolling,
        stopPolling,
        setAdapter(next) {
            if (next) requireMethods(next);
            adapter = next ?? null;
            isRepo = false;
            status = null;
            statusJson = '';
            branches = [];
            reading = false;
            commitBox.value = '';
            commitBox.style.height = '';
            changes.body.replaceChildren();
            drawCapabilities();
            graph?.setAdapter(adapter);
            if (graphExpanded) ensureGraph();
            if (adapter) showMessage('hourglass_empty', 'Checking repository…');
            refresh();
        },
        destroy() {
            destroyed = true;
            generation++;
            stopPolling();
            branchDropdown.destroy();
            commitDropdown.destroy();
            overflowDropdown.destroy();
            graph?.destroy();
            root.remove();
        },
    };
}
