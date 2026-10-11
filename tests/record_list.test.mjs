/**
 * 0.7.0 `createRecordList` — a read-only list of records: a name, a quiet
 * line of facts, pills, verbs whose refusal is a sentence on the screen, a
 * state per record, the open one marked, and one-click opening with
 * DataTable's guards and the keyboard.
 *
 *   §1  a record: the name (and `mono`), the facts joined and the empty parts
 *       left out, a node among them, pills with their tones, verbs as buttons
 *   §2  a refused verb: disabled, the reason on title AND data-refusal AND a
 *       visible line named by the verbs it refuses and describing them; one
 *       reason shared by every verb is said once; a refused verb runs nothing
 *   §3  states (`data-state`, the class), the error line, `activeKey` and
 *       `setActiveKey` (`aria-current`), keys compared as strings
 *   §4  the key (getKey, spec.key, record.id, index), rowClass and rowAttrs —
 *       the post-build loops a consumer no longer writes — and getItem
 *   §5  the empty state: text, a node, a function; gone when records arrive
 *   §6  onActivate: one click opens, with the record and its index; not a
 *       verb, not the second click of a double-click, not a drag that
 *       selected text in the list; `activateOn: 'dblclick'`; Enter on the
 *       record, never Enter on a verb
 *   §7  the keyboard: one tab stop, arrows, Home/End, focus moves the stop;
 *       no tab stops without onActivate or `keyboard`
 *   §8  a redraw keeps the focus on the same record's same verb, and
 *       `refresh(key)` asks `describe` again for that record only
 *   §9  `facts: 'ellipsis'`: one line, the whole line on its title
 *   §10 dispose; the barrel exports it
 *   §11 the stylesheet: every rule is in base.css AND flexdesk.css, nothing
 *       gives the list a height, the name column can shrink, the refusal
 *       line has a colour, and a paused record does not dim its verbs
 *
 *     node tests/record_list.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const T = await dataTableEnv('record list');
const { check, ok, section, click, doubleClick, key, css, done } = T;
const { createRecordList, RecordList } = await import('../src/ui/components/record_list.js');

const keys = [
    { id: 'k1', name: 'ETL loader', key_id: 'tblk_1', live: true, used: '5 Oct' },
    { id: 'k2', name: 'Nightly export', key_id: 'tblk_2', live: false, paused: true, used: null },
    { id: 'k3', name: 'Old key', key_id: 'tblk_3', live: false, revoked: true, used: null },
];
const host = () => { const h = document.createElement('div'); document.body.appendChild(h); return h; };
const items = (list) => [...list.element.querySelectorAll('.twm-record')];
const text = (el) => el?.textContent ?? null;

section('§1 a record');
{
    const pressed = [];
    const list = createRecordList(host(), {
        records: keys,
        describe: (k) => ({
            name: k.name,
            facts: [k.key_id, null, '', k.used ? `last used ${k.used}` : 'never used'],
            pills: [k.live ? { text: 'live', tone: 'success' } : 'off', k.revoked ? { text: 'URL', tone: 'danger', title: 'Readable in a URL' } : null],
            verbs: [{ label: 'Pause', onClick: (r) => pressed.push(['Pause', r.id]) },
                    { label: 'Revoke', danger: true, onClick: (r, ev) => pressed.push(['Revoke', r.id, ev.type]) }],
        }),
    });
    ok('an instance of RecordList', list instanceof RecordList);
    ok('the root is appended to the host', list.element.parentNode && list.element.classList.contains('twm-record-list'));
    const [a, b, c] = items(list);
    check('three records drawn', items(list).length, 3);
    check('the name', text(a.querySelector('.twm-record__name')), 'ETL loader');
    check('facts joined with " — ", null and empty parts left out', text(a.querySelector('.twm-record__facts')), 'tblk_1 — last used 5 Oct');
    check('pills with their tones', [...c.querySelectorAll('.twm-record__pill')].map((p) => [p.textContent, p.className]),
        [['off', 'twm-record__pill'], ['URL', 'twm-record__pill twm-record__pill--danger']]);
    check('a pill title', c.querySelector('.twm-record__pill--danger').title, 'Readable in a URL');
    check('a null pill is left out', b.querySelectorAll('.twm-record__pill').length, 1);
    const verbs = [...a.querySelectorAll('button.twm-record__verb')];
    check('verbs are buttons with FlexDesk\'s classes', verbs.map((v) => v.className),
        ['twm-btn twm-record__verb', 'twm-btn twm-btn--danger twm-record__verb']);
    check('…type=button, data-verb from the label', verbs.map((v) => [v.type, v.dataset.verb]), [['button', 'Pause'], ['button', 'Revoke']]);
    verbs[1].click();
    check('a verb runs with its record and the event', pressed, [['Revoke', 'k1', 'click']]);

    const node = document.createElement('a');
    node.textContent = 'Ada';
    const mono = createRecordList(host(), { records: [{ name: 'credential:use', mono: true, facts: ['by ', node], key: 'x' }] });
    ok('mono name', mono.element.querySelector('.twm-record__name--mono'));
    check('a node among the facts is kept as a node', mono.element.querySelector('.twm-record__facts a')?.textContent, 'Ada');
    check('a string facts line', text(createRecordList(null, { records: [{ name: 'n', facts: 'one line' }] })
        .element.querySelector('.twm-record__facts')), 'one line');
    ok('no facts → no facts line', !createRecordList(null, { records: [{ name: 'n', facts: [null, ''] }] })
        .element.querySelector('.twm-record__facts'));
    check('a record that is a string is its name', text(createRecordList(null, { records: ['plain'] })
        .element.querySelector('.twm-record__name')), 'plain');
    check('an icon on a verb is aria-hidden, the label stays the name',
        (() => {
            const b = createRecordList(null, { records: [{ name: 'n', verbs: [{ label: 'Open', icon: 'open_in_new' }] }] })
                .element.querySelector('.twm-record__verb');
            return [b.querySelector('.material-symbols-outlined').getAttribute('aria-hidden'), b.querySelector('.twm-record__verb-label').textContent];
        })(), ['true', 'Open']);
    check('verbClass as a string replaces the buttons\' classes',
        createRecordList(null, { verbClass: 'my-btn', records: [{ name: 'n', verbs: [{ label: 'Go', danger: true }] }] })
            .element.querySelector('button').className, 'my-btn twm-record__verb');
    check('verbClass as a function',
        createRecordList(null, { verbClass: (v) => (v.danger ? 'b b--danger' : 'b'), records: [{ name: 'n', verbs: [{ label: 'Go', danger: true }] }] })
            .element.querySelector('button').className, 'b b--danger twm-record__verb');
    ok('null/false verbs are left out', createRecordList(null, { records: [{ name: 'n', verbs: [null, false, { label: 'Go' }] }] })
        .element.querySelectorAll('button').length === 1);
}

section('§2 a refused verb is a sentence on the screen');
{
    let ran = 0;
    const list = createRecordList(host(), {
        records: keys,
        describe: (k) => ({
            name: k.name,
            verbs: [
                { label: k.paused ? 'Resume' : 'Pause', onClick: () => ran++,
                  refusal: k.revoked ? 'This key is revoked, and revoking cannot be undone.' : null },
                { label: 'Revoke', danger: true, onClick: () => ran++,
                  refusal: k.revoked ? 'This key is revoked, and revoking cannot be undone.' : (k.paused ? 'Resume it first.' : null) },
            ],
        }),
    });
    const [a, b, c] = items(list);
    const [pause, revoke] = [...c.querySelectorAll('button')];
    ok('both of the revoked key\'s verbs are disabled', pause.disabled && revoke.disabled);
    check('the reason on title and data-refusal', [revoke.title, revoke.dataset.refusal],
        ['This key is revoked, and revoking cannot be undone.', 'This key is revoked, and revoking cannot be undone.']);
    const lines = [...c.querySelectorAll('.twm-record__refusal')];
    check('one reason shared by every verb is said ONCE, as the sentence alone',
        lines.map((l) => [l.textContent, l.dataset.refusalFor]),
        [['This key is revoked, and revoking cannot be undone.', 'Pause, Revoke']]);
    ok('each refused verb is described by the line', pause.getAttribute('aria-describedby') === lines[0].id
        && revoke.getAttribute('aria-describedby') === lines[0].id && lines[0].id);
    ok('the line is inside the record\'s words (under the facts)', lines[0].closest('.twm-record__main'));
    const bl = [...b.querySelectorAll('.twm-record__refusal')];
    check('one verb refused: "<verb>: <reason>"', bl.map((l) => [l.textContent, l.dataset.refusalFor]), [['Revoke: Resume it first.', 'Revoke']]);
    ok('…and the verb that is not refused is enabled, with no reason', !b.querySelector('[data-verb="Resume"]').disabled
        && !b.querySelector('[data-verb="Resume"]').hasAttribute('aria-describedby'));
    ok('a record with no refusal has no refusal block', !a.querySelector('.twm-record__refusals'));
    pause.click();
    revoke.dispatchEvent(new T.window.MouseEvent('click', { bubbles: true }));
    check('a refused verb runs nothing, even when an event reaches it', ran, 0);
}

section('§3 states, the error line and the open record');
{
    const list = createRecordList(host(), {
        records: [
            { id: 1, name: 'live', state: 'active' },
            { id: 2, name: 'paused', state: 'paused' },
            { id: 3, name: 'dead', state: 'dead', error: 'The receiver answered 503 five times.' },
            { id: 4, name: 'odd', state: 'we"ird state' },
        ],
        activeKey: '2',
    });
    const [a, b, c, d] = items(list);
    check('data-state and the class', [a, b, c].map((li) => [li.dataset.state, li.classList.contains(`twm-record--state-${li.dataset.state}`)]),
        [['active', true], ['paused', true], ['dead', true]]);
    check('a state word is sanitised', d.dataset.state, 'weirdstate');
    check('the error line', text(c.querySelector('.twm-record__error')), 'The receiver answered 503 five times.');
    ok('no error → no error line', !a.querySelector('.twm-record__error'));
    ok('activeKey "2" marks the record keyed 2 (keys compare as strings)',
        b.classList.contains('twm-record--active') && b.getAttribute('aria-current') === 'true');
    ok('…and only that one', !a.classList.contains('twm-record--active') && !a.hasAttribute('aria-current'));
    list.setActiveKey(3);
    ok('setActiveKey moves the mark', c.classList.contains('twm-record--active') && c.getAttribute('aria-current') === 'true'
        && !b.classList.contains('twm-record--active') && !b.hasAttribute('aria-current'));
    check('getActiveKey', list.getActiveKey(), 3);
    list.setRecords(list.getRecords());
    ok('the mark survives a redraw', list.getItem(3).classList.contains('twm-record--active'));
    list.setActiveKey(null);
    check('null clears it', list.element.querySelectorAll('.twm-record--active, [aria-current]').length, 0);
}

section('§4 keys, rowClass, rowAttrs');
{
    const byIndex = createRecordList(null, { records: ['a', 'b'] });
    check('a string record is keyed by its index', items(byIndex).map((li) => li.dataset.recordKey), ['0', '1']);
    const byId = createRecordList(null, { records: [{ id: 7, name: 'x' }, { key: 'k', id: 8, name: 'y' }] });
    check('record.key, else record.id', items(byId).map((li) => li.dataset.recordKey), ['7', 'k']);
    const bySpec = createRecordList(null, { records: [{ id: 7 }], describe: () => ({ name: 'x', key: 'spec' }), getKey: () => 'fn' });
    check('spec.key wins over getKey', items(bySpec)[0].dataset.recordKey, 'spec');
    const byFn = createRecordList(null, { records: [{ id: 7 }], describe: () => ({ name: 'x' }), getKey: (r, i) => `r${r.id}-${i}` });
    check('getKey(record, idx)', items(byFn)[0].dataset.recordKey, 'r7-0');

    const list = createRecordList(null, {
        records: keys,
        describe: (k) => ({ name: k.name }),
        rowClass: (k, i) => (k.live ? ['is-live', `n${i}`] : 'is-off  is-quiet'),
        rowAttrs: (k) => ({ 'data-key-id': k.key_id, 'data-live': k.live, 'aria-label': null, 'data-flag': k.revoked ? true : false }),
    });
    const [a, , c] = items(list);
    check('rowClass: an array', ['is-live', 'n0'].every((n) => a.classList.contains(n)), true);
    check('rowClass: a string of several', ['is-off', 'is-quiet'].every((n) => c.classList.contains(n)), true);
    check('rowAttrs: the attributes, false/null left off, true empty',
        [a.getAttribute('data-key-id'), a.getAttribute('data-live'), a.hasAttribute('aria-label'), a.hasAttribute('data-flag'), c.getAttribute('data-flag')],
        ['tblk_1', '', false, false, '']);
    ok('rowAttrs: a bad name is reported, not thrown', (() => {
        const err = console.error; let said = 0; console.error = () => { said++; };
        try { createRecordList(null, { records: ['x'], rowAttrs: () => ({ 'bad name': 1 }) }); } finally { console.error = err; }
        return said === 1;
    })());
    check('getItem by key', list.getItem('k2'), items(list)[1]);
    check('getItem for a key that is not there', list.getItem('nope'), null);
    ok('two records with one key are reported', (() => {
        const err = console.error; let said = 0; console.error = () => { said++; };
        try { createRecordList(null, { records: [{ id: 1 }, { id: 1 }] }); } finally { console.error = err; }
        return said === 1;
    })());
}

section('§5 the empty state');
{
    const t = createRecordList(host(), { records: [], emptyState: 'No keys yet.' });
    check('text', text(t.element.querySelector('.twm-record-list__empty')), 'No keys yet.');
    ok('the root says it is empty', t.element.classList.contains('twm-record-list--empty'));
    t.setRecords([{ name: 'one' }]);
    ok('records arrive → the empty state goes', !t.element.querySelector('.twm-record-list__empty')
        && !t.element.classList.contains('twm-record-list--empty'));
    t.setRecords([]);
    check('…and comes back', t.element.querySelectorAll('.twm-record-list__empty').length, 1);
    const node = document.createElement('em'); node.textContent = 'nothing';
    check('a node', createRecordList(null, { emptyState: node }).element.querySelector('.twm-record-list__empty em')?.textContent, 'nothing');
    check('a function', text(createRecordList(null, { emptyState: () => 'later' }).element.querySelector('.twm-record-list__empty')), 'later');
    ok('no emptyState → nothing drawn', !createRecordList(null, {}).element.querySelector('.twm-record-list__empty'));
}

/** Select the text of one element, as a drag across it would. */
function selectTextOf(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

section('§6 opening a record');
{
    const opened = [];
    const verbs = [];
    const list = createRecordList(host(), {
        records: keys,
        describe: (k) => ({ name: k.name, facts: k.key_id, verbs: [{ label: 'Pause', onClick: (r) => verbs.push(r.id) }] }),
        onActivate: (record, idx, ev) => opened.push([record.id, idx, ev.type]),
    });
    ok('a list that opens is clickable', list.element.classList.contains('twm-record-list--clickable'));
    const [a, b] = items(list);
    click(b.querySelector('.twm-record__facts'));
    check('one click opens, with the record and its index', opened, [['k2', 1, 'click']]);
    opened.length = 0;
    click(a.querySelector('button'));
    check('a verb is its own gesture: the verb ran, the record did not open', [opened, verbs], [[], ['k1']]);
    doubleClick(a.querySelector('.twm-record__name'));
    check('a double-click opens ONCE (its second click is nothing)', opened, [['k1', 0, 'click']]);
    opened.length = 0;
    selectTextOf(a.querySelector('.twm-record__name'));
    click(a.querySelector('.twm-record__name'));
    check('the click that ends a drag selecting text in the list opens nothing', opened, []);
    const outside = document.createElement('p'); outside.textContent = 'elsewhere'; document.body.appendChild(outside);
    selectTextOf(outside);
    click(a.querySelector('.twm-record__name'));
    check('…a selection elsewhere on the page does not count', opened, [['k1', 0, 'click']]);
    document.getSelection().removeAllRanges();
    opened.length = 0;
    key(b, 'Enter');
    check('Enter on the record opens it', opened, [['k2', 1, 'keydown']]);
    opened.length = 0;
    key(b.querySelector('button'), 'Enter');
    check('Enter on a verb does not open the record', opened, []);
    key(b, 'Enter', { ctrlKey: true });
    check('Ctrl+Enter is not Enter', opened, []);

    const dbl = [];
    const pick = createRecordList(host(), { records: keys, describe: (k) => ({ name: k.name }), activateOn: 'dblclick',
        onActivate: (r, i, ev) => dbl.push([r.id, ev.type]) });
    click(items(pick)[2]);
    check('activateOn "dblclick": a click opens nothing', dbl, []);
    doubleClick(items(pick)[2]);
    check('…a double-click opens once', dbl, [['k3', 'dblclick']]);
    key(items(pick)[2], 'Enter');
    check('…and Enter is not among its gestures', dbl.length, 1);
    const none = createRecordList(host(), { records: keys, describe: (k) => ({ name: k.name }) });
    ok('without onActivate nothing is clickable', !none.element.classList.contains('twm-record-list--clickable'));
}

section('§7 the keyboard');
{
    const list = createRecordList(host(), { records: keys, describe: (k) => ({ name: k.name, verbs: [{ label: 'Pause' }] }),
        onActivate: () => {} });
    const lis = () => items(list);
    check('ONE tab stop, on the first record', lis().map((li) => li.tabIndex), [0, -1, -1]);
    lis()[0].focus();
    key(lis()[0], 'ArrowDown');
    check('ArrowDown focuses the next record', document.activeElement, lis()[1]);
    check('…and moves the tab stop with it', lis().map((li) => li.tabIndex), [-1, 0, -1]);
    key(lis()[1], 'ArrowDown'); key(lis()[2], 'ArrowDown');
    check('ArrowDown stops at the last', document.activeElement, lis()[2]);
    key(lis()[2], 'Home');
    check('Home', document.activeElement, lis()[0]);
    key(lis()[0], 'ArrowUp');
    check('ArrowUp stops at the first', document.activeElement, lis()[0]);
    key(lis()[0], 'End');
    check('End', document.activeElement, lis()[2]);
    lis()[0].querySelector('button').focus();
    check('focusing a verb does NOT move the tab stop (Tab must still find a record ahead)', lis().map((li) => li.tabIndex), [-1, -1, 0]);
    key(lis()[0].querySelector('button'), 'ArrowDown');
    check('an arrow from a verb moves to the next record', document.activeElement, lis()[1]);
    const ev = new T.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    lis()[1].dispatchEvent(ev);
    ok('the arrow is consumed (the page does not scroll)', ev.defaultPrevented);

    const active = createRecordList(host(), { records: keys, describe: (k) => ({ name: k.name }), activeKey: 'k3', keyboard: true });
    check('keyboard:true without onActivate; the tab stop starts on the open record', items(active).map((li) => li.tabIndex), [-1, -1, 0]);
    const plain = createRecordList(host(), { records: keys, describe: (k) => ({ name: k.name }) });
    check('a list that opens nothing has no tab stops', items(plain).map((li) => li.hasAttribute('tabindex')), [false, false, false]);
    items(plain)[0].focus?.();
    key(items(plain)[0], 'ArrowDown');
    ok('…and its arrows do nothing', document.activeElement !== items(plain)[1]);
}

section('§8 a redraw keeps the focus; refresh(key)');
{
    let described = [];
    let tag = 'v1';
    const list = createRecordList(host(), {
        records: keys,
        describe: (k) => { described.push(k.id); return { name: `${k.name} ${tag}`, verbs: [{ label: 'Pause' }, { label: 'Revoke', name: 'revoke' }] }; },
        onActivate: () => {},
    });
    list.getItem('k2').querySelector('[data-verb="revoke"]').focus();
    list.setRecords([keys[2], keys[1], keys[0]]);
    check('after a reordering redraw the focus is on the SAME verb of the SAME record',
        [document.activeElement.dataset.verb, document.activeElement.closest('.twm-record').dataset.recordKey], ['revoke', 'k2']);
    list.focusRecord('k3');
    list.setRecords(keys);
    check('a focused record keeps its focus across a redraw', document.activeElement, list.getItem('k3'));
    check('…and the tab stop', items(list).map((li) => li.tabIndex), [-1, -1, 0]);
    described = [];
    tag = 'v2';
    list.refresh('k2');
    check('refresh(key) asks describe for that record only', described, ['k2']);
    check('…and redraws it', text(list.getItem('k2').querySelector('.twm-record__name')), 'Nightly export v2');
    check('…in its place', items(list).map((li) => li.dataset.recordKey), ['k1', 'k2', 'k3']);
    check('…the others untouched', text(list.getItem('k1').querySelector('.twm-record__name')), 'ETL loader v1');
    list.refresh('k3');
    check('refresh keeps a focused record focused', document.activeElement, list.getItem('k3'));
    check('focusRecord on a missing key says so', list.focusRecord('none'), false);
}

section('§9 facts: "ellipsis"');
{
    const list = createRecordList(null, { facts: 'ellipsis', records: [{ name: 'n', facts: ['one', 'two'] }] });
    ok('the clip class on the root', list.element.classList.contains('twm-record-list--clip'));
    check('the whole line on its title', list.element.querySelector('.twm-record__facts').title, 'one — two');
    ok('the default wraps (no clip class, no title)', !createRecordList(null, { records: [{ name: 'n', facts: 'x' }] })
        .element.classList.contains('twm-record-list--clip'));
    check('factSeparator', text(createRecordList(null, { factSeparator: ' · ', records: [{ name: 'n', facts: ['a', 'b'] }] })
        .element.querySelector('.twm-record__facts')), 'a · b');
}

section('§10 dispose and the barrel');
{
    let opened = 0;
    const h = host();
    const list = createRecordList(h, { records: ['a'], onActivate: () => opened++ });
    const li = items(list)[0];
    list.dispose();
    ok('dispose takes the list off the page', !h.contains(list.element));
    h.appendChild(list.element);
    click(li);
    check('…and its listeners go with it', opened, 0);
    list.setRecords(['b']);
    check('a disposed list draws nothing more', items(list).map((x) => x.textContent), ['a']);
    const barrel = await import('../widgets.js');
    ok('@flexdesk/widgets exports createRecordList and RecordList', barrel.createRecordList === createRecordList && barrel.RecordList === RecordList);
}

section('§11 the stylesheet');
{
    const base = css('base.css');
    const flexdesk = css('flexdesk.css');
    const block = (sheet) => {
        const from = sheet.indexOf('/* ══ RECORD LIST & FACT SHEET (0.7.0)');
        const to = sheet.indexOf('/* ══ end RECORD LIST & FACT SHEET ══ */');
        return from >= 0 && to > from ? sheet.slice(from, to) : null;
    };
    ok('the block is in base.css', block(base));
    check('…and mirrored byte for byte into flexdesk.css', block(flexdesk), block(base));
    const body = (sel) => ruleBody(base, sel) || '';
    ok('the list and a record declare no height', !/(^|[;\s])(height|max-height)\s*:/.test(body('.twm-record-list') + body('.twm-record') + body('.twm-record-list__items')));
    ok('the words can shrink (min-width: 0) and grow', /min-width:\s*0/.test(body('.twm-record__main')) && /flex:\s*1 1/.test(body('.twm-record__main')));
    ok('a record wraps its verbs under its words on a narrow host', /flex-wrap:\s*wrap/.test(body('.twm-record')));
    ok('the refusal line is coloured', /color:/.test(body('.twm-record__refusal')));
    ok('the facts wrap by default (no nowrap on the plain rule)', !/nowrap/.test(body('.twm-record__facts')) && /overflow-wrap:\s*anywhere/.test(body('.twm-record__facts')));
    ok('the clip rule ellipsises', /text-overflow:\s*ellipsis/.test(body('.twm-record-list--clip .twm-record__facts')));
    const dim = ruleBody(base, '.twm-record--state-paused > .twm-record__main, .twm-record--state-paused > .twm-record__pills, .twm-record--state-off > .twm-record__main, .twm-record--state-off > .twm-record__pills, .twm-record--state-dead > .twm-record__main, .twm-record--state-dead > .twm-record__pills');
    ok('a paused, off or dead record dims its words and pills', dim && /opacity/.test(dim));
    ok('…and never its verbs', !/twm-record__verbs\s*[{,][^}]*opacity/.test(block(base) || '') && !/\.twm-record--state-(paused|off|dead)\s*\{[^}]*opacity/.test(block(base) || ''));
    ok('the open record wears the accent edge', /accent-bright/.test(body('.twm-record.twm-record--active')));
    for (const tone of ['info', 'success', 'warn', 'danger', 'muted']) {
        ok(`pill tone ${tone} has a rule`, body(`.twm-record__pill--${tone}`));
    }
}

done();
