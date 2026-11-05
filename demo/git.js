/**
 * demo/git.js — the panel, a standalone graph and a standalone viewer, over an
 * adapter that keeps a small repository in memory. The adapter is also the
 * shortest worked example of the contract in docs/components/git.md.
 */
import { createDiffViewer, createGitGraph, createGitPanel } from '../git.js';

const commit = (hash, subject, parentHashes, refs = '') => ({
    hash: `${hash}0000000000000000000000000000000000000`.slice(0, 40),
    shortHash: hash,
    author: 'A Person',
    email: 'a.person@example.org',
    timestamp: 1700000000,
    subject,
    refs,
    parentHashes: parentHashes.map((p) => `${p}0000000000000000000000000000000000000`.slice(0, 40)),
});

const repo = {
    branch: 'main',
    ahead: 2,
    behind: 1,
    files: [
        { path: 'src/parser.txt', status: 'M', staged: false },
        { path: 'notes/plan.txt', status: 'A', staged: true },
        { path: 'old_name.txt', status: 'D', staged: false },
        { path: 'renamed.txt', status: 'R', staged: true, renamedFrom: 'before.txt' },
        { path: 'scratch.txt', status: 'U', staged: false },
        { path: 'merge_me.txt', status: 'C', staged: false },
    ],
    log: [
        commit('a01', 'Merge the reader into main', ['a02', 'b01'], 'HEAD -> main, origin/main, tag: v2.0'),
        commit('a02', 'Keep the options in one place', ['a03']),
        commit('c01', 'Try a second layout', ['a03'], 'feature/layout'),
        commit('b01', 'Read the file in one pass', ['b02']),
        commit('a03', 'Name the steps', ['a04']),
        commit('b02', 'Start the reader', ['a04']),
        commit('a04', 'Tidy the entry point', ['a05'], 'tag: v1.0'),
        commit('a05', 'First commit', []),
    ],
};

const done = () => ({ ok: true });
const adapter = {
    isRepo: () => ({ ok: true, isRepo: true }),
    status: () => ({ ok: true, branch: repo.branch, files: repo.files, ahead: repo.ahead, behind: repo.behind, hasUpstream: true }),
    branches: () => ({ ok: true, branches: [
        { name: 'main', hash: 'a01', isCurrent: true, isRemote: false, upstream: 'origin/main' },
        { name: 'feature/layout', hash: 'c01', isCurrent: false, isRemote: false, upstream: '' },
        { name: 'origin/main', hash: 'a01', isCurrent: false, isRemote: true, upstream: '' },
    ] }),
    log: ({ count, skip }) => ({ ok: true, commits: repo.log.slice(skip, skip + count) }),
    commitFiles: () => ({ ok: true, files: [{ path: 'src/parser.txt', status: 'M' }] }),
    diffFile: ({ path }) => ({ ok: true, before: `one\ntwo\nthree of ${path}\nfour\n`, after: `one\ntwo\nTHREE of ${path}\nfour\nfive\n` }),
    stage: ({ paths }) => {
        for (const f of repo.files) if (paths === 'all' || paths.includes(f.path)) f.staged = true;
        return done();
    },
    unstage: ({ paths }) => {
        for (const f of repo.files) if (paths.includes(f.path)) f.staged = false;
        return done();
    },
    discard: ({ path }) => {
        repo.files = repo.files.filter((f) => f.path !== path);
        return done();
    },
    commit: ({ message }) => {
        const staged = repo.files.filter((f) => f.staged);
        repo.files = repo.files.filter((f) => !f.staged);
        repo.ahead += 1;
        repo.log.unshift(commit(`n${repo.log.length}`, message ?? 'Amended', [repo.log[0].shortHash], `HEAD -> ${repo.branch}`));
        repo.log[1].refs = '';
        return { ok: true, hash: repo.log[0].shortHash, staged: staged.length };
    },
    fetch: done,
    pull: () => ({ ok: false, error: 'CONFLICT (content): Merge conflict in merge_me.txt', conflicts: true }),
    push: done,
    checkout: done,
    createBranch: done,
    deleteBranch: done,
    merge: done,
    rebase: done,
    stash: done,
    stashPop: done,
    cherryPick: done,
    tags: () => ({ ok: true, tags: [{ name: 'v1.0', hash: 'a04' }, { name: 'v2.0', hash: 'a01' }] }),
    createTag: done,
    deleteTag: done,
    remotes: () => ({ ok: true, remotes: [{ name: 'origin', url: 'https://example.org/repo.git' }] }),
    addRemote: done,
    removeRemote: done,
};

window.panel = createGitPanel(document.getElementById('panel'), { adapter, graphExpanded: true, pollInterval: 0 });
window.graph = createGitGraph(document.getElementById('graph'), { adapter, showRemoteRefs: true });
window.viewer = createDiffViewer(document.getElementById('diff'), {
    before: Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'),
    after: Array.from({ length: 30 }, (_, i) => (i === 4 || i === 22 ? `line ${i + 1} changed` : `line ${i + 1}`)).join('\n'),
    diff: '--- a/x\n+++ b/x\n@@ -5 +5 @@\n-line 5\n+line 5 changed\n',
    fields: [{ name: 'Priority', from: 'low', to: 'high' }, { name: 'Due date', from: '', to: '2027-01-15' }],
});
window.adapter = adapter;
window.ready = true;
