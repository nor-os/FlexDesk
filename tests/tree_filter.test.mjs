/**
 * BUG-0011 — `filterTree` AND A CATEGORY WHOSE CHILDREN ARE TREE ITEMS.
 *
 * Category visibility was decided only from `.twm-tree-node` descendants, so a
 * category holding `createTreeItem` rows directly was hidden for every filter,
 * the empty one (clearing the filter) included.
 *
 *   §1  items directly in a category: an empty filter shows the category
 *   §2  a matching query shows the category and the matching item only
 *   §3  a query matching nothing hides the category; clearing restores it
 *   §4  categories of nodes behave as before; a mixed category shows for a
 *       match in either a direct item or a node's item
 *   §5  clearing the filter shows empty nodes and empty categories again
 *
 * Against the code before the fix, §1, §2, §3 and §5 fail.
 *
 *     node tests/tree_filter.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('tree filter');
const { check, section, done } = T;
const { createTreeCategory, createTreeNode, createTreeItem, filterTree } =
    await import('../src/ui/components/tree_view.js');

const shown = (el) => el.style.display !== 'none';
const content = (cat) => cat.querySelector(':scope > .twm-collapsible-content');
const children = (node) => node.querySelector(':scope > .twm-tree-node__children');

function flatTree() {
    const container = document.createElement('div');
    const cat = createTreeCategory({ id: 'flat', label: 'Flat', count: 2 });
    content(cat).append(createTreeItem({ id: 'a', label: 'Alpha' }),
                        createTreeItem({ id: 'b', label: 'Beta' }));
    container.append(cat);
    document.body.append(container);
    return { container, cat, items: [...cat.querySelectorAll('.twm-tree-item')] };
}

section('§1 direct items, empty filter');
{
    const { container, cat, items } = flatTree();
    filterTree(container, '');
    check('category shown', shown(cat), true);
    check('both items shown', items.map(shown), [true, true]);
    filterTree(container, null);
    check('null filter shows the category', shown(cat), true);
}

section('§2 direct items, matching query');
{
    const { container, cat, items } = flatTree();
    filterTree(container, 'alp');
    check('category shown', shown(cat), true);
    check('only Alpha shown', items.map(shown), [true, false]);
    check('category expanded on match', content(cat).classList.contains('visible'), true);
}

section('§3 direct items, no match then cleared');
{
    const { container, cat, items } = flatTree();
    filterTree(container, 'zzz');
    check('category hidden', shown(cat), false);
    filterTree(container, '');
    check('category shown again', shown(cat), true);
    check('items shown again', items.map(shown), [true, true]);
}

section('§4 nodes, and a mixed category');
{
    const container = document.createElement('div');
    const nodes = createTreeCategory({ id: 'nodes', label: 'Nodes' });
    const n1 = createTreeNode({ id: 'n1', label: 'N1' });
    children(n1).append(createTreeItem({ id: 'g', label: 'Gamma' }));
    content(nodes).append(n1);
    const mixed = createTreeCategory({ id: 'mixed', label: 'Mixed' });
    const n2 = createTreeNode({ id: 'n2', label: 'N2' });
    children(n2).append(createTreeItem({ id: 'd', label: 'Delta' }));
    content(mixed).append(createTreeItem({ id: 'e', label: 'Epsilon' }), n2);
    container.append(nodes, mixed);
    document.body.append(container);

    filterTree(container, 'gam');
    check('node category shown for a node match', [shown(nodes), shown(n1)], [true, true]);
    check('mixed category hidden', shown(mixed), false);
    check('node expanded on match', children(n1).style.display, 'block');

    filterTree(container, 'eps');
    check('mixed shown for its direct item', shown(mixed), true);
    check('its node hidden', shown(n2), false);
    check('node category hidden', shown(nodes), false);

    filterTree(container, 'del');
    check('mixed shown for its node item', [shown(mixed), shown(n2)], [true, true]);

    filterTree(container, '');
    check('everything shown after clearing', [nodes, n1, mixed, n2].map(shown),
          [true, true, true, true]);
}

section('§5 empty nodes and categories, cleared filter');
{
    const container = document.createElement('div');
    const cat = createTreeCategory({ id: 'empty', label: 'Empty' });
    const node = createTreeNode({ id: 'n', label: 'Empty node' });
    content(cat).append(node);
    const bare = createTreeCategory({ id: 'bare', label: 'Bare' });
    container.append(cat, bare);
    document.body.append(container);

    filterTree(container, 'x');
    check('hidden while filtering', [cat, node, bare].map(shown), [false, false, false]);
    filterTree(container, '');
    check('shown after clearing', [cat, node, bare].map(shown), [true, true, true]);
}

done();
