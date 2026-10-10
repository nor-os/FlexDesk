/**
 * 0.6.1 `diff` and `createScrollLock` — TWO TABLES THAT COMPARE.
 *
 * A side-by-side comparison is two DataTables drawn from ONE aligned row list:
 * "now" on one side, "then" on the other, a gap where a side has no row. The
 * table has to say which rows are new, gone or changed and which cells moved,
 * and the two tables have to scroll as one, or row 40 on the left drifts away
 * from row 40 on the right.
 *
 *   §0  without `diff`: no diff class anywhere (0.6.0)
 *   §1  each status draws `twm-dt-diff--<status>`; `cells` marks exactly
 *       those cells `twm-dt-diff__cell--changed`; null and an unknown status
 *       draw nothing
 *   §2  a GAP row draws its cells empty, whatever its values and renderCell
 *   §3  updateRow re-asks `diff`: the old status goes, the new one comes
 *   §4  the stylesheets carry the rules, in both copies
 *   §5  createScrollLock: a scroll on one member moves the others; the echo
 *       of a position the lock wrote moves nobody back; setEnabled(false)
 *       frees them and true brings them level; a joining box starts level
 *   §6  a DataTable given `scrollLock` joins with its body box, leaves on a
 *       re-render (the new box joins) and on dispose
 *
 *     node tests/datatable_diff.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { createScrollLock } from '../src/ui/utils/scroll_lock.js';

const T = await dataTableEnv('datatable diff');
const { check, ok, section, mount, bodyRows, css, done } = T;

const headers = ['Id', 'Name', 'Grade'];
const rows = [['1', 'Alpha', 'A'], ['2', 'Bravo', 'B'], ['3', 'Charlie', 'C'], ['4', 'Delta', 'D']];
const statusOf = (tr) => [...tr.classList].filter((c) => c.startsWith('twm-dt-diff'));
const scroll = (el, top) => {
    el.scrollTop = top;
    el.dispatchEvent(new T.window.Event('scroll'));
};

section('§0 without diff');
{
    const { host } = mount({ headers, rows, pagination: false });
    ok('no row carries a diff class', !host.querySelector('[class*="twm-dt-diff"]'));
}

section('§1 statuses and changed cells');
{
    const plan = {
        0: { status: 'added' },
        1: { status: 'changed', cells: [2] },
        2: { status: 'removed' },
        3: { status: 'bogus' },
    };
    const { host } = mount({ headers, rows, pagination: false, diff: (_row, i) => plan[i] ?? null });
    const trs = bodyRows(host);
    check('each row its status', trs.map(statusOf), [
        ['twm-dt-diff', 'twm-dt-diff--added'],
        ['twm-dt-diff', 'twm-dt-diff--changed'],
        ['twm-dt-diff', 'twm-dt-diff--removed'],
        [],
    ]);
    check('only the named cell is changed',
          [...trs[1].children].map((td) => td.classList.contains('twm-dt-diff__cell--changed')),
          [false, false, true]);
    ok('a Set works as well as an array', (() => {
        const { host: h } = mount({ headers, rows: rows.slice(0, 1), pagination: false,
                                    diff: () => ({ status: 'changed', cells: new Set([0]) }) });
        return bodyRows(h)[0].children[0].classList.contains('twm-dt-diff__cell--changed');
    })());
}

section('§2 a gap is a place, not a value');
{
    let rendered = 0;
    const { host } = mount({
        headers, rows, pagination: false,
        diff: (_row, i) => (i === 1 ? { status: 'gap' } : { status: 'same' }),
        renderCell: (td, value) => { rendered++; td.textContent = `[${value}]`; return true; },
    });
    const gap = bodyRows(host)[1];
    check('its cells are empty', [...gap.children].map((td) => td.textContent), ['', '', '']);
    ok('…and marked as the gap', [...gap.children].every((td) => td.classList.contains('twm-dt-diff__gap')));
    check('renderCell was never asked about the gap', rendered, 3 * 3);
    check('the other rows are drawn as usual', bodyRows(host)[0].children[1].textContent, '[Alpha]');
}

section('§3 updateRow re-asks diff');
{
    const status = { 0: 'added' };
    const { host, table } = mount({ headers, rows, pagination: false,
                                    diff: (_row, i) => (status[i] ? { status: status[i] } : null) });
    status[0] = 'changed';
    table.updateRow(0, ['1', 'Alpha2', 'A']);
    check('the old status went and the new came', statusOf(bodyRows(host)[0]),
          ['twm-dt-diff', 'twm-dt-diff--changed']);
    delete status[0];
    table.updateRow(0, ['1', 'Alpha3', 'A']);
    check('no status, no class', statusOf(bodyRows(host)[0]), []);
}

section('§4 the stylesheets');
for (const sheet of ['base.css', 'flexdesk.css']) {
    const text = css(sheet);
    for (const cls of ['twm-dt-diff--added', 'twm-dt-diff--removed', 'twm-dt-diff--changed',
                       'twm-dt-diff__cell--changed', 'twm-dt-diff__gap']) {
        ok(`${sheet} styles .${cls}`, text.includes(`.${cls}`));
    }
}

section('§5 createScrollLock');
{
    const a = document.createElement('div');
    const b = document.createElement('div');
    const c = document.createElement('div');
    const lock = createScrollLock({ axis: 'y' });
    lock.attach(a);
    lock.attach(b);
    scroll(a, 120);
    check('a scroll on one moves the other', b.scrollTop, 120);
    // b's own scroll event — the echo of what the lock wrote.
    a.scrollTop = 200;  // a moves on before the echo arrives
    b.dispatchEvent(new T.window.Event('scroll'));
    check('the echo moves nobody back', a.scrollTop, 200);
    scroll(b, 40);
    check('the person scrolling the other one moves the first', a.scrollTop, 40);
    lock.setEnabled(false);
    scroll(a, 300);
    check('unlocked, they scroll freely', b.scrollTop, 40);
    lock.setEnabled(true);
    check('locked again, they come level', b.scrollTop, 300);
    lock.attach(c);
    check('a box that joins starts level', c.scrollTop, 300);
    lock.detach(c);
    scroll(a, 10);
    check('a box that left stays where it was', c.scrollTop, 300);
    check('size counts the members', lock.size, 2);
    lock.dispose();
    check('dispose empties the group', lock.size, 0);
}

section('§6 a DataTable joins with its body box');
{
    const lock = createScrollLock();
    const left = mount({ headers, rows, pagination: false, scrollLock: lock });
    const right = mount({ headers, rows, pagination: false, scrollLock: lock });
    check('both tables joined', lock.size, 2);
    const box = (host) => host.querySelector('.twm-preview-table-wrap');
    scroll(box(left.host), 64);
    check('scrolling the left body moves the right', box(right.host).scrollTop, 64);
    left.table.render();
    check('a re-render swaps the box, not the count', lock.size, 2);
    scroll(box(left.host), 32);
    check('…and the new box still leads', box(right.host).scrollTop, 32);
    right.table.dispose();
    check('dispose leaves the group', lock.size, 1);
}

done();
