/**
 * bridge_adapter.js — the git adapter the panel and the graph read, over a
 * backend that puts one method per operation on an object (a pywebview `api`, an
 * RPC proxy): the contract method `fooBar` is the backend's `git_foo_bar`
 * (`prefix` changes the `git_`), and every call carries the repository in its
 * payload, so a panel stays on the project it was given.
 *
 *     const adapter = createBridgeGitAdapter(() => bridgeApi(), '/work/project');
 *     createGitPanel(el, { adapter });
 *
 * deskkit's `GitBridge` is the Python side that answers these.
 */

/** Every method of the adapter contract (docs/components/git.md). */
export const GIT_ADAPTER_METHODS = Object.freeze([
    'isRepo', 'status', 'branches', 'log', 'commitFiles', 'diffFile', 'tags', 'remotes',
    'init', 'stage', 'unstage', 'discard', 'commit', 'stash', 'stashPop', 'checkout', 'createBranch',
    'deleteBranch', 'merge', 'rebase', 'cherryPick', 'createTag', 'deleteTag', 'fetch', 'pull', 'push',
    'addRemote', 'removeRemote',
]);

/**
 * @param {Object|(() => Object)} api - The backend object, or a function returning it (read at each call, for a backend that attaches late).
 * @param {string|null} repoPath - The repository's folder; null gives null (no project open).
 * @param {{ prefix?: string }} [options]
 * @returns {Object|null}
 */
export function createBridgeGitAdapter(api, repoPath, { prefix = 'git_' } = {}) {
    if (!repoPath) return null;
    const backend = () => (typeof api === 'function' ? api() : api);
    const backendName = (name) => `${prefix}${name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`;
    return Object.fromEntries(GIT_ADAPTER_METHODS.map((name) => [
        name,
        (payload) => backend()[backendName(name)]({ repoPath, ...payload }),
    ]));
}
