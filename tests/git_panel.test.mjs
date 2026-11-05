/**
 * @flexdesk/git — THE COMMIT GRAPH AND THE PANEL, over a fake adapter that
 * records every call. What goes to the adapter here is the written contract in
 * docs/components/git.md, payload for payload.
 *
 *   §1  computeGraphLanes: a line, a branch and a merge, lanes passing through
 *       a row, a branch tip has nothing coming in, a prefix's rows don't move
 *   §2  parseGitRefs: head, tag, a local feature/x is not a remote
 *   §3  the graph draws: one row and SVG a commit, edges by lane colour class,
 *       pills, remote pills only when asked, the message when empty or refused
 *   §4  the graph pages: the sentinel, the next page's skip, the lanes widen,
 *       the last page stops; refresh with nothing new draws nothing
 *   §5  the graph's menu: what the adapter can do, each payload, onChanged;
 *       View Changes opens one file, or lists several
 *   §6  the panel's states: no adapter, not a repository (Initialize), a
 *       required method missing, a status that fails, setAdapter
 *   §7  the panel's parts: branch, badges, the file list, stage/unstage/discard
 *       payloads, an untracked file can be staged and deleting it says so,
 *       onOpenDiff, the default diff window, onCountChange
 *   §8  committing: nothing staged stages all, amend does not, an empty message,
 *       commit and push, commit and sync stop at the first failure, the message
 *       survives a failure and a status change
 *   §9  the menus: offered by capability; push sets an upstream when there is
 *       none; merge, rebase, continue, abort; stash; remotes; tags; delete
 *       branch, forced on refusal
 *  §10  polling: every interval, stops, never overlaps; a failure is a toast
 *       and the panel still works; destroy
 *
 *     node tests/git_panel.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('git panel');
const { check, ok, section, done, document, window, tick, click } = T;

// jsdom has no IntersectionObserver; this one is driven by hand.
const observers = [];
globalThis.IntersectionObserver = class {
    constructor(cb, options) { this.cb = cb; this.options = options; this.targets = []; this.live = true; observers.push(this); }
    observe(el) { this.targets.push(el); }
    disconnect() { this.live = false; }
    fire() { this.cb([{ isIntersecting: true, target: this.targets[0] }]); }
};
const liveObservers = () => observers.filter((o) => o.live);

const { computeGraphLanes, parseGitRefs, createGitGraph } = await import('../src/git/git_graph.js');
const { createGitPanel } = await import('../src/git/git_panel.js');
const { setToastBus } = await import('../src/ui/components/toast.js');
const { hideContextMenu } = await import('../src/ui/components/context_menu.js');

const toasts = [];
setToastBus({ emit: (name, payload) => toasts.push({ name, ...payload }) });

const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const commit = (hash, parents = [], extra = {}) => ({
    hash, shortHash: hash.slice(0, 7), author: 'A Person', email: 'a@example.org', timestamp: 1700000000,
    subject: `subject of ${hash}`, refs: '', parentHashes: parents, ...extra,
});

/** A complete adapter, recording calls; `over` replaces or (with null) removes methods. */
function fakeAdapter(over = {}) {
    const calls = [];
    const state = {
        status: { ok: true, branch: 'main', ahead: 2, behind: 1, hasUpstream: true, files: [
            { path: 'src/a.txt', status: 'M', staged: false },
            { path: 'b.txt', status: 'A', staged: true },
            { path: 'new.txt', status: 'U', staged: false },
        ] },
        branches: { ok: true, branches: [
            { name: 'main', hash: 'aaa', isCurrent: true, isRemote: false, upstream: 'origin/main' },
            { name: 'feature/x', hash: 'bbb', isCurrent: false, isRemote: false, upstream: '' },
            { name: 'origin/main', hash: 'aaa', isCurrent: false, isRemote: true, upstream: '' },
        ] },
        commits: [commit('c1', ['c0']), commit('c0')],
    };
    const ok = (name) => (payload) => { calls.push([name, payload]); return { ok: true }; };
    const adapter = {
        isRepo: () => ({ ok: true, isRepo: true }),
        init: ok('init'),
        status: () => { calls.push(['status']); return state.status; },
        branches: () => state.branches,
        log: ({ count, skip }) => {
            calls.push(['log', { count, skip }]);
            return { ok: true, commits: state.commits.slice(skip, skip + count) };
        },
        stage: ok('stage'), unstage: ok('unstage'), discard: ok('discard'),
        commit: (p) => { calls.push(['commit', p]); return { ok: true, hash: 'abc' }; },
        fetch: ok('fetch'), pull: ok('pull'), push: ok('push'),
        checkout: ok('checkout'), createBranch: ok('createBranch'), deleteBranch: ok('deleteBranch'),
        merge: ok('merge'), rebase: ok('rebase'),
        stash: ok('stash'), stashPop: ok('stashPop'),
        cherryPick: ok('cherryPick'),
        tags: () => ({ ok: true, tags: [{ name: 'v1', hash: 'aaa' }] }),
        createTag: ok('createTag'), deleteTag: ok('deleteTag'),
        remotes: () => ({ ok: true, remotes: [{ name: 'origin', url: 'https://example.org/r.git' }] }),
        addRemote: ok('addRemote'), removeRemote: ok('removeRemote'),
        commitFiles: ({ hash }) => { calls.push(['commitFiles', { hash }]); return { ok: true, files: [{ path: 'f.txt', status: 'M' }] }; },
        diffFile: (p) => { calls.push(['diffFile', p]); return { ok: true, before: 'a', after: 'b' }; },
    };
    for (const [k, v] of Object.entries(over)) {
        if (v === null) delete adapter[k];
        else adapter[k] = v;
    }
    return { adapter, calls, state, named: (n) => calls.filter(([c]) => c === n).map(([, p]) => p) };
}

const host = () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
};

/** Open a dropdown from its trigger and press the option with this label. */
const pickOption = async (trigger, label) => {
    click(trigger);
    const menu = [...document.querySelectorAll('.twm-action-dropdown-menu')].find((m) => !m.hidden);
    const option = [...menu.querySelectorAll('.twm-action-dropdown-option')]
        .find((o) => o.querySelector('.twm-option-label').textContent === label);
    if (!option) throw new Error(`no option ${label}: ${menu.textContent}`);
    click(option);
    await settle();
};
const menuLabels = (trigger) => {
    click(trigger);
    const menu = [...document.querySelectorAll('.twm-action-dropdown-menu')].find((m) => !m.hidden);
    const labels = menu ? [...menu.querySelectorAll('.twm-option-label')].map((o) => o.textContent) : [];
    click(trigger);
    return labels;
};
const itemText = (b) => [...b.querySelectorAll('span')].at(-1).textContent.trim();
const contextItems = () => [...document.querySelectorAll('.twm-context-menu button')].map(itemText);
const pickContext = async (label) => {
    const item = [...document.querySelectorAll('.twm-context-menu button')].find((b) => itemText(b).includes(label));
    if (!item) throw new Error(`no context item ${label}: ${contextItems()}`);
    click(item);
    await settle();
};
/** Answer the open form: type the values and press its submit button. */
const answerForm = async (values) => {
    const form = [...document.querySelectorAll('.twm-modal__form')].at(-1);
    for (const [name, value] of Object.entries(values)) {
        const field = form.querySelector(`[name="${name}"]`);
        field.value = value;
        field.dispatchEvent(new window.Event('input', { bubbles: true }));
        field.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
    form.querySelector('button[type="submit"]').click();
    await settle();
};
/** Answer the open confirm dialog. */
const answerConfirm = async (yes) => {
    const buttons = [...document.querySelectorAll('.twm-modal__actions button')];
    const b = yes ? buttons.at(-1) : buttons.find((x) => x.textContent === 'Cancel');
    b.click();
    await settle();
};

section('§1 computeGraphLanes');
{
    const line = computeGraphLanes([commit('c', ['b']), commit('b', ['a']), commit('a')]);
    check('a straight line stays in lane 0', line.rows.map((r) => r.lane), [0, 0, 0]);
    check('the tip has nothing coming in', line.rows[0].hasChild, false);
    check('the middle has one in, one out', [line.rows[1].hasChild, line.rows[1].outputLanes],
        [true, [{ lane: 0, parentHash: 'a' }]]);
    check('the root has nothing going out', line.rows[2].outputLanes, []);
    check('one lane', line.laneCount, 1);

    // m merges s into a's line:  m ── a ── o
    //                             └─ s ───┘
    const merge = computeGraphLanes([commit('m', ['a', 's']), commit('a', ['o']), commit('s', ['o']), commit('o')]);
    check('the merge has two ways out', merge.rows[0].outputLanes, [
        { lane: 0, parentHash: 'a' }, { lane: 1, parentHash: 's' }]);
    check('the second parent\'s lane runs through the first parent\'s row', merge.rows[1].passLanes, [1]);
    check('nothing passes the merge itself', merge.rows[0].passLanes, []);
    check('the side lane joins the line it forked from', merge.rows[2].outputLanes, [{ lane: 0, parentHash: 'o' }]);
    check('the fork point is in that line', merge.rows[3].lane, 0);
    check('two lanes', merge.laneCount, 2);

    // Two tips on one history: the second tip takes a new lane until they join.
    const tips = computeGraphLanes([commit('t1', ['o']), commit('t2', ['o']), commit('o')]);
    check('a second tip takes its own lane', tips.rows.map((r) => r.lane), [0, 1, 0]);
    check('its line into the common parent joins lane 0', tips.rows[1].outputLanes[0].lane, 0);
    check('the first tip\'s lane passes the second tip', tips.rows[1].passLanes, [0]);

    const all = [commit('m', ['a', 's']), commit('a', ['o']), commit('s', ['o']), commit('o', ['r']), commit('r')];
    check('a longer list does not move the rows of a shorter one',
        computeGraphLanes(all.slice(0, 3)).rows, computeGraphLanes(all).rows.slice(0, 3));
    check('nothing', computeGraphLanes([]), { rows: [], laneCount: 1 });
}

section('§2 parseGitRefs');
check('every kind', parseGitRefs('HEAD -> main, tag: v1.0, origin/main, feature/x', new Set(['origin/main'])), [
    { name: 'main', type: 'head' }, { name: 'v1.0', type: 'tag' },
    { name: 'origin/main', type: 'remote' }, { name: 'feature/x', type: 'branch' }]);
check('a detached HEAD is shown', parseGitRefs('HEAD, tag: v1'), [{ name: 'HEAD', type: 'head' }, { name: 'v1', type: 'tag' }]);
check('none', [parseGitRefs(''), parseGitRefs(undefined)], [[], []]);

section('§3 the graph draws');
{
    const f = fakeAdapter();
    f.state.commits = [
        commit('m', ['a', 's'], { refs: 'HEAD -> main, origin/main, tag: v1, feature/x' }),
        commit('a', ['o']), commit('s', ['o']), commit('o'),
    ];
    const graph = createGitGraph(host(), { adapter: f.adapter });
    await settle();
    const rows = [...graph.el.querySelectorAll('.twm-git-graph__row')];
    check('one row and one svg a commit', [rows.length, graph.el.querySelectorAll('svg.twm-git-graph__svg').length], [4, 4]);
    check('the subject, as text', rows[1].querySelector('.twm-git-graph__subject').textContent, 'subject of a');
    check('pills without the remote', [...rows[0].querySelectorAll('.twm-git-ref')].map((p) => p.className),
        ['twm-git-ref twm-git-ref--head', 'twm-git-ref twm-git-ref--tag', 'twm-git-ref twm-git-ref--branch']);
    ok('the tooltip carries hash, author and subject', /^m — A Person\n.*\n\nsubject of m$/s.test(rows[0].title));
    const merge = rows[0].querySelectorAll('.twm-git-graph__edge');
    check('the merge row draws its two parents', [...merge].map((e) => e.getAttribute('class').split(' ')[1]),
        ['twm-git-lane--0', 'twm-git-lane--1']);
    check('a row a lane passes through draws it straight', [...rows[1].querySelectorAll('.twm-git-graph__edge')]
        .map((e) => e.getAttribute('d'))[0], 'M16.5,0 L16.5,22');
    check('every gutter is as wide as the lanes', rows.map((r) => r.querySelector('svg').getAttribute('width')),
        ['22', '22', '22', '22']);
    ok('the node has no literal colours', !rows[0].querySelector('circle').hasAttribute('fill')
        && !rows[0].querySelector('circle').hasAttribute('stroke'));
    graph.destroy();

    const shown = createGitGraph(host(), { adapter: f.adapter, showRemoteRefs: true });
    await settle();
    ok('showRemoteRefs draws the remote pill', shown.el.querySelector('.twm-git-ref--remote')?.textContent === 'origin/main');
    shown.destroy();

    const none = fakeAdapter();
    none.state.commits = [];
    const empty = createGitGraph(host(), { adapter: none.adapter });
    await settle();
    check('no commits says so', empty.el.textContent, 'No commits yet');
    empty.destroy();

    const refused = createGitGraph(host(), { adapter: fakeAdapter({ log: () => ({ ok: false, error: 'no history' }) }).adapter });
    await settle();
    check('a refused log says why', refused.el.textContent, 'no history');
    refused.destroy();

    const thrown = createGitGraph(host(), { adapter: fakeAdapter({ log: () => { throw new Error('bridge gone'); } }).adapter });
    await settle();
    check('a throwing log says why', thrown.el.textContent, 'bridge gone');
    thrown.destroy();

    const pale = createGitGraph(host(), { adapter: fakeAdapter({ branches: null }).adapter });
    await settle();
    check('without branches the history is still drawn', pale.el.querySelectorAll('.twm-git-graph__row').length, 2);
    pale.destroy();

    const blank = createGitGraph(host(), { adapter: null });
    await settle();
    check('no adapter: nothing', blank.el.children.length, 0);
    blank.setAdapter(f.adapter);
    await settle();
    check('setAdapter reads it', blank.el.querySelectorAll('.twm-git-graph__row').length, 4);
    blank.setAdapter(null);
    await settle();
    check('setAdapter(null) clears it', blank.el.children.length, 0);
    blank.destroy();
}

section('§4 the graph pages');
{
    const f = fakeAdapter();
    // Each commit its own parent line; a second lane opens on the second page.
    const history = Array.from({ length: 5 }, (_, i) => commit(`p${i}`, i < 4 ? [`p${i + 1}`] : []));
    history[3].parentHashes = ['p4', 'side'];
    history.push(commit('side', []));
    f.state.commits = history;
    const graph = createGitGraph(host(), { adapter: f.adapter, pageSize: 2 });
    await settle();
    check('the first page', [f.named('log')[0], graph.el.querySelectorAll('.twm-git-graph__row').length],
        [{ count: 2, skip: 0 }, 2]);
    ok('a sentinel waits after a full page, rooted in the graph', graph.el.querySelector('.twm-git-graph__sentinel')
        && liveObservers().at(-1).options.root === graph.el);
    const firstRow = graph.el.querySelector('.twm-git-graph__row');
    liveObservers().at(-1).fire();
    await settle();
    check('the next page skips what is loaded', f.named('log')[1], { count: 2, skip: 2 });
    check('rows are added', graph.el.querySelectorAll('.twm-git-graph__row').length, 4);
    ok('rows already drawn are kept', graph.el.querySelector('.twm-git-graph__row') === firstRow);
    check('the first page\'s gutters widen with the lanes', firstRow.querySelector('svg').getAttribute('width'), '22');
    liveObservers().at(-1).fire();
    await settle();
    check('a full page may not be the last', [graph.el.querySelectorAll('.twm-git-graph__row').length,
        !!graph.el.querySelector('.twm-git-graph__sentinel')], [6, true]);
    liveObservers().at(-1).fire();
    await settle();
    check('a short page is', [graph.el.querySelectorAll('.twm-git-graph__row').length,
        graph.el.querySelector('.twm-git-graph__sentinel')], [6, null]);

    const logs = f.named('log').length;
    await graph.refresh();
    check('refresh reads as many as are loaded', f.named('log')[logs], { count: 6, skip: 0 });
    ok('refresh with nothing new redraws nothing', graph.el.querySelector('.twm-git-graph__row') === firstRow);
    f.state.commits = [commit('top', ['p0']), ...history];
    await graph.refresh();
    check('refresh with something new draws it', graph.el.querySelector('.twm-git-graph__subject').textContent, 'subject of top');
    graph.destroy();
    check('destroy disconnects', graph.el.isConnected, false);
}

section('§5 the graph\'s menu');
{
    const f = fakeAdapter();
    let changed = 0;
    const opened = [];
    const graph = createGitGraph(host(), { adapter: f.adapter, onChanged: () => { changed++; }, onOpenDiff: (x) => opened.push(x) });
    await settle();
    const row = graph.el.querySelector('.twm-git-graph__row');
    const open = () => row.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));

    open();
    check('everything on offer', contextItems(), ['Checkout (detached)', 'Create Branch…', 'Copy Commit Hash',
        'Cherry-pick', 'Create Tag…', 'View Changes']);
    await pickContext('Checkout');
    check('checkout', f.named('checkout'), [{ ref: 'c1' }]);
    check('the owner is told', changed, 1);

    open();
    await pickContext('Cherry-pick');
    check('cherry-pick', f.named('cherryPick'), [{ hash: 'c1' }]);

    open();
    await pickContext('Create Branch');
    await answerForm({ name: ' topic ' });
    check('create branch from this commit', f.named('createBranch'), [{ name: 'topic', from: 'c1' }]);

    open();
    await pickContext('Create Tag');
    await answerForm({ name: 'v2' });
    check('create tag on this commit', f.named('createTag'), [{ name: 'v2', hash: 'c1' }]);

    open();
    await pickContext('View Changes');
    check('one file: opened at once', opened, [{ path: 'f.txt', status: 'M', ref: 'c1' }]);

    f.adapter.commitFiles = () => ({ ok: true, files: [{ path: 'one', status: 'M' }, { path: 'two', status: 'D' }] });
    open();
    await pickContext('View Changes');
    check('several: listed', contextItems(), ['one', 'two']);
    await pickContext('two');
    check('the chosen one is opened', opened.at(-1), { path: 'two', status: 'D', ref: 'c1' });

    f.adapter.commitFiles = () => ({ ok: false, error: 'no such commit' });
    toasts.length = 0;
    open();
    await pickContext('View Changes');
    check('a refusal is a toast', toasts.map((t) => t.title), ['Git changes failed']);

    f.adapter.cherryPick = () => ({ ok: false, error: 'CONFLICT', conflicts: true });
    toasts.length = 0;
    open();
    await pickContext('Cherry-pick');
    check('a stop on conflicts says so', [toasts[0].title, toasts[0].message],
        ['Git cherry-pick stopped on conflicts', 'CONFLICT']);
    graph.destroy();

    const small = fakeAdapter({ checkout: null, createBranch: null, cherryPick: null, createTag: null, commitFiles: null });
    const reader = createGitGraph(host(), { adapter: small.adapter });
    await settle();
    reader.el.querySelector('.twm-git-graph__row').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    check('a read-only adapter is offered the hash alone', contextItems(), ['Copy Commit Hash']);
    hideContextMenu();
    reader.destroy();

    const kb = fakeAdapter();
    const keyed = createGitGraph(host(), { adapter: kb.adapter });
    await settle();
    keyed.el.querySelector('.twm-git-graph__row').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    ok('Shift+F10 opens the menu', contextItems().length > 0);
    hideContextMenu();
    keyed.destroy();
}

const panelOf = async (f, options = {}) => {
    const panel = createGitPanel(host(), { adapter: f.adapter, pollInterval: 0, ...options });
    await settle();
    const q = (sel) => panel.el.querySelector(sel);
    const button = (label) => panel.el.querySelector(`button[aria-label="${label}"]`);
    const fileRows = () => [...panel.el.querySelectorAll('.twm-git-panel__file')];
    const rowOf = (name) => fileRows().find((r) => r.querySelector('.twm-git-panel__file-name').textContent === name);
    return { panel, q, button, fileRows, rowOf };
};

section('§6 the panel\'s states');
{
    const none = createGitPanel(host(), { adapter: null, pollInterval: 0, emptyLabel: 'Nothing open' });
    await settle();
    ok('no adapter says the embedder\'s words', none.el.textContent.includes('Nothing open'));
    ok('the main view is hidden', none.el.querySelector('.twm-git-panel__main').hidden);

    const count = [];
    const f = fakeAdapter({ isRepo: () => ({ ok: true, isRepo: false }) });
    const { panel, q } = await panelOf(f, { onCountChange: (n) => count.push(n) });
    ok('not a repository says so', panel.el.textContent.includes('Not a git repository'));
    check('its count is 0', count.at(-1), 0);
    f.adapter.isRepo = () => ({ ok: true, isRepo: true });
    click(q('.twm-git-panel__init'));
    await settle();
    check('Initialize calls init with no payload', f.named('init'), [undefined]);
    ok('then the main view shows', !q('.twm-git-panel__main').hidden && q('.twm-git-panel__empty').hidden);

    const noInit = fakeAdapter({ isRepo: () => ({ ok: true, isRepo: false }), init: null });
    const second = await panelOf(noInit);
    ok('no init method: no button', !second.q('.twm-git-panel__init'));
    second.panel.destroy();

    let threw = '';
    try { createGitPanel(host(), { adapter: { status() {} } }); } catch (e) { threw = e.message; }
    check('a required method missing is said at once', threw, 'createGitPanel: the adapter has no isRepo method');

    const failing = fakeAdapter({ status: () => ({ ok: false, error: 'repository is broken' }) });
    const third = await panelOf(failing);
    ok('a failed status says the backend\'s words', third.panel.el.textContent.includes('repository is broken'));
    third.panel.destroy();

    const gitless = fakeAdapter({ isRepo: () => ({ ok: false, error: 'Git not found on PATH' }) });
    const fourth = await panelOf(gitless);
    ok('a failed isRepo says so too', fourth.panel.el.textContent.includes('Git not found on PATH'));
    fourth.panel.destroy();

    const a = fakeAdapter();
    const b = fakeAdapter();
    b.state.status = { ...b.state.status, branch: 'other', files: [] };
    const sw = await panelOf(a);
    sw.q('.twm-git-panel__commit-box').value = 'half a message';
    sw.panel.setAdapter(b.adapter);
    await settle();
    check('setAdapter shows the other repository', sw.q('.twm-git-panel__branch-label').textContent, 'other');
    check('and clears the message', sw.q('.twm-git-panel__commit-box').value, '');
    check('and the list', sw.fileRows().length, 0);
    sw.panel.setAdapter(null);
    await settle();
    ok('setAdapter(null) shows the empty label', sw.panel.el.textContent.includes('No repository'));
    let threw2 = '';
    try { sw.panel.setAdapter({}); } catch (e) { threw2 = e.message; }
    check('setAdapter checks too', threw2, 'createGitPanel: the adapter has no isRepo or status method');
    sw.panel.destroy();
    panel.destroy();
    none.destroy();
}

section('§7 the panel\'s parts');
{
    const f = fakeAdapter();
    const count = [];
    const opened = [];
    const { panel, q, button, fileRows, rowOf } = await panelOf(f, {
        onCountChange: (n) => count.push(n),
        onOpenDiff: (x) => opened.push(x),
    });
    check('the branch', q('.twm-git-panel__branch-label').textContent, 'main');
    check('ahead and behind', [...panel.el.querySelectorAll('.twm-git-panel__badge')].map((b) => b.textContent), ['↑2', '↓1']);
    check('the count', [q('.twm-git-panel__count').textContent, count.at(-1)], ['3', 3]);
    check('the list', fileRows().map((r) => r.querySelector('.twm-git-panel__status').textContent
        + r.querySelector('.twm-git-panel__file-name').textContent), ['Msrc/a.txt'.replace('src/', ''), 'Ab.txt', 'Unew.txt']);
    check('a folder is shown beside the name', rowOf('a.txt').querySelector('.twm-git-panel__file-dir').textContent, 'src');
    check('the status letter is a class', rowOf('new.txt').querySelector('.twm-git-panel__status').className,
        'twm-git-panel__status twm-git-panel__status--U');

    const actions = (row) => [...row.querySelectorAll('.twm-git-panel__file-btn')].map((b) => b.getAttribute('aria-label'));
    check('unstaged: Stage and Discard', actions(rowOf('a.txt')), ['Stage', 'Discard changes']);
    check('staged: Unstage and Discard', actions(rowOf('b.txt')), ['Unstage', 'Discard changes']);
    check('untracked can be staged', actions(rowOf('new.txt')), ['Stage', 'Discard changes']);

    click(rowOf('a.txt').querySelector('[aria-label="Stage"]'));
    await settle();
    check('stage', f.named('stage'), [{ paths: ['src/a.txt'] }]);
    check('a button does not open the diff', opened, []);
    click(rowOf('b.txt').querySelector('[aria-label="Unstage"]'));
    await settle();
    check('unstage', f.named('unstage'), [{ paths: ['b.txt'] }]);

    click(rowOf('a.txt').querySelector('[aria-label="Discard changes"]'));
    await settle();
    await answerConfirm(true);
    check('discard after asking', f.named('discard'), [{ path: 'src/a.txt', status: 'M' }]);
    click(rowOf('new.txt').querySelector('[aria-label="Discard changes"]'));
    await settle();
    ok('an untracked file: the dialog says delete', document.body.textContent.includes('Delete the untracked file "new.txt"'));
    await answerConfirm(false);
    check('cancelled: nothing', f.named('discard').length, 1);

    click(rowOf('b.txt'));
    check('a row opens its diff', opened, [{ path: 'b.txt', status: 'A', staged: true }]);
    rowOf('a.txt').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    check('so does Enter', opened.at(-1), { path: 'src/a.txt', status: 'M', staged: false });

    f.state.status = { ...f.state.status, files: [{ path: 'n.txt', status: 'R', staged: true, renamedFrom: 'o.txt' }] };
    await panel.refresh();
    check('a rename\'s tooltip names both', rowOf('n.txt').title, 'o.txt → n.txt');
    click(rowOf('n.txt'));
    check('and onOpenDiff gets renamedFrom', opened.at(-1), { path: 'n.txt', status: 'R', staged: true, renamedFrom: 'o.txt' });

    f.state.status = { ...f.state.status, files: [], hasUpstream: false };
    await panel.refresh();
    check('no changes says so', q('.twm-git-panel__no-changes').textContent, 'No changes');
    check('no upstream: no badges', panel.el.querySelectorAll('.twm-git-panel__badge').length, 0);
    ok('the buttons have names', button('Fetch') && button('Pull') && button('Push') && button('More actions'));
    panel.destroy();

    const dflt = fakeAdapter();
    const second = await panelOf(dflt);
    click(second.rowOf('a.txt'));
    await settle();
    check('with no onOpenDiff, the diff window asks diffFile', dflt.named('diffFile'), [{ path: 'src/a.txt', status: 'M' }]);
    check('and draws it', [...document.querySelectorAll('.twm-diff-window')].at(-1).querySelectorAll('.twm-diff__line').length, 2);
    second.panel.destroy();

    const graphed = fakeAdapter();
    const third = await panelOf(graphed);
    check('the graph waits until it is opened', graphed.named('log').length, 0);
    click([...third.panel.el.querySelectorAll('.twm-git-panel__section-head')][1]);
    await settle();
    check('opening it reads the log', graphed.named('log')[0], { count: 50, skip: 0 });
    click([...third.panel.el.querySelectorAll('.twm-git-panel__section-head')][0]);
    ok('Changes collapses', [...third.panel.el.querySelectorAll('.twm-git-panel__section-body')][0].hidden);
    check('aria-expanded follows', [...third.panel.el.querySelectorAll('.twm-git-panel__section-head')][0].getAttribute('aria-expanded'), 'false');
    graphed.state.commits = [commit('c2', ['c1']), ...graphed.state.commits];
    graphed.state.status = { ...graphed.state.status, ahead: 3 };
    await third.panel.refresh();
    await settle();
    check('a status change reaches the graph', third.panel.el.querySelector('.twm-git-graph__subject').textContent, 'subject of c2');
    third.panel.destroy();

    const open = await panelOf(fakeAdapter(), { graphExpanded: true, changesExpanded: false });
    ok('graphExpanded mounts the graph', open.panel.el.querySelector('.twm-git-graph__row'));
    ok('changesExpanded: false starts closed', [...open.panel.el.querySelectorAll('.twm-git-panel__section-body')][0].hidden);
    open.panel.destroy();
}

section('§8 committing');
{
    const f = fakeAdapter();
    f.state.status = { ...f.state.status, files: [{ path: 'a', status: 'M', staged: false }] };
    const { panel, q, button } = await panelOf(f);
    const box = q('.twm-git-panel__commit-box');
    const commitBtn = q('.twm-git-panel__commit-btn');
    const trigger = button('Commit options');
    let focused = 0;
    box.focus = () => { focused++; };

    click(commitBtn);
    await settle();
    check('no message: no commit, the box takes focus', [f.named('commit').length, focused], [0, 1]);

    box.value = '  first  ';
    click(commitBtn);
    await settle();
    check('nothing staged: everything is staged first', f.named('stage'), [{ paths: 'all' }]);
    check('the commit, trimmed', f.named('commit'), [{ message: 'first', amend: false }]);
    check('the box is cleared', box.value, '');

    f.state.status = { ...f.state.status, files: [{ path: 'a', status: 'M', staged: true }] };
    await panel.refresh();
    box.value = 'second';
    box.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await settle();
    check('something staged: no stage; Ctrl+Enter commits', [f.named('stage').length, f.named('commit').at(-1)],
        [1, { message: 'second', amend: false }]);

    await pickOption(trigger, 'Commit (Amend)');
    check('amend with no message keeps the old one: null', f.named('commit').at(-1), { message: null, amend: true });
    check('amend stages nothing', f.named('stage').length, 1);

    box.value = 'pushed';
    await pickOption(trigger, 'Commit & Push');
    check('commit and push', [f.named('commit').at(-1).message, f.named('push')], ['pushed', [{ setUpstream: false }]]);

    box.value = 'synced';
    await pickOption(trigger, 'Commit & Sync');
    check('commit, pull, push', [f.named('commit').at(-1).message, f.named('pull').length, f.named('push').length], ['synced', 1, 2]);

    f.adapter.pull = () => ({ ok: false, error: 'pull refused', conflicts: true });
    toasts.length = 0;
    box.value = 'stops';
    await pickOption(trigger, 'Commit & Sync');
    check('a failed pull stops before push', f.named('push').length, 2);
    check('and says so', [toasts[0].title, toasts[0].message], ['Git commit stopped on conflicts', 'pull refused']);
    check('the commit did happen: the box is clear', box.value, '');

    f.adapter.commit = () => ({ ok: false, error: 'hooks said no' });
    toasts.length = 0;
    box.value = 'keep me';
    click(commitBtn);
    await settle();
    check('a refused commit is a toast', toasts[0].message, 'hooks said no');
    check('and the message stays', box.value, 'keep me');

    f.state.status = { ...f.state.status, ahead: 9 };
    await panel.refresh();
    check('a status change does not touch what is typed', box.value, 'keep me');
    f.adapter.commit = () => ({ ok: true });

    f.state.status = { ...f.state.status, files: [] };
    await panel.refresh();
    toasts.length = 0;
    box.value = 'nothing';
    const commits = f.named('commit').length;
    click(commitBtn);
    await settle();
    check('no changes: says so and commits nothing', [toasts[0].title, f.named('commit').length], ['Nothing to commit', commits]);
    panel.destroy();

    const noCommit = await panelOf(fakeAdapter({ commit: null }));
    ok('no commit method: no commit box', noCommit.q('.twm-git-panel__commit').hidden);
    noCommit.panel.destroy();

    const noStage = fakeAdapter({ stage: null });
    const third = await panelOf(noStage);
    third.q('.twm-git-panel__commit-box').value = 'x';
    click(third.q('.twm-git-panel__commit-btn'));
    await settle();
    check('no stage method: commits straight', noStage.named('commit'), [{ message: 'x', amend: false }]);
    third.panel.destroy();

    const noPush = fakeAdapter({ push: null });
    const fourth = await panelOf(noPush);
    check('no push: the commit menu has none', menuLabels(fourth.button('Commit options')), ['Commit', 'Commit (Amend)']);
    fourth.panel.destroy();
}

section('§9 the menus');
{
    const f = fakeAdapter();
    const { panel, q, button } = await panelOf(f);
    const branch = q('.twm-git-panel__branch');
    const overflow = button('More actions');
    check('the branch menu, escaped text and all', menuLabels(branch),
        ['main', 'feature/x', 'origin/main', 'Create Branch…', 'Delete Branch…']);
    check('the overflow menu', menuLabels(overflow),
        ['Stash', 'Pop Stash', 'Merge…', 'Rebase…', 'Remotes…', 'Tags…']);

    for (const [label, method, payload] of [['Fetch', 'fetch', undefined], ['Pull', 'pull', undefined]]) {
        click(button(label));
        await settle();
        check(`${label} button`, f.named(method), [payload]);
    }
    click(button('Push'));
    await settle();
    check('push with an upstream', f.named('push').at(-1), { setUpstream: false });
    f.state.status = { ...f.state.status, hasUpstream: false };
    await panel.refresh();
    click(button('Push'));
    await settle();
    check('push with none sets one', f.named('push').at(-1), { setUpstream: true });

    await pickOption(branch, 'feature/x');
    check('checkout', f.named('checkout'), [{ ref: 'feature/x' }]);
    await pickOption(branch, 'Create Branch…');
    await answerForm({ name: 'made' });
    check('create branch', f.named('createBranch'), [{ name: 'made' }]);

    await pickOption(overflow, 'Stash');
    check('stash', f.named('stash'), [{}]);
    await pickOption(overflow, 'Pop Stash');
    check('stash pop', f.named('stashPop'), [undefined]);

    await pickOption(overflow, 'Merge…');
    await answerForm({ _choice: 'feature/x' });
    check('merge', f.named('merge'), [{ branch: 'feature/x' }]);
    await pickOption(overflow, 'Rebase…');
    await answerForm({ _choice: 'feature/x' });
    check('rebase', f.named('rebase'), [{ onto: 'feature/x' }]);

    f.state.status = { ...f.state.status, rebasing: true };
    await panel.refresh();
    await pickOption(overflow, 'Continue Rebase');
    check('continue', f.named('rebase').at(-1), { continue: true });
    await pickOption(overflow, 'Abort Rebase');
    check('abort', f.named('rebase').at(-1), { abort: true });

    await pickOption(overflow, 'Remotes…');
    check('the remotes menu', contextItems(), ['Remove origin', 'Add Remote…']);
    await pickContext('Add Remote');
    await answerForm({ name: 'up', url: 'https://example.org/u.git' });
    check('add remote', f.named('addRemote'), [{ name: 'up', url: 'https://example.org/u.git' }]);
    await pickOption(overflow, 'Remotes…');
    await pickContext('Remove origin');
    await answerConfirm(true);
    check('remove remote', f.named('removeRemote'), [{ name: 'origin' }]);

    await pickOption(overflow, 'Tags…');
    check('the tags menu', contextItems(), ['Delete v1', 'Create Tag…']);
    await pickContext('Create Tag');
    await answerForm({ name: 'v2' });
    check('create tag on HEAD', f.named('createTag'), [{ name: 'v2' }]);
    await pickOption(overflow, 'Tags…');
    await pickContext('Delete v1');
    await answerConfirm(true);
    check('delete tag', f.named('deleteTag'), [{ name: 'v1' }]);

    await pickOption(branch, 'Delete Branch…');
    await answerForm({ _choice: 'feature/x' });
    check('delete branch, not forced', f.named('deleteBranch'), [{ name: 'feature/x', force: false }]);
    f.adapter.deleteBranch = (p) => { f.calls.push(['deleteBranch', p]); return p.force ? { ok: true } : { ok: false, error: 'not fully merged' }; };
    await pickOption(branch, 'Delete Branch…');
    await answerForm({ _choice: 'feature/x' });
    await answerConfirm(true);
    check('refused: offered forced', f.named('deleteBranch').slice(-2), [{ name: 'feature/x', force: false }, { name: 'feature/x', force: true }]);
    panel.destroy();

    const named = fakeAdapter();
    named.state.branches = { ok: true, branches: [{ name: '<b>x</b>', hash: 'a', isCurrent: false, isRemote: false, upstream: '' }] };
    const esc = await panelOf(named);
    check('a branch name is text in the menu', menuLabels(esc.q('.twm-git-panel__branch'))[0], '<b>x</b>');
    named.state.branches = { ok: true, branches: [{ name: 'fresh', hash: 'a', isCurrent: false, isRemote: false, upstream: '' }] };
    click(esc.q('.twm-git-panel__branch'));
    await settle();
    ok('opening the menu reads branches made elsewhere', [...document.querySelectorAll('.twm-action-dropdown-menu')]
        .find((m) => !m.hidden).textContent.includes('fresh'));
    click(esc.q('.twm-git-panel__branch'));
    esc.panel.destroy();

    const minimal = { isRepo: () => ({ ok: true, isRepo: true }), status: () => ({ ok: true, branch: 'm', files: [{ path: 'a', status: 'M', staged: false }] }) };
    const min = createGitPanel(host(), { adapter: minimal, pollInterval: 0 });
    await settle();
    ok('isRepo and status alone: a read-only panel', min.el.querySelector('.twm-git-panel__branch-label').textContent === 'm'
        && min.el.querySelectorAll('.twm-git-panel__file-btn').length === 0
        && min.el.querySelector('[aria-label="Fetch"]').hidden && min.el.querySelector('[aria-label="More actions"]').hidden);
    click(min.el.querySelectorAll('.twm-git-panel__section-head')[1]);
    await settle();
    ok('and no graph without log', !min.el.querySelector('.twm-git-graph'));
    min.destroy();
    ok('dropdown menus leave with the panel', [...document.querySelectorAll('.twm-action-dropdown-menu')]
        .every((m) => m.hidden));
}

section('§10 polling and failures');
{
    const f = fakeAdapter();
    const panel = createGitPanel(host(), { adapter: f.adapter, pollInterval: 15 });
    await tick(60);
    ok('it reads again every interval', f.named('status').length >= 2);
    panel.stopPolling();
    await settle();
    const n = f.named('status').length;
    await tick(50);
    check('stopPolling stops it', f.named('status').length, n);
    panel.startPolling();
    await settle();
    check('startPolling reads at once', f.named('status').length > n, true);
    const panelEl = panel.el;
    panel.destroy();
    await settle();
    const m = f.named('status').length;
    await tick(50);
    check('destroy stops it', f.named('status').length, m);
    check('and takes it off the page', panelEl.isConnected, false);

    let inFlight = 0;
    let most = 0;
    const slow = fakeAdapter({ status: async () => {
        inFlight++;
        most = Math.max(most, inFlight);
        await tick(40);
        inFlight--;
        return { ok: true, branch: 'b', files: [] };
    } });
    const overlapping = createGitPanel(host(), { adapter: slow.adapter, pollInterval: 5 });
    await tick(120);
    check('polls never overlap', most, 1);
    overlapping.destroy();

    const quiet = fakeAdapter();
    const q = await panelOf(quiet);
    const statusBefore = quiet.named('status').length;
    await q.panel.refresh();
    check('every refresh reads', quiet.named('status').length, statusBefore + 1);
    quiet.adapter.fetch = () => { throw new Error('bridge gone'); };
    toasts.length = 0;
    click(q.button('Fetch'));
    await settle();
    check('a throw is an error toast', [toasts[0].title, toasts[0].message], ['Git fetch failed', 'bridge gone']);
    ok('the panel is usable after', !q.button('Fetch').disabled && q.q('.twm-git-panel__busy-bar').hidden);
    check('and it read the repository again', quiet.named('status').length, statusBefore + 2);

    let release;
    quiet.adapter.pull = () => new Promise((r) => { release = r; });
    click(q.button('Pull'));
    await tick();
    ok('busy: the bar shows, buttons are off', !q.q('.twm-git-panel__busy-bar').hidden && q.button('Push').disabled);
    release({ ok: true });
    await settle();
    ok('then back', q.q('.twm-git-panel__busy-bar').hidden && !q.button('Push').disabled);
    q.panel.destroy();

    // An answer from the adapter it has left must not draw over the new one.
    let answerOld;
    const stale = fakeAdapter({ status: () => new Promise((r) => { answerOld = r; }) });
    const fresh = fakeAdapter();
    fresh.state.status = { ...fresh.state.status, branch: 'fresh' };
    const sw = createGitPanel(host(), { adapter: stale.adapter, pollInterval: 0 });
    await settle();
    sw.setAdapter(fresh.adapter);
    await settle();
    answerOld({ ok: true, branch: 'stale', files: [] });
    await settle();
    check('a late answer from the old adapter is dropped', sw.el.querySelector('.twm-git-panel__branch-label').textContent, 'fresh');
    sw.destroy();
}

done();
process.exit(0);
