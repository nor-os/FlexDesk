/**
 * STORY-0121 — A TREE ITEM CAN CARRY INLINE ROW ACTIONS, LIKE A TREE NODE.
 *
 * `createTreeItem({actions})` takes the shape createTreeNode takes
 * ({ id: { icon, title, onClick(id, event) } }) and draws the buttons in
 * `.twm-tree-item__actions` at the row's end.
 *
 *   §1  one `.twm-tree-node__action-btn` per entry, after label and badge,
 *       with data-action, title and its Material Symbols icon
 *   §2  a click runs onClick(id, event) and does not reach the item, so it
 *       does not select it; in a TreeView neither a click nor a double-click
 *       reaches onItemClick / onItemDoubleClick or selects the item; an entry
 *       without onClick is a plain button whose click goes on to the item
 *   §3  without `actions` the markup is what it was: no actions slot
 *   §4  flexdesk.css keeps the slot in one line, takes it out of the row's
 *       height, hides it by opacity (its buttons stay in the tab order) and
 *       shows it on hover, focus within and the selected item; base.css
 *       carries the same rules
 *
 * jsdom applies no stylesheet, so §4 reads the rules as text.
 *
 *     node tests/tree_item_actions.test.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const T = await dataTableEnv('tree item actions');
const { check, ok, section, done } = T;
const { createTreeItem, TreeView } = await import('../src/ui/components/tree_view.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, '..', 'css', 'flexdesk.css'), 'utf8');
const base = readFileSync(join(HERE, '..', 'css', 'base.css'), 'utf8');

const calls = [];
const actions = {
    rename: { icon: 'edit', title: 'Rename', onClick: (id, e) => calls.push(['rename', id, e.type]) },
    delete: { icon: 'delete', title: 'Delete', onClick: (id, e) => calls.push(['delete', id, e.type]) },
};

section('§1 one button per action, at the row\'s end');
const item = createTreeItem({ id: 'a.namespace', label: 'A', badge: { text: '65' }, actions });
const slot = item.querySelector(':scope > .twm-tree-item__actions');
ok('an actions slot directly in the row', slot);
check('it is the row\'s last child, after label and badge', item.lastElementChild, slot);
const buttons = [...(slot?.querySelectorAll('button') ?? [])];
check('one button per entry, in order', buttons.map((b) => b.dataset.action), ['rename', 'delete']);
ok('each is a tree action button', buttons.every((b) => b.classList.contains('twm-tree-node__action-btn')));
check('titles', buttons.map((b) => b.title), ['Rename', 'Delete']);
check('icons', buttons.map((b) => b.querySelector('.material-symbols-outlined')?.textContent), ['edit', 'delete']);
ok('buttons do not submit a form', buttons.every((b) => b.type === 'button'));

section('§2 a click runs its action and stops there');
let itemClicks = 0;
item.addEventListener('click', () => { itemClicks += 1; });
buttons[1].click();
check('onClick(id, event)', calls, [['delete', 'a.namespace', 'click']]);
check('the item never sees the click', itemClicks, 0);

{
    // jsdom has no scrollIntoView; TreeView.select scrolls the selected item into view
    window.HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {};
    const host = document.createElement('div');
    document.body.appendChild(host);
    const seen = [];
    const tree = new TreeView(host, {
        onItemClick: (id) => seen.push(['click', id]),
        onItemDoubleClick: (id) => seen.push(['dblclick', id]),
    });
    const inTree = createTreeItem({ id: 'n.namespace', label: 'N', actions });
    host.appendChild(inTree);
    const del = inTree.querySelector('[data-action="delete"]');
    calls.length = 0;
    del.click();
    del.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    check('in a TreeView the action runs', calls, [['delete', 'n.namespace', 'click']]);
    check('and neither onItemClick nor onItemDoubleClick hears it', seen, []);
    ok('nor is the item selected', !inTree.classList.contains('selected'));

    const bare = createTreeItem({ id: 'm', label: 'M', actions: { info: { icon: 'info', title: 'Info' } } });
    host.appendChild(bare);
    bare.querySelector('[data-action="info"]').click();
    check('an entry without onClick lets the click go on to the item', seen, [['click', 'm']]);
    tree.destroy?.();
    host.remove();
}

section('§3 without actions the markup is unchanged');
const plain = createTreeItem({ id: 'b', label: 'B', badge: { text: '2' } });
ok('no actions slot', !plain.querySelector('.twm-tree-item__actions'));
check('label and badge only', [...plain.children].map((c) => c.className),
    ['twm-tree-item__label', 'twm-tree-item__badge twm-tree-item__badge--muted']);

section('§4 flexdesk.css lays the slot out in one line');
const decl = (selector, prop) => {
    const body = ruleBody(css, selector);
    const m = body && new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
    return m ? m[1].trim() : null;
};
check('one line', decl('.twm-tree-item__actions', 'display'), 'flex');
check('transparent at rest, so its buttons stay in the tab order', decl('.twm-tree-item__actions', 'opacity'), '0');
check('and it takes no pointer at rest', decl('.twm-tree-item__actions', 'pointer-events'), 'none');
check('no height of its own, so the row keeps its height', decl('.twm-tree-item__actions', 'height'), '0');
check('it does not shrink', decl('.twm-tree-item__actions', 'flex-shrink'), '0');
for (const state of ['.twm-tree-item:hover', '.twm-tree-item:focus-within', '.twm-tree-item.selected']) {
    ok(`shown as a row on ${state}`,
        new RegExp(`${state.replace(/[.:]/g, '\\$&')} > \\.twm-tree-item__actions[^{]*\\{\\s*opacity: 1;\\s*pointer-events: auto;`).test(css));
}
const block = (sheet) => sheet.slice(sheet.indexOf('.twm-tree-item__actions {'), sheet.indexOf('pointer-events: auto;', sheet.indexOf('.twm-tree-item__actions {')));
ok('base.css carries the same rules', block(css).length > 0 && block(base) === block(css));

done();
