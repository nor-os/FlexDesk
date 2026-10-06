/**
 * 0.5.0 `rowClass`, `rowAttrs`, `cellClass` and `rowIcon` — A ROW SAYS WHAT
 * STATE IT IS IN.
 *
 * A paused key, a dead delivery, a picked row, an error cell: DataTable had no
 * hook that could reach a `<tr>`, so the first consumer ran a loop over
 * `tBodies[0].rows` after every render to set `data-*` attributes and classes —
 * which a re-render, a sort, a filter or `updateRow` silently undid.
 *
 *   §0  without the hooks: a row is `data-preview-row` and nothing else (0.4)
 *   §1  rowClass and rowAttrs reach the <tr>, from the row's data, through a
 *       sort (they follow the row, not the position)
 *   §2  cellClass reaches the <td>, after its type class
 *   §3  rowIcon puts an icon at the start of the first cell — drawn from an
 *       attribute, so it is not in the cell's text, its tooltip or a copy
 *   §4  updateRow asks again: a class the row no longer earns is taken OFF,
 *       and the component's own classes are never touched
 *
 * Against 0.4.7, §1–§4 fail.
 *
 *     node tests/row_decoration.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('row decoration');
const { check, ok, section, mount, bodyRows } = T;

const headers = ['Key', 'State', 'Uses'];
const rows = [['k1', 'live', 3], ['k2', 'paused', 0], ['k3', 'live', 12]];
const hooks = {
    rowClass: (row) => (row[1] === 'paused' ? ['is-off', 'muted'] : null),
    rowAttrs: (row, idx) => ({ 'data-key': row[0], 'data-index': idx, 'data-off': row[1] === 'paused', hidden: false }),
    cellClass: (value, colIdx) => (colIdx === 2 && value === 0 ? 'cell--zero' : ''),
};

section('§0 without the hooks: 0.4');
{
    const { host } = mount({ headers, rows });
    check('a row is data-preview-row and nothing else', bodyRows(host).map((tr) => tr.className),
          ['data-preview-row', 'data-preview-row', 'data-preview-row']);
    check('no data-* attributes', bodyRows(host).map((tr) => tr.attributes.length), [1, 1, 1]);
}

section('§1 rowClass and rowAttrs reach the row, and follow it through a sort');
{
    const { host, table } = mount({ headers, rows, sortable: true, ...hooks });
    const k2 = () => bodyRows(host).find((tr) => tr.dataset.key === 'k2');
    ok('the paused row carries its classes', k2()?.classList.contains('is-off') && k2()?.classList.contains('muted'));
    ok('…beside the component\'s own', k2()?.classList.contains('data-preview-row'));
    check('attributes from the data', [k2()?.dataset.key, k2()?.dataset.index, k2()?.dataset.off], ['k2', '1', '']);
    ok('false and null set nothing', !k2()?.hasAttribute('hidden'));
    check('a live row has no extra class', bodyRows(host)[0].className, 'data-preview-row');
    table.sortBy(2, true);                                  // 0, 3, 12 → k2 first
    check('after a sort the class went with its row', bodyRows(host).map((tr) => tr.classList.contains('is-off')),
          [true, false, false]);
    check('…and so did the attributes', bodyRows(host).map((tr) => tr.dataset.key), ['k2', 'k1', 'k3']);
}

section('§2 cellClass');
{
    const { host } = mount({ headers, rows, ...hooks });
    const zero = bodyRows(host)[1].children[2];
    check('the cell keeps its type class first', zero.classList[0], 'num');
    ok('…and gets its own', zero.classList.contains('cell--zero'));
    ok('a cell that earns none has none', !bodyRows(host)[0].children[2].classList.contains('cell--zero'));
}

section('§3 rowIcon');
{
    const copied = [];
    globalThis.navigator.clipboard = { writeText: async (t) => { copied.push(t); } };
    const { host, table } = mount({
        headers, rows,
        rowIcon: (row) => (row[1] === 'paused' ? { icon: 'pause_circle', title: 'Paused', tone: 'warn' } : null),
    });
    const first = bodyRows(host)[1].children[0];
    const icon = first.querySelector('.twm-dt-row-icon');
    ok('the icon is the first thing in the first cell', icon && first.firstChild === icon);
    check('drawn from an attribute', icon?.dataset.twmIcon, 'pause_circle');
    ok('with the icon font\'s class', icon?.classList.contains('material-symbols-outlined'));
    ok('and its tone', icon?.classList.contains('twm-dt-row-icon--warn'));
    check('its title is its own', [icon?.title, icon?.getAttribute('aria-label')], ['Paused', 'Paused']);
    check('the cell\'s TEXT is still only its value', first.textContent, 'k2');
    ok('a row with no icon has none', !bodyRows(host)[0].querySelector('.twm-dt-row-icon'));
    table.setSelection([1]);
    await table.copyToClipboard('tsv');
    check('a copy carries the value, not the icon\'s name', copied[0], 'Key\tState\tUses\nk2\tpaused\t0');
    const plain = mount({ headers, rows, rowIcon: () => 'star' }).host;
    check('a string is an icon name', bodyRows(plain)[0].querySelector('.twm-dt-row-icon')?.dataset.twmIcon, 'star');
}

section('§4 updateRow asks the hooks again');
{
    const { host, table } = mount({ headers, rows, ...hooks });
    const tr = bodyRows(host)[1];
    table.setSelection([1]);
    table.updateRow(1, ['k2', 'live', 5]);
    ok('the same <tr>', bodyRows(host)[1] === tr);
    ok('a class the row no longer earns is OFF', !tr.classList.contains('is-off') && !tr.classList.contains('muted'));
    ok('an attribute it no longer earns is off', !tr.hasAttribute('data-off'));
    ok('the component\'s own classes are untouched', tr.classList.contains('data-preview-row') && tr.classList.contains('selected'));
    table.updateRow(1, ['k2', 'paused', 0]);
    ok('and earned again, it is back', tr.classList.contains('is-off') && tr.hasAttribute('data-off'));
}

T.done();
