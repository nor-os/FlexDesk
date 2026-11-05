/**
 * git_graph.js — a commit history drawn as a vertical SVG swimlane graph, one
 * row a commit, loaded a page at a time from the adapter's `log`.
 *
 *     const graph = createGitGraph(el, { adapter, onOpenDiff, onChanged });
 *     graph.refresh();
 *     graph.destroy();
 *
 * Give `el` a height: the graph scrolls inside it and asks for the next page
 * when the last row comes into view. `refresh()` re-reads what is loaded and
 * redraws only if something differs, so it is safe to call on every status
 * change without losing the scroll position.
 *
 * A row's context menu offers what the adapter can do (docs/components/git.md);
 * each call goes through the adapter and a failure is an error toast with the
 * backend's words. Nothing is stored on the DOM.
 */

import { showContextMenu } from '../ui/components/context_menu.js';
import { reportBridgeError, toastInfo } from '../ui/components/toast.js';
import { askFor, callGit, openDiffHandler } from './git_ops.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The tokens `--twm-git-lane-0` … `-7`; a lane past the last takes them round again. */
const LANE_COLOURS = 8;
const LANE_WIDTH = 11;
const ROW_HEIGHT = 22;     // .twm-git-graph__row's height in flexdesk.css
const NODE_RADIUS = 4;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Assign each commit to a lane. Commits come newest first, children before
 * their parents (`git log --topo-order`). The answer is the same for a list
 * and for any longer list that starts with it, so pages only ever add rows.
 *
 * Each row says what to draw in its own 22 pixels:
 *   lane         the commit's own lane
 *   hasChild     a line comes down into the commit (a branch tip has none)
 *   outputLanes  `{ lane, parentHash }`: a line leaving the commit for each parent
 *   passLanes    lanes that run straight through this row to a later commit
 *
 * @param {Array<{hash: string, parentHashes: string[]}>} commits
 * @returns {{ rows: Array<Object>, laneCount: number }}
 */
export function computeGraphLanes(commits) {
    const active = [];   // active[i]: the hash lane i is waiting for; null when free
    const allocate = () => {
        const free = active.indexOf(null);
        if (free !== -1) return free;
        active.push(null);
        return active.length - 1;
    };
    const rows = commits.map((commit) => {
        // A lane waits for one hash and no hash waits in two lanes: a parent
        // already waited for is joined at its lane, not given another.
        const waiting = active.indexOf(commit.hash);
        const hasChild = waiting !== -1;
        const lane = hasChild ? waiting : allocate();
        active[lane] = null;
        const passLanes = [];
        active.forEach((hash, l) => { if (hash !== null) passLanes.push(l); });

        const outputLanes = (commit.parentHashes ?? []).map((parentHash, i) => {
            let parentLane = active.indexOf(parentHash);
            if (parentLane === -1) parentLane = i === 0 ? lane : allocate();
            active[parentLane] = parentHash;
            return { lane: parentLane, parentHash };
        });
        return { lane, hasChild, outputLanes, passLanes };
    });
    return { rows, laneCount: Math.max(active.length, 1) };
}

/** What each full ref name in a decoration list is, by how it starts. */
const REF_KINDS = [
    ['HEAD -> refs/heads/', 'head'],
    ['tag: refs/tags/', 'tag'],
    ['refs/heads/', 'branch'],
    ['refs/remotes/', 'remote'],
];

/**
 * Read `git log --decorate=full`'s `%D` list into pills. Full names are what
 * tell a remote's `refs/remotes/origin/main` from a local branch that happens
 * to be called `origin/main`. Other refs, such as `refs/stash`, are left out.
 * @param {string} refs - `HEAD -> refs/heads/main, tag: refs/tags/v1, refs/remotes/origin/main`
 * @returns {Array<{name: string, type: 'head'|'tag'|'branch'|'remote'}>}
 */
export function parseGitRefs(refs) {
    if (!refs) return [];
    return String(refs).split(',').map((s) => s.trim()).flatMap((part) => {
        if (part === 'HEAD') return [{ name: 'HEAD', type: 'head' }];
        const kind = REF_KINDS.find(([prefix]) => part.startsWith(prefix));
        return kind ? [{ name: part.slice(kind[0].length), type: kind[1] }] : [];
    });
}

const laneX = (lane) => lane * LANE_WIDTH + LANE_WIDTH / 2;

function edge(d, lane) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', `twm-git-graph__edge twm-git-lane--${lane % LANE_COLOURS}`);
    path.setAttribute('d', d);
    return path;
}

function sizeGutter(svg, laneCount) {
    const width = Math.max(laneCount * LANE_WIDTH, LANE_WIDTH * 2);
    svg.setAttribute('width', String(width));
    svg.setAttribute('viewBox', `0 0 ${width} ${ROW_HEIGHT}`);
}

function createGutter(row, laneCount) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'twm-git-graph__svg');
    svg.setAttribute('height', String(ROW_HEIGHT));
    svg.setAttribute('aria-hidden', 'true');
    sizeGutter(svg, laneCount);

    const h = ROW_HEIGHT;
    const cx = laneX(row.lane);
    const cy = h / 2;
    for (const lane of row.passLanes) {
        const x = laneX(lane);
        svg.appendChild(edge(`M${x},0 L${x},${h}`, lane));
    }
    if (row.hasChild) svg.appendChild(edge(`M${cx},0 L${cx},${cy}`, row.lane));
    for (const { lane } of row.outputLanes) {
        const x = laneX(lane);
        svg.appendChild(edge(x === cx
            ? `M${cx},${cy} L${cx},${h}`
            : `M${cx},${cy} C${cx},${h * 0.8} ${x},${h * 0.6} ${x},${h}`, lane));
    }
    const node = document.createElementNS(SVG_NS, 'circle');
    node.setAttribute('class', `twm-git-graph__node twm-git-lane--${row.lane % LANE_COLOURS}`);
    node.setAttribute('cx', String(cx));
    node.setAttribute('cy', String(cy));
    node.setAttribute('r', String(NODE_RADIUS));
    svg.appendChild(node);
    return svg;
}

function commitTitle(commit) {
    const date = new Date(commit.timestamp * 1000).toLocaleDateString();
    return `${commit.shortHash} — ${commit.author}\n${date}\n\n${commit.subject}`;
}

/**
 * @param {HTMLElement} host
 * @param {Object} [options]
 * @param {Object|null} [options.adapter] - A git adapter with `log`; the rest is used when present.
 * @param {(file: {path: string, status: string, ref: string}) => void} [options.onOpenDiff] - Opens a file of a
 *   commit. Without it, a diff window when the adapter has `diffFile`.
 * @param {() => void} [options.onChanged] - Told after a menu operation changed the repository.
 * @param {number} [options.pageSize=50]
 * @param {boolean} [options.showRemoteRefs=false] - Draw remote branches' pills as well; a narrow panel leaves them out.
 * @returns {{ el: HTMLElement, refresh(): Promise<void>, setAdapter(adapter: Object|null): void, destroy(): void }}
 */
export function createGitGraph(host, options = {}) {
    const { onChanged = null, pageSize = DEFAULT_PAGE_SIZE, showRemoteRefs = false } = options;
    let adapter = options.adapter ?? null;
    const openDiff = openDiffHandler(() => adapter, options.onOpenDiff);

    const root = document.createElement('div');
    root.className = 'twm-git-graph';
    host.appendChild(root);

    let commits = [];
    let drawnJson = '';
    let allLoaded = false;
    let generation = 0;    // a newer read makes an older answer stale
    let observer = null;
    let sentinel = null;
    let destroyed = false;

    const say = (text) => {
        const m = document.createElement('div');
        m.className = 'twm-git-graph__message';
        m.textContent = text;
        root.replaceChildren(m);
    };

    const stopObserving = () => {
        observer?.disconnect();
        observer = null;
        sentinel?.remove();
        sentinel = null;
    };

    /** `git` is the adapter the menu was opened on; a file opens only while that repository still shows. */
    const openFiles = async (git, commit, x, y) => {
        const result = await callGit('Git changes', () => git.commitFiles({ hash: commit.hash }));
        if (!result || git !== adapter) return;
        const files = result.files ?? [];
        if (files.length === 0) {
            toastInfo('No files changed', commit.shortHash);
        } else if (files.length === 1) {
            openDiff({ ...files[0], ref: commit.hash });
        } else {
            const items = files.map((f, i) => ({ label: f.path, icon: 'difference', action: String(i) }));
            showContextMenu(x, y, items, (action) => {
                if (git === adapter) openDiff({ ...files[Number(action)], ref: commit.hash });
            });
        }
    };

    const menuItems = (git) => {
        const groups = [
            [
                git.checkout && { label: 'Checkout (detached)', icon: 'logout', action: 'checkout' },
                git.createBranch && { label: 'Create Branch…', icon: 'commit', action: 'create-branch' },
                { label: 'Copy Commit Hash', icon: 'content_copy', action: 'copy-hash' },
            ],
            [
                git.cherryPick && { label: 'Cherry-pick', icon: 'content_copy', action: 'cherry-pick' },
                git.createTag && { label: 'Create Tag…', icon: 'sell', action: 'create-tag' },
                git.commitFiles && { label: 'View Changes', icon: 'difference', action: 'view-changes' },
            ],
        ].map((group) => group.filter(Boolean)).filter((group) => group.length > 0);
        return groups.flatMap((group, i) => (i === 0 ? group : [{ separator: true }, ...group]));
    };

    const onMenuAction = async (git, action, commit, x, y) => {
        const { hash } = commit;
        /** Run an operation; whatever came of it, the graph and its owner read the repository again. */
        const change = async (opName, fn) => {
            await callGit(opName, fn);
            await refresh();
            onChanged?.();
        };
        switch (action) {
            case 'checkout':
                await change('Git checkout', () => git.checkout({ ref: hash }));
                break;
            case 'create-branch': {
                const values = await askFor('Create Branch', 'Create', [['name', 'Branch name']]);
                if (values) await change('Git create branch', () => git.createBranch({ name: values.name, from: hash }));
                break;
            }
            case 'copy-hash':
                try {
                    await navigator.clipboard.writeText(hash);
                    toastInfo('Commit hash copied', commit.shortHash);
                } catch (e) {
                    reportBridgeError('Copy commit hash failed', e);
                }
                break;
            case 'cherry-pick':
                await change('Git cherry-pick', () => git.cherryPick({ hash }));
                break;
            case 'create-tag': {
                const values = await askFor('Create Tag', 'Create', [['name', 'Tag name']]);
                if (values) await change('Git create tag', () => git.createTag({ name: values.name, hash }));
                break;
            }
            case 'view-changes':
                await openFiles(git, commit, x, y);
                break;
        }
    };

    const createRow = (commit, laneRow, laneCount) => {
        const row = document.createElement('div');
        row.className = 'twm-git-graph__row';
        row.title = commitTitle(commit);
        row.tabIndex = 0;
        row.appendChild(createGutter(laneRow, laneCount));

        const info = document.createElement('div');
        info.className = 'twm-git-graph__info';
        for (const pill of parseGitRefs(commit.refs)) {
            if (pill.type === 'remote' && !showRemoteRefs) continue;
            const span = document.createElement('span');
            span.className = `twm-git-ref twm-git-ref--${pill.type}`;
            span.textContent = pill.name;
            span.title = pill.name;
            info.appendChild(span);
        }
        const subject = document.createElement('span');
        subject.className = 'twm-git-graph__subject';
        subject.textContent = commit.subject;
        info.appendChild(subject);
        row.appendChild(info);

        const openMenu = (x, y) => {
            const git = adapter;
            showContextMenu(x, y, menuItems(git), (action) => onMenuAction(git, action, commit, x, y));
        };
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openMenu(e.clientX, e.clientY);
        });
        row.addEventListener('keydown', (e) => {
            if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
            e.preventDefault();
            const r = row.getBoundingClientRect();
            openMenu(r.left, r.bottom);
        });
        return row;
    };

    const observeSentinel = () => {
        stopObserving();
        if (allLoaded || commits.length === 0) return;
        sentinel = document.createElement('div');
        sentinel.className = 'twm-git-graph__sentinel';
        root.appendChild(sentinel);
        observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) loadMore();
        }, { root });
        observer.observe(sentinel);
    };

    /** Draw the rows from `from` on, and widen the gutters above them when the lanes outgrew them. */
    const drawRows = (from) => {
        stopObserving();
        const { rows, laneCount } = computeGraphLanes(commits);
        for (const svg of root.querySelectorAll('.twm-git-graph__svg')) sizeGutter(svg, laneCount);
        const fragment = document.createDocumentFragment();
        for (let i = from; i < commits.length; i++) fragment.appendChild(createRow(commits[i], rows[i], laneCount));
        root.appendChild(fragment);
        observeSentinel();
    };

    const clear = () => {
        stopObserving();
        commits = [];
        drawnJson = '';
        allLoaded = false;
        root.replaceChildren();
    };

    /** Read from the top as many commits as are loaded, replacing what is drawn only if they differ. */
    const refresh = async () => {
        const gen = ++generation;
        if (!adapter?.log) {
            clear();
            return;
        }
        const count = Math.max(commits.length, pageSize);
        let result;
        try {
            result = await adapter.log({ count, skip: 0 });
        } catch (e) {
            result = { ok: false, error: e?.message || String(e) };
        }
        if (destroyed || gen !== generation) return;
        if (!result?.ok) {
            clear();
            say(result?.error || 'The history could not be read.');
            return;
        }
        const next = result.commits ?? [];
        const json = JSON.stringify(next);
        if (json === drawnJson) {
            if (!observer) observeSentinel();   // a read that overtook loadMore must not end the paging
            return;
        }
        const top = root.scrollTop;
        clear();
        drawnJson = json;
        commits = next;
        allLoaded = next.length < count;
        if (commits.length === 0) {
            say('No commits yet');
            return;
        }
        drawRows(0);
        root.scrollTop = top;
    };

    const loadMore = async () => {
        const gen = ++generation;
        stopObserving();
        const skip = commits.length;
        const result = await callGit('Git log', () => adapter.log({ count: pageSize, skip }));
        if (destroyed || gen !== generation || !result) return;
        const page = result.commits ?? [];
        allLoaded = page.length < pageSize;
        commits = commits.concat(page);
        drawnJson = JSON.stringify(commits);
        drawRows(skip);
    };

    refresh();

    return {
        el: root,
        refresh,
        setAdapter(next) {
            adapter = next ?? null;
            clear();
            refresh();
        },
        destroy() {
            destroyed = true;
            stopObserving();
            root.remove();
        },
    };
}
