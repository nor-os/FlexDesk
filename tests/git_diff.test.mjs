/**
 * @flexdesk/git — THE LINE DIFF AND THE DIFF VIEWER, usable alone.
 *
 *   §1  splitLines: CRLF and LF are one line end; a final line end makes no line
 *   §2  computeLineDiff: numbers, context, gaps, deletions before additions,
 *       `beforeStart`/`afterStart`, null past the limit, a long file with a
 *       small edit compared all the same, [] when the lines are the same
 *   §3  parseUnifiedDiff: numbers from the hunk header, no git headers, a
 *       `---` line inside a hunk is a deletion, meta lines, several files
 *   §4  diffStats
 *   §5  the viewer: a view is offered only when its data is there; the view
 *       chosen by default; the switch; `setView(null)`; `showMessage`; text is
 *       drawn as text, never as markup; custom labels; too long; `destroy`
 *   §6  openDiffWindow: Loading…, then the data, then a refusal or a throw
 *   §7  the barrel exports the names; the stylesheets style the classes in
 *       both copies; nothing writes a data-* attribute
 *
 *     node tests/git_diff.test.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataTableEnv } from './dt_env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T = await dataTableEnv('git diff');
const { check, ok, section, done, document, tick, css } = T;

const {
    splitLines, computeLineDiff, parseUnifiedDiff, diffStats, LINE_DIFF_LIMIT,
} = await import('../src/git/line_diff.js');
const { createDiffViewer } = await import('../src/git/diff_viewer.js');
const { openDiffWindow } = await import('../src/git/diff_window.js');

const brief = (lines) => lines.map((l) => (l.kind === 'gap' ? `~${l.hidden}`
    : l.kind === 'hunk' || l.kind === 'meta' || l.kind === 'file' ? `${l.kind}:${l.text}`
        : `${l.oldLine ?? '_'} ${l.newLine ?? '_'} ${l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}${l.text}`));

section('§1 splitLines');
check('LF', splitLines('a\nb'), ['a', 'b']);
check('CRLF', splitLines('a\r\nb\r\n'), ['a', 'b']);
check('a final line end makes no line', splitLines('a\n'), ['a']);
check('empty, null, undefined', [splitLines(''), splitLines(null), splitLines(undefined)], [[], [], []]);
check('a blank line in the middle stays', splitLines('a\n\nb'), ['a', '', 'b']);

section('§2 computeLineDiff');
check('same lines: nothing', computeLineDiff('a\nb\n', 'a\r\nb'), []);
check('one line changed: deletion first, both numbers',
    brief(computeLineDiff('a\nb\nc\n', 'a\nB\nc\n')),
    ['1 1  a', '2 _ -b', '_ 2 +B', '3 3  c']);
check('added at the end', brief(computeLineDiff('a', 'a\nb')), ['1 1  a', '_ 2 +b']);
check('removed at the start', brief(computeLineDiff('a\nb', 'b')), ['1 _ -a', '2 1  b']);
check('all new', brief(computeLineDiff('', 'a\nb')), ['_ 1 +a', '_ 2 +b']);
check('all gone', brief(computeLineDiff('a', null)), ['1 _ -a']);

const long = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
const edited = long.map((l, i) => (i === 2 || i === 16 ? `${l}!` : l));
check('context 1: two hunks with a gap counting what it left out',
    brief(computeLineDiff(long.join('\n'), edited.join('\n'), { context: 1 })),
    ['2 2  l2', '3 _ -l3', '_ 3 +l3!', '4 4  l4', '~11', '16 16  l16', '17 _ -l17', '_ 17 +l17!', '18 18  l18']);
check('context 0: the changes alone',
    brief(computeLineDiff('a\nb\nc', 'a\nX\nc', { context: 0 })), ['2 _ -b', '_ 2 +X']);
check('context Infinity keeps every line',
    computeLineDiff(long.join('\n'), edited.join('\n'), { context: Infinity }).length, 22);
check('default context is three lines',
    brief(computeLineDiff(long.join('\n'), long.map((l, i) => (i === 10 ? 'X' : l)).join('\n')))[0], '8 8  l8');
check('beforeStart and afterStart number the part as the file',
    brief(computeLineDiff('a', 'b', { beforeStart: 5, afterStart: 7 })), ['5 _ -a', '_ 7 +b']);

const big = Array.from({ length: LINE_DIFF_LIMIT + 5 }, (_, i) => `x${i}`);
const allOther = big.map((l) => `${l}!`);
check('past the limit of differing lines: null', computeLineDiff(big.join('\n'), allOther.join('\n')), null);
const bigEdit = big.slice();
bigEdit[700] = 'changed';
check('a long file with a small edit is compared', diffStats(computeLineDiff(big.join('\n'), bigEdit.join('\n'))),
    { added: 1, removed: 1 });
check('maxLines is an option', computeLineDiff('a\nb', 'c\nd', { maxLines: 1 }), null);

section('§3 parseUnifiedDiff');
const unified = [
    'diff --git a/x.txt b/x.txt',
    'index 123..456 100644',
    '--- a/x.txt',
    '+++ b/x.txt',
    '@@ -2,3 +2,3 @@ heading',
    ' two',
    '-three',
    '--- not a header, a deleted line',
    '+THREE',
    '+++ not a header, an added line',
    '@@ -10 +10 @@',
    '-ten',
    '+TEN',
    '\\ No newline at end of file',
    '',
].join('\n');
check('numbers from the hunk header; no git headers; --- inside a hunk is a line',
    brief(parseUnifiedDiff(unified)), [
        'hunk:@@ -2,3 +2,3 @@ heading',
        '2 2  two',
        '3 _ -three',
        '4 _ --- not a header, a deleted line',
        '_ 3 +THREE',
        '_ 4 +++ not a header, an added line',
        'hunk:@@ -10 +10 @@',
        '10 _ -ten',
        '_ 10 +TEN',
        'meta:\\ No newline at end of file',
    ]);
check('CRLF line ends', brief(parseUnifiedDiff('@@ -1 +1 @@\r\n-a\r\n+b\r\n')), ['hunk:@@ -1 +1 @@', '1 _ -a', '_ 1 +b']);
check('a binary file is a meta line',
    brief(parseUnifiedDiff('diff --git a/p.png b/p.png\nBinary files a/p.png and b/p.png differ\n')),
    ['meta:Binary files a/p.png and b/p.png differ']);
check('several files: a file line before each',
    brief(parseUnifiedDiff('diff --git a/p b/p\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/q b/d/q\n@@ -1 +1 @@\n-c\n+d\n')),
    ['file:p', 'hunk:@@ -1 +1 @@', '1 _ -a', '_ 1 +b', 'file:d/q', 'hunk:@@ -1 +1 @@', '1 _ -c', '_ 1 +d']);
check('nothing to read', parseUnifiedDiff(''), []);

section('§4 diffStats');
check('counts additions and removals only', diffStats(computeLineDiff('a\nb\nc', 'a\nX\nY\nc')), { added: 2, removed: 1 });

section('§5 the viewer');
const mount = (options) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return { host, viewer: createDiffViewer(host, options) };
};
const views = (host) => [...host.querySelectorAll('.twm-diff__view')].map((b) => b.textContent);
const pressed = (host) => [...host.querySelectorAll('.twm-diff__view')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const FIELDS = [{ name: 'Priority', from: 'low', to: 'high' }, { name: 'Owner', from: '', to: null }];
const PAIR = { before: 'a\nb\n', after: 'a\nc\n' };
const RAW = 'diff --git a/x b/x\n@@ -1 +1 @@\n-b\n+c\n';
{
    const { host, viewer } = mount(PAIR);
    check('a pair alone: Text, no switch', [viewer.view(), views(host)], ['text', []]);
    ok('the switch is hidden', host.querySelector('.twm-diff__views').hidden);
    const rows = [...host.querySelectorAll('.twm-diff__line')];
    check('one row a line, by kind', rows.map((r) => r.className.replace('twm-diff__line twm-diff__line--', '')),
        ['context', 'del', 'add']);
    check('each row: old, new, sign, text', [...rows[2].children].map((c) => c.textContent), ['', '2', '+', 'c']);
    viewer.destroy();
    check('destroy takes it off the page', host.children.length, 0);
}
{
    const { host, viewer } = mount({ ...PAIR, diff: RAW, fields: FIELDS });
    check('all three offered, in order', views(host), ['Fields', 'Text', 'Raw']);
    check('a changed field opens on Fields', pressed(host), ['Fields']);
    const grid = host.querySelector('.twm-diff__fields');
    check('name, from and to', [...grid.querySelectorAll('.twm-diff__field-name, .twm-diff__field-from, .twm-diff__field-to')]
        .map((n) => n.textContent), ['Priority', 'low', 'high', 'Owner', '—', '—']);

    let told = null;
    viewer.update({ ...PAIR, diff: RAW, fields: [] });
    check('no changed field: Text by default', viewer.view(), 'text');
    viewer.setView('raw');
    check('setView', [viewer.view(), host.querySelector('.twm-diff__raw').textContent], ['raw', RAW]);
    viewer.update({ ...PAIR, diff: RAW, fields: FIELDS });
    check('a chosen view is kept across an update', viewer.view(), 'raw');
    viewer.setView(null);
    check('setView(null) hands the choice back', viewer.view(), 'fields');
    viewer.update({ before: 'a', after: 'b' });
    check('a chosen view no longer offered gives way', viewer.view(), 'text');
    viewer.destroy();

    const second = mount({ ...PAIR, diff: RAW, onViewChange: (v) => { told = v; } });
    [...second.host.querySelectorAll('.twm-diff__view')][1].click();
    check('a click switches and tells', [second.viewer.view(), told, pressed(second.host)], ['raw', 'raw', ['Raw']]);
}
{
    const { host, viewer } = mount({ diff: RAW });
    check('a diff alone: read for Text, offered as Raw', [viewer.view(), views(host)], ['text', ['Text', 'Raw']]);
    check('no git headers in Text', host.querySelector('.twm-diff__line--hunk').textContent, '@@ -1 +1 @@');
    ok('headers are not drawn', !host.textContent.includes('diff --git'));
    viewer.update({ diff: 'something that is not a unified diff' });
    check('a diff with nothing to read: Raw alone', [viewer.view(), views(host)], ['raw', []]);
    viewer.update({});
    check('no data: says so', host.querySelector('.twm-diff__message').textContent, 'No differences.');
    viewer.update({ before: 'same', after: 'same' });
    check('same text: says so', host.querySelector('.twm-diff__message').textContent, 'No differences.');
    viewer.update({ fields: [] });
    check('no fields changed: says so', host.querySelector('.twm-diff__message').textContent, 'No field changes.');
}
{
    const { host, viewer } = mount({ before: '<img src=x onerror=boom>', after: '<b>bold</b>',
        fields: [{ name: '<i>n</i>', from: '<u>f</u>', to: '<s>t</s>' }], view: 'text' });
    ok('text is drawn as text', !host.querySelector('img, b'));
    viewer.setView('fields');
    ok('fields are drawn as text', !host.querySelector('i, u, s'));
}
{
    const { host, viewer } = mount({ before: 'a\nb', after: 'c\nd', maxLines: 1, diff: '',
        labels: { raw: 'Raw git', text: 'Lines' } });
    check('labels replace the words', views(host), ['Lines', 'Raw git']);
    check('too long says where to look', host.querySelector('.twm-diff__message').textContent,
        'Too long to compare here. See Raw git.');
    viewer.showMessage('Loading…');
    check('showMessage replaces the view and the switch',
        [viewer.view(), host.querySelector('.twm-diff__message').textContent, host.querySelector('.twm-diff__views').hidden],
        [null, 'Loading…', true]);
    viewer.update({ before: 'a', after: 'b' });
    ok('the next update replaces the message', !host.querySelector('.twm-diff__message'));
}

section('§6 openDiffWindow');
{
    let answer;
    openDiffWindow({ title: 'x', load: () => new Promise((r) => { answer = r; }) });
    await tick();
    const windows = () => [...document.querySelectorAll('.twm-diff-window')];
    const win = windows().at(-1);
    check('Loading… first', win.querySelector('.twm-diff__message').textContent, 'Loading…');
    answer({ ok: true, before: 'a', after: 'b', language: 'text' });
    await tick();
    check('then the data', win.querySelectorAll('.twm-diff__line').length, 2);

    openDiffWindow({ title: 'y', load: () => ({ ok: false, error: 'no such file' }) });
    await tick();
    check('a refusal is shown', windows().at(-1).querySelector('.twm-diff__message').textContent, 'no such file');

    openDiffWindow({ title: 'z', load: () => { throw new Error('bridge gone'); } });
    await tick();
    check('a throw is shown', windows().at(-1).querySelector('.twm-diff__message').textContent, 'bridge gone');
}

section('§7 the entry, the stylesheets, the DOM');
{
    const barrel = readFileSync(join(ROOT, 'git.js'), 'utf8');
    ok('git.js re-exports src/git/index.js', /export \* from '\.\/src\/git\/index\.js';/.test(barrel));
    const entry = await import('../git.js');
    for (const name of ['createGitPanel', 'createGitGraph', 'computeGraphLanes', 'parseGitRefs', 'createDiffViewer',
        'openDiffWindow', 'openGitDiffWindow', 'computeLineDiff', 'parseUnifiedDiff', 'splitLines', 'diffStats', 'LINE_DIFF_LIMIT']) {
        ok(`@flexdesk/git exports ${name}`, entry[name] !== undefined);
    }
    check('git_ops.js stays internal', entry.callGit, undefined);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    check('package.json ./git', pkg.exports['./git'], { import: './dist/git.js', development: './git.js' });
    ok('git.js is in the tarball', pkg.files.includes('git.js'));
    const entries = /const ENTRIES = \[([^\]]*)\]/.exec(readFileSync(join(ROOT, 'build.mjs'), 'utf8'))?.[1] ?? '';
    ok('build.mjs builds git', entries.includes("'git'"));

    const source = ['diff_viewer', 'diff_window', 'git_graph', 'git_ops', 'git_panel', 'line_diff']
        .map((f) => readFileSync(join(ROOT, `src/git/${f}.js`), 'utf8')).join('\n');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
    ok('no dataset write and no data-* attribute', !/\.dataset\b|setAttribute\('data-/.test(code));
    ok('no global of an application', !/\bwindow\.|pywebview/.test(code));
    // Built from a variable (`--${kind}`) are checked by their prefix, below; `__init` is a `.twm-btn` with no rule of its own.
    const classes = [...new Set([...code.matchAll(/twm-(?:git|diff)[a-zA-Z0-9_-]*/g)].map((m) => m[0]))]
        .filter((c) => !c.endsWith('-') && c !== 'twm-git-panel__init');
    for (const sheet of ['flexdesk.css', 'base.css']) {
        const text = css(sheet);
        const start = text.indexOf('/* ══ GIT ');
        const end = text.indexOf('/* ══ end GIT ══ */');
        ok(`${sheet}: the section is there`, start >= 0 && end > start);
        const block = text.slice(start, end);
        check(`${sheet}: every class the JS applies has a rule`, classes.filter((c) => !block.includes(`.${c}`)), []);
        for (const c of ['twm-git-lane--0', 'twm-git-lane--7', 'twm-git-ref--head', 'twm-git-ref--tag', 'twm-git-ref--branch',
            'twm-git-ref--remote', 'twm-diff__line--add', 'twm-diff__line--del', 'twm-diff__line--gap', 'twm-diff__line--hunk',
            'twm-diff__line--meta', 'twm-diff__line--file', ...['M', 'A', 'D', 'U', 'R', 'C'].map((s) => `twm-git-panel__status--${s}`)]) {
            ok(`${sheet}: .${c}`, block.includes(`.${c}`));
        }
        ok(`${sheet}: no colour literal in the section`, !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(block));
    }
    const tokens = css('tokens.css');
    for (const t of ['--twm-diff-add-bg', '--twm-diff-add-fg', '--twm-diff-del-bg', '--twm-diff-del-fg',
        ...Array.from({ length: 8 }, (_, i) => `--twm-git-lane-${i}`)]) {
        ok(`tokens.css defines ${t}`, tokens.includes(`${t}:`));
    }
}

done();
process.exit(0);
