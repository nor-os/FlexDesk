# Git panel, commit graph and diff viewer

> **Package:** `@flexdesk/git` · **Stylesheet:** `flexdesk/css` · [All docs](../README.md)

A source-control panel, an SVG swimlane commit graph and a diff viewer. None of them runs git or reaches a backend: the panel and the graph call the methods of an **adapter** object you pass in, and the [git adapter contract](#the-git-adapter-contract-0180) below says what each method takes and answers, so that a Python, a C# or any other backend can implement it. The diff viewer needs no adapter at all.

`@flexdesk/git` is a separate entry, so an application that does not show a repository does not load it. Add it to your import map beside the others:

```json
{ "imports": { "@flexdesk/git": "./vendor/flexdesk/git.js" } }
```

## The panel: `createGitPanel` (0.18.0)

```js
import { createGitPanel } from '@flexdesk/git';

const panel = createGitPanel(el, {
    adapter,                                 // the contract below; null shows emptyLabel
    onCountChange: (n) => setBadge(n),       // how many files have changes
});

panel.setAdapter(otherRepository);           // another repository, or null
panel.stopPolling();                         // while its tab is hidden
panel.startPolling();                        // reads at once, then every pollInterval
await panel.refresh();                       // read now
panel.destroy();
```

From the top, it shows the current branch with its menu (check out, create, delete), ahead and behind counts, Fetch, Pull, Push and a More menu (stash, pop stash, merge, rebase, remotes, tags); a commit box with a Commit button and a menu (amend, commit and push, commit and sync); the changed files, each with Stage or Unstage and Discard; and the commit graph, collapsed until opened.

| Option | Default | |
|---|---|---|
| `adapter` | `null` | The git adapter. `isRepo` and `status` are required: without them it throws a `TypeError` naming what is missing, here and in `setAdapter`. |
| `onOpenDiff` | a diff window | `({ path, status, staged, renamedFrom?, ref? }) => void`, when a file row or a commit's file is opened (`ref` is the commit). Without it, the file opens in [`openGitDiffWindow`](#a-diff-in-a-window-opendiffwindow-opengitdiffwindow-0180), or nothing happens if the adapter has no `diffFile`. |
| `onCountChange` | none | `(count) => void`, whenever the number of changed files has been read; 0 when there is nothing to read. |
| `pollInterval` | `3000` | Milliseconds between status reads. `0` reads only on `refresh()`. A poll that finds the last read still out, or an operation running, waits for the next tick. |
| `emptyLabel` | `'No repository'` | Shown while there is no adapter. |
| `changesExpanded` | `true` | |
| `graphExpanded` | `false` | The graph reads the log only once it has been opened. |
| `showRemoteRefs` | `false` | As for [`createGitGraph`](#the-commit-graph-creategitgraph-0180). |

**What is on offer is what the adapter can do.** An action whose method the adapter lacks is not drawn: with `isRepo` and `status` alone the panel is a read-only view of the branch and the changed files.

**What you type is yours.** The panel's elements are built once and updated in place, so a status change never touches the commit box. Its text is cleared when a commit succeeds and when `setAdapter` changes the repository; a refused commit leaves it.

**Committing.** With nothing staged, Commit stages everything first (`stage({ paths: 'all' })`). With something staged, it commits that. Amend stages nothing, and an empty message on an amend keeps the old message (`message: null`). Commit and Sync is commit, pull, push, and stops at the first refusal.

**A failed operation** is an error toast carrying the backend's words, through FlexDesk's [toast helpers](notifications.md#notifications-notificationcenter), and the panel reads the repository again either way. An answer with `conflicts: true` is titled "… stopped on conflicts". A failed `isRepo` or `status` is said in the panel itself, and asked again at the next poll.

**A push with no upstream** asks for one (`setUpstream: true`).

**Deleting a branch** git refuses (not fully merged) offers to force it, after asking.

**Keyboard.** Ctrl+Enter or Cmd+Enter commits from the box. A file row takes focus, Enter or Space opens it, and its actions show on focus as on hover.

## The commit graph: `createGitGraph` (0.18.0)

```js
import { createGitGraph } from '@flexdesk/git';

const graph = createGitGraph(el, {
    adapter,                                  // needs `log`; the rest is used when present
    onOpenDiff: ({ path, status, ref }) => {},
    onChanged: () => refreshTheRestOfMyPage(),
});
graph.setAdapter(otherRepository);
await graph.refresh();
graph.destroy();
```

The panel holds one of these; it also stands alone. Give `el` a height: the graph scrolls inside it and asks for the next page when the last row comes into view. Rows are 22 pixels and each draws its own SVG: lines passing through it, the commit's node, and curves to its parents.

| Option | Default | |
|---|---|---|
| `adapter` | `null` | The git adapter. `log` is what it draws; `branches` tells remote pills from local ones. |
| `onOpenDiff` | a diff window | As for the panel; `ref` is always the commit's hash. |
| `onChanged` | none | Told after a menu operation, so the rest of your page can follow. |
| `pageSize` | `50` | Commits a page. |
| `showRemoteRefs` | `false` | Draw remote branches' pills as well. A narrow panel leaves them out; a wide graph has the room. |

`refresh()` re-reads as many commits as are loaded and redraws only if something differs, so it costs no scroll position and is safe to call on every status change. A row's context menu (right-click, Shift+F10 or the Menu key) offers what the adapter can do: Checkout, Create Branch, Copy Commit Hash, Cherry-pick, Create Tag and View Changes, which opens the file if the commit changed one and lists them if it changed several.

Two pure functions are exported for your own drawing or tests:

**`computeGraphLanes(commits)`** answers `{ rows, laneCount }` for commits newest first, children before parents. A row is `{ lane, hasChild, outputLanes: [{ lane, parentHash }], passLanes }`. The rows for a list are the same as the first rows for any longer list that starts with it.

**`parseGitRefs(refs, remoteNames?)`** reads a `refs` string (below) into `[{ name, type }]`, with `type` one of `'head'`, `'tag'`, `'branch'`, `'remote'`. `git log` writes `origin/main` and a local `feature/x` the same way, so only `remoteNames`, a `Set` of the remote branches' names, tells them apart.

The lane colours are the tokens `--twm-git-lane-0` to `--twm-git-lane-7`; a lane past the last takes them round again.

## The diff viewer: `createDiffViewer` (0.18.0)

```js
import { createDiffViewer } from '@flexdesk/git';

const viewer = createDiffViewer(el, { before, after });

viewer.update({
    before: committedText,
    after: currentText,
    diff: rawDiffText,                                   // optional
    fields: [{ name: 'Priority', from: 'low', to: 'high' }],   // optional; you parse them
});
viewer.setView('raw');         // 'fields', 'text', 'raw', or null to hand the choice back
viewer.view();                 // what is showing
viewer.showMessage('Loading…');
viewer.destroy();
```

It has three views, and offers one only when its data is there. The buttons that switch between them are drawn only when there are two or more.

| View | Offered when | Draws |
|---|---|---|
| Fields | `fields` is an array | Each `{ name, from, to }` as the name, the old value, an arrow and the new value. An absent or empty value reads as a dash. It knows nothing of where the values came from: the consumer parses them. |
| Text | `before` or `after` is a string; or `diff` has something to read | Line by line with old and new line numbers and no diff headers. `before`/`after` are compared here; without them `diff` is read. Unchanged lines beyond the context are one row saying how many. |
| Raw | `diff` is a string | The text as it came. |

Which view shows: the one set by the `view` option, `setView` or a click, while it stays on offer; else Fields if a field changed; else Text; else Raw.

| Option or data | Default | |
|---|---|---|
| `before`, `after`, `diff`, `fields` | | As above. `update` takes these too, and replaces all of them. |
| `beforeStart`, `afterStart` | `1` | The line number of `before`'s and `after`'s first line, when you compare only part of a file. `update` takes these too. |
| `context` | `3` | Unchanged lines kept around each change. `Infinity` keeps them all. |
| `maxLines` | `1500` | Past this many differing lines a side, the texts are not compared, and it says so. Unchanged lines at the start and the end do not count, so a long file with a small edit is compared. |
| `view` | | The view to show while it is on offer. |
| `labels` | | Words to replace: `fields`, `text`, `raw`, `noChanges`, `noFields`, `tooLong`, and `gap: (hidden) => string`. |
| `onViewChange` | none | `(view) => void`, when a click changes the view. |

Text is always drawn as text, never as markup. Colours are the tokens `--twm-diff-add-bg`, `--twm-diff-add-fg`, `--twm-diff-del-bg` and `--twm-diff-del-fg`.

### The line diff, without the viewer (0.18.0)

**`computeLineDiff(before, after, { context, maxLines, beforeStart, afterStart })`** answers an array of lines, `[]` when the texts have the same lines (CRLF and LF are the same line end, and a final line end makes no line), or `null` when they are too long to compare.

**`parseUnifiedDiff(text)`** reads a unified diff into the same lines. It leaves out the `diff --git`, `index`, `---` and `+++` headers, and draws a `file` line before each file only when the diff has several.

**`diffStats(lines)`** answers `{ added, removed }`, for a one-glance summary such as "+2 lines". **`splitLines(text)`** and **`LINE_DIFF_LIMIT`** are exported too.

A line is one of:

```js
{ kind: 'context' | 'add' | 'del', oldLine, newLine, text }     // numbers are 1-based; null on the side it is not on
{ kind: 'gap', oldLine: null, newLine: null, text: '', hidden } // `hidden` unchanged lines left out
{ kind: 'hunk' | 'meta' | 'file', oldLine: null, newLine: null, text }
```

## A diff in a window: `openDiffWindow`, `openGitDiffWindow` (0.18.0)

```js
import { openDiffWindow, openGitDiffWindow } from '@flexdesk/git';

await openDiffWindow({
    title: 'notes.txt',
    load: async () => ({ before, after }),   // what `update` takes, or { ok: false, error }
});

await openGitDiffWindow({ adapter, path: 'src/a.txt', status: 'M' });
await openGitDiffWindow({ adapter, path: 'src/a.txt', status: 'M', ref: hash });   // that commit's change
```

A modal holding a viewer, showing "Loading…" until `load` answers. A refusal or a throw is shown in the window. `openDiffWindow` also takes `icon`, `width` (880), `height` (600) and `labels`. The promise settles when the window closes.

## The git adapter contract (0.18.0)

An adapter is a plain object. It knows which repository it is for, so no payload names one: to show another repository, pass another adapter to `setAdapter`. Every method may answer directly or with a promise.

**Every answer** is a JSON object with `ok`:

```js
{ ok: true, /* the method's own fields */ }
{ ok: false, error: 'what the backend said' }
{ ok: false, error: 'what git said', conflicts: true }   // merge, rebase, pull, stash pop, cherry-pick: stopped on conflicts
```

A method that throws or rejects is treated as `{ ok: false, error: e.message }`. Field names are exactly as written here, camelCase, for a C# or Python backend as well. A method with no payload below is called with no argument.

**Required:** `isRepo` and `status`. **Everything else is optional:** leave a method out and its action is not offered.

### Reading

| Method | Payload | Answer, besides `ok` |
|---|---|---|
| `isRepo()` | | `isRepo: boolean`. `ok: false` is for when it could not ask, such as git not being installed. |
| `status()` | | [`StatusResult`](#statusresult) |
| `branches()` | | `branches: Branch[]` |
| `log(payload)` | `{ count: number, skip: number }` | `commits: Commit[]`, newest first, children before parents. `[]` for a repository with no commits, not a refusal. |
| `commitFiles(payload)` | `{ hash: string }` | `files: [{ path: string, status: FileStatus }]`, what that commit changed |
| `diffFile(payload)` | `{ path: string, status?: FileStatus, ref?: string }` | [`DiffResult`](#diffresult) |
| `tags()` | | `tags: [{ name: string, hash: string }]` |
| `remotes()` | | `remotes: [{ name: string, url: string }]` |

#### StatusResult

```js
{
    ok: true,
    branch: 'main',                    // the short name; on a detached HEAD, what `git rev-parse --abbrev-ref HEAD` says
    files: [
        { path: 'src/a.txt', status: 'M', staged: false },
        { path: 'new_name.txt', status: 'R', staged: true, renamedFrom: 'old_name.txt' },
    ],
    ahead: 2,                          // commits the upstream does not have; 0 without an upstream
    behind: 1,                         // commits the upstream has and this does not; 0 without an upstream
    hasUpstream: true,
    rebasing: false,                   // optional: a rebase has stopped; offers Continue and Abort
}
```

One entry a path. `path` is relative to the repository, with forward slashes. `staged` is true when the index has a change for the path, whether or not the working copy has another.

`FileStatus` is one letter:

| | Meaning | `git status --porcelain=v1` |
|---|---|---|
| `M` | Modified | anything not below |
| `A` | Added | `A` in either column |
| `D` | Deleted | `D` in either column |
| `R` | Renamed; the entry has `renamedFrom` | `R` in the index column |
| `C` | Conflicted | `U` in either column |
| `U` | Untracked | `??` |

The panel compares answers to decide whether to redraw, so answer the same fields in the same order when nothing has changed.

#### Branch

```js
{
    name: 'feature/x',        // what `checkout` takes; a remote branch as `origin/main`, without `remotes/`
    hash: 'a1b2c3d',          // short
    isCurrent: false,
    isRemote: false,
    upstream: 'origin/x',     // '' when it has none
}
```

#### Commit

```js
{
    hash: 'a1b2c3d4e5f6…',           // full. git log --format: %H
    shortHash: 'a1b2c3d',            // %h
    author: 'A Person',              // %an
    email: 'a.person@example.org',   // %ae
    timestamp: 1700000000,           // seconds since the epoch, %at
    subject: 'Name the steps',       // %s
    refs: 'HEAD -> main, tag: v1',   // %D, exactly as git writes it; '' when none
    parentHashes: ['b2c3d4e5f6a7…'], // full, %P split on spaces; [] for a root commit
}
```

`log` must list all branches in `--topo-order` for the lanes to be right: `git log --all --topo-order -n<count> --skip=<skip>`.

#### DiffResult

```js
{ ok: true, before: 'old text', after: 'new text', diff: '@@ -1 +1 @@\n…', language: 'python' }
```

Answer `before` and `after`, or `diff`, or all three; a missing side of a new or deleted file is `''`. Without `ref`, the comparison is the last commit against the working copy, that is everything not yet committed, staged or not. With `ref`, it is that commit's parent against that commit. `language` is optional and FlexDesk does not read it: it is there for an `onOpenDiff` of yours that opens a code editor's diff view.

### Changing the working copy

Each answers `{ ok: true }` unless it says otherwise.

| Method | Payload | What it does |
|---|---|---|
| `init()` | | `git init` |
| `stage(payload)` | `{ paths: string[] \| 'all' }` | `git add -- <paths>`; `'all'` is `git add -A` |
| `unstage(payload)` | `{ paths: string[] }` | `git reset HEAD -- <paths>` |
| `discard(payload)` | `{ path: string, status: FileStatus }` | Puts a tracked file back to its last commit. For `U`, removes the file. The panel asks first. |
| `commit(payload)` | `{ message: string \| null, amend: boolean }` | `git commit -m <message>`, with `--amend` when asked. `message: null` comes only with `amend: true` and keeps the last message (`--no-edit`). Answers `hash: string`, the new commit. The panel stages before calling; this does not. |
| `stash(payload)` | `{ message?: string }` | `git stash push`, with `-m` when given |
| `stashPop()` | | `git stash pop`. May answer `conflicts`. |

### Branches and history

| Method | Payload | What it does |
|---|---|---|
| `checkout(payload)` | `{ ref: string }` | `git checkout <ref>`: a branch, a remote branch or a commit's full hash |
| `createBranch(payload)` | `{ name: string, from?: string }` | `git checkout -b <name> [<from>]`: makes it and switches to it |
| `deleteBranch(payload)` | `{ name: string, force: boolean }` | `git branch -d <name>`, or `-D` when forced |
| `merge(payload)` | `{ branch: string }` | `git merge <branch>`. May answer `conflicts`. |
| `rebase(payload)` | `{ onto: string }` or `{ continue: true }` or `{ abort: true }` | `git rebase <onto>`, `--continue` or `--abort`. May answer `conflicts`. |
| `cherryPick(payload)` | `{ hash: string }` | `git cherry-pick <hash>`. May answer `conflicts`. |
| `createTag(payload)` | `{ name: string, hash?: string }` | `git tag <name> [<hash>]`, on HEAD without one |
| `deleteTag(payload)` | `{ name: string }` | `git tag -d <name>` |

### Remotes

| Method | Payload | What it does |
|---|---|---|
| `fetch()` | | `git fetch --all` |
| `pull()` | | `git pull`. May answer `conflicts`. |
| `push(payload)` | `{ setUpstream: boolean }` | `git push`; with `setUpstream`, `git push -u <remote> <current branch>` |
| `addRemote(payload)` | `{ name: string, url: string }` | `git remote add` |
| `removeRemote(payload)` | `{ name: string }` | `git remote remove` |

### Writing an adapter

Over a pywebview bridge whose methods take the repository in the payload:

```js
const adapter = {
    isRepo:  () => api.git_is_repo({ repoPath }),
    status:  () => api.git_status({ repoPath }),
    log:     (p) => api.git_log({ repoPath, ...p }),
    stage:   (p) => api.git_stage({ repoPath, ...p }),
    discard: ({ path, status }) => api.git_discard({ repoPath, filePath: path, status }),
    // …
};
```

Over HTTP, with the answers already in this shape:

```js
const call = (name) => (payload) => fetch(`/api/git/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
}).then((r) => r.json());

const adapter = Object.fromEntries(['isRepo', 'status', 'branches', 'log', 'stage', 'unstage', 'commit', 'push']
    .map((name) => [name, call(name)]));
```

`demo/git.js` is a complete adapter over a repository in memory, and `demo/git.html` shows it.
