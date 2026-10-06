/**
 * 0.5.0 `DataTable.mount` and `DataTable.withDefaults` — BUILD AND DRAW, WITH
 * HOUSE DEFAULTS.
 *
 * The constructor draws nothing until `render()`, and a consumer with house
 * rules for every list (compact, sortable, no pager…) wrapped the two lines in
 * a helper of its own, called from 28 places. `mount` is the two lines;
 * `withDefaults` is the house rules, as a real subclass.
 *
 *   §0  the constructor still draws nothing until render() — the 0.4 contract
 *   §1  DataTable.mount constructs AND draws, and returns the instance
 *   §2  withDefaults: defaults under the config, the config wins key by key,
 *       instanceof holds, and mount on the subclass uses them
 *   §3  narrowing again (withDefaults on the subclass) layers, and the base
 *       class is untouched
 *
 * Against 0.4.7, §1–§3 fail (neither static exists).
 *
 *     node tests/mount_defaults.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';

const T = await dataTableEnv('mount defaults');
const { DataTable, check, ok, section, bodyRows } = T;

const headers = ['Name', 'Value'];
const rows = [['a', 1], ['b', 2], ['c', 3]];
const host = () => { const h = document.createElement('div'); document.body.appendChild(h); return h; };

section('§0 the constructor alone draws nothing');
{
    const h = host();
    const t = new DataTable(h, { headers, rows });
    check('no wrapper before render()', h.children.length, 0);
    t.render();
    check('render() draws it', bodyRows(h).length, 3);
}

section('§1 DataTable.mount constructs and draws');
{
    ok('mount is a static function', typeof DataTable.mount === 'function');
    const h = host();
    const t = DataTable.mount?.(h, { headers, rows });
    ok('it returns the DataTable', t instanceof DataTable);
    check('the rows are on screen without a render() call', bodyRows(h).length, 3);
    check('0.4 defaults: normal density', t?.config.mode, 'normal');
}

section('§2 withDefaults: house rules under the config');
{
    ok('withDefaults is a static function', typeof DataTable.withDefaults === 'function');
    const ListTable = DataTable.withDefaults?.({
        mode: 'compact', sortable: true, selectable: false, emptyMessage: 'Nothing here',
    });
    const h = host();
    const t = ListTable?.mount(h, { headers, rows, selectable: true });
    ok('the house class is a DataTable', t instanceof DataTable);
    check('a house default applies', t?.config.mode, 'compact');
    check('another one applies', t?.config.sortable, true);
    check('the config wins key by key', t?.config.selectable, true);
    ok('compact is drawn', h.querySelector('.twm-data-table-component--compact'));
    check('and mount drew the rows', bodyRows(h).length, 3);
    const h2 = host();
    const t2 = ListTable ? new ListTable(h2, { headers, rows: [] }) : null;
    t2?.render();
    check('new on the house class gets the defaults too', t2?.config.emptyMessage, 'Nothing here');
    check('…drawn', h2.querySelector('.data-table__empty-row td')?.textContent, 'Nothing here');
}

section('§3 narrowing layers; the base class is untouched');
{
    const A = DataTable.withDefaults?.({ mode: 'compact', sortable: true });
    const B = A?.withDefaults({ sortable: false, filterable: true });
    const h = host();
    const t = B?.mount(h, { headers, rows });
    check('the outer layer keeps its key', t?.config.mode, 'compact');
    check('the inner layer overrides the outer', t?.config.sortable, false);
    check('the inner layer adds its own', t?.config.filterable, true);
    ok('still a DataTable', t instanceof DataTable);
    const plain = DataTable.mount?.(host(), { headers, rows });
    check('the base class still defaults to normal', plain?.config.mode, 'normal');
    check('…and to not sortable', plain?.config.sortable, false);
}

T.done();
