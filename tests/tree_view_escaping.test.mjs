/**
 * BUG-0013 — THE TREE BUILDERS SHOW TEXT AS TEXT, AND SELECT ANY ID.
 *
 * `createTreeCategory`, `createTreeNode` and `createTreeItem` interpolated the
 * label, the subtitle and the badge text into `innerHTML`, so a dataset named
 * 'A <b>B</b>' drew a bold B and a name carrying `<img onerror>` ran script.
 * `selectItem` (and `TreeView.addNode` / `addItem`) built
 * `[data-item-id="${id}"]` unescaped, so an id containing `"` threw a
 * DOMException.
 *
 *   §1  label, subtitle and badge text are shown literally; no element is
 *       parsed out of them and no handler runs
 *   §2  selectItem finds items whose ids hold `"`, `\`, `]` and a line break
 *   §3  TreeView.addNode / addItem resolve category and node ids the same way
 *   §4  ordinary labels, icons and badges are unchanged
 *
 * Against 0.16.0, §1–§3 fail.
 *
 *     node tests/tree_view_escaping.test.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

const SUITE = 'tree view escaping';
const HERE = dirname(fileURLToPath(import.meta.url));

let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    for (const c of [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log(`${SUITE}: SKIPPED — needs jsdom `
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event']) {
    if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}
dom.window.HTMLElement.prototype.scrollIntoView ||= function scrollIntoView() {};

const {
    createTreeCategory, createTreeNode, createTreeItem, selectItem, TreeView,
} = await import('../src/ui/components/tree_view.js');

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};
const attempt = (fn) => { try { return { value: fn() }; } catch (err) { return { threw: err.name || String(err) }; } };

const MARKUP = 'A <b>B</b>';
const HOSTILE = '<img src=x onerror="globalThis.__pwned = true">';

// ── §1 ────────────────────────────────────────────────────────────────
console.log('§1 label, subtitle and badge text are text');
{
    const cat = createTreeCategory({ id: 'c', label: MARKUP, count: 1 });
    check('category label is literal', cat.querySelector('.twm-tree-category__label').textContent, MARKUP);
    check('category label parses no element', cat.querySelector('.twm-tree-category__label b'), null);

    const node = createTreeNode({ id: 'n', label: MARKUP, count: 2 });
    check('node label is literal', node.querySelector('.twm-tree-node__label').textContent, MARKUP);
    check('node label parses no element', node.querySelector('.twm-tree-node__label b'), null);

    const item = createTreeItem({ id: 'i', label: MARKUP, subtitle: MARKUP, badge: { text: MARKUP, variant: 'fail' } });
    check('item label is literal', item.querySelector('.twm-tree-item__label').textContent, MARKUP);
    check('item subtitle is literal', item.querySelector('.twm-tree-item__subtitle').textContent, MARKUP);
    check('item badge text is literal', item.querySelector('.twm-tree-item__badge').textContent, MARKUP);
    check('item parses no <b> anywhere', item.querySelectorAll('b').length, 0);

    const hostile = createTreeItem({ id: 'h', label: HOSTILE, subtitle: HOSTILE, badge: { text: HOSTILE } });
    document.body.appendChild(hostile);
    check('hostile item parses no <img>', hostile.querySelectorAll('img').length, 0);
    check('hostile label is shown literally', hostile.querySelector('.twm-tree-item__label').textContent, HOSTILE);
    const hostileNode = createTreeNode({ id: 'hn', label: HOSTILE });
    const hostileCat = createTreeCategory({ id: 'hc', label: HOSTILE });
    document.body.append(hostileNode, hostileCat);
    check('hostile node and category parse no <img>',
        hostileNode.querySelectorAll('img').length + hostileCat.querySelectorAll('img').length, 0);
    await new Promise((r) => setTimeout(r, 20));
    check('no onerror handler ran', globalThis.__pwned ?? dom.window.__pwned ?? false, false);
    document.body.textContent = '';
}

// ── §2 ────────────────────────────────────────────────────────────────
console.log('§2 selectItem finds any id');
{
    const ids = ['a"b', 'back\\slash', 'br]acket', 'line\nbreak', 'plain'];
    const container = document.createElement('div');
    const tree = new TreeView(container);
    tree.addCategory({ id: 'cat', label: 'Cat', expanded: false });
    tree.addNode('cat', { id: 'node', label: 'Node', expanded: false });
    for (const id of ids) tree.addItem('node', { id, label: id });
    document.body.appendChild(container);

    for (const id of ids) {
        const r = attempt(() => selectItem(container, id));
        check(`selectItem(${JSON.stringify(id)}) does not throw`, r.threw ?? null, null);
        check(`selectItem(${JSON.stringify(id)}) returns that item`, r.value?.dataset.itemId ?? null, id);
    }
    check('exactly one item is selected', container.querySelectorAll('.twm-tree-item.selected').length, 1);
    check('the parents of the selected item were expanded',
        [container.querySelector('.twm-tree-node__children').style.display,
         container.querySelector('.twm-collapsible-content').classList.contains('visible')],
        ['block', true]);
    const viaClass = attempt(() => tree.select('a"b'));
    check('TreeView.select(\'a"b\') finds it', viaClass.value?.dataset.itemId ?? viaClass.threw, 'a"b');
    check('an unknown id returns null', selectItem(container, 'nope"'), null);
    tree.dispose();
    document.body.textContent = '';
}

// ── §3 ────────────────────────────────────────────────────────────────
console.log('§3 addNode / addItem resolve any category and node id');
{
    const container = document.createElement('div');
    const tree = new TreeView(container);
    tree.addCategory({ id: 'cat"1', label: 'Cat' });
    const node = attempt(() => tree.addNode('cat"1', { id: 'node\\"2', label: 'Node' }));
    check('addNode into a category id with `"` works', node.value?.dataset.nodeId ?? node.threw ?? null, 'node\\"2');
    const item = attempt(() => tree.addItem('node\\"2', { id: 'x', label: 'X' }));
    check('addItem into a node id with `\\"` works', item.value?.dataset.itemId ?? item.threw ?? null, 'x');
    tree.dispose();
}

// ── §4 ────────────────────────────────────────────────────────────────
console.log('§4 ordinary content is unchanged');
{
    const item = createTreeItem({ id: 'f', label: 'Series 1', icon: 'insights', subtitle: 'monthly', badge: { text: '3', variant: 'pass' } });
    check('label', item.querySelector('.twm-tree-item__label').textContent, 'Series 1');
    check('material icon', item.querySelector('.twm-tree-item__icon .material-symbols-outlined').textContent, 'insights');
    check('subtitle', item.querySelector('.twm-tree-item__subtitle').textContent, 'monthly');
    check('badge text and class', [item.querySelector('.twm-tree-item__badge').textContent,
        item.querySelector('.twm-tree-item__badge').className.includes('--pass')], ['3', true]);
    const dot = createTreeItem({ id: 'd', label: 'D', badge: { variant: 'fail' } });
    check('a badge without text is still a status dot', [!!dot.querySelector('[class*="status-dot"]'), !!dot.querySelector('.twm-tree-item__badge')], [true, false]);
    const bare = createTreeItem({ id: 'b', label: 'Bare' });
    check('no subtitle or badge when none given', [!!bare.querySelector('.twm-tree-item__subtitle'), !!bare.querySelector('[class*="badge"]')], [false, false]);
    const sym = createTreeItem({ id: 's', label: 'fn', icon: 'ƒ', isMaterialIcon: false });
    check('symbol icon', sym.querySelector('.twm-tree-item__icon--symbol').textContent, 'ƒ');
    const cat = createTreeCategory({ id: 'c', label: 'Built-in', count: 4 });
    check('category label and count', [cat.querySelector('.twm-tree-category__label').textContent,
        cat.querySelector('.twm-tree-category__count').textContent], ['Built-in', '(4)']);
    const n = createTreeNode({ id: 'n', label: 'Mod', count: 2, actions: { add: { icon: 'add', title: 'Add' } } });
    check('node label, count and action', [n.querySelector('.twm-tree-node__label').textContent,
        n.querySelector('.twm-tree-node__count').textContent,
        n.querySelector('.twm-tree-node__action-btn')?.dataset.action], ['Mod', '(2)', 'add']);
}

if (failures) { console.error(`${SUITE}: ${failures} failure(s)`); process.exit(1); }
console.log(`${SUITE}: all passed`);
