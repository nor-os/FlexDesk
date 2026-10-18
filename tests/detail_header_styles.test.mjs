/**
 * BUG-0015 — A DETAIL HEADER'S BADGES AND ACTION BUTTONS ARE STYLED BY THE
 * LIBRARY'S OWN STYLESHEET.
 *
 * `createDetailHeader` emitted `detail-header__badge` and
 * `twm-detail-header__btn detail-header__btn--<variant>`, and flexdesk.css had
 * a rule for none of them (only a stale "moved to components/controls.css"
 * comment). With only FlexDesk's CSS a badge was plain text and every action
 * was a bare browser button, 'primary' and 'danger' indistinguishable.
 *
 *   §1  a badge is `.twm-detail-header__badge` (plus the caller's className),
 *       its icon a `.twm-detail-header__badge-icon`; nothing unprefixed
 *   §2  an action is a `.twm-btn` with `.twm-detail-header__btn` and
 *       `.twm-detail-header__btn--<variant>`; 'primary' and 'danger' wear
 *       `.twm-btn--primary` / `.twm-btn--danger`, 'secondary' (the default)
 *       neither; icon and label are `.twm-btn__glyph` / `.twm-btn__label`
 *   §3  flexdesk.css styles the badge as a pill from tokens, and has the
 *       `.twm-btn` rules §2 relies on, with the two variants differing
 *   §4  updateDetailHeader rebuilds with the same classes
 *
 * jsdom applies no stylesheet, so §3 reads the rules as text.
 * Against the unfixed detail_header.js and flexdesk.css, §1–§4 fail.
 *
 *     node tests/detail_header_styles.test.mjs
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const T = await dataTableEnv('detail header styles');
const { check, ok, section, done } = T;
const { createDetailHeader, updateDetailHeader } = await import('../src/ui/components/detail_header.js');

const sheet = T.css('flexdesk.css');
const unprefixed = (el) => [...(el?.classList ?? [])].filter((c) => c.startsWith('detail-header'));

const config = () => ({
    title: 'Thing',
    badges: [{ text: 'Static' }, { text: 'Live', icon: 'bolt', className: 'my-badge--live' }],
    actions: [
        { key: 'run', label: 'Run', icon: 'play_arrow', variant: 'primary', handler: () => {} },
        { key: 'edit', label: 'Edit', icon: 'edit', handler: () => {} },
        { key: 'delete', label: 'Delete', icon: 'delete', variant: 'danger', handler: () => {} },
    ],
});

function checkHeader(header, tag) {
    section(`§1 badges (${tag})`);
    const badges = [...header.querySelectorAll('.twm-detail-header__title-row > span')]
        .filter((el) => !el.classList.contains('twm-detail-header__icon'));
    check(`${tag}: two badges`, badges.length, 2);
    check(`${tag}: a plain badge is the twm pill`, [...badges[0].classList], ['twm-detail-header__badge']);
    check(`${tag}: its text`, badges[0].textContent, 'Static');
    check(`${tag}: a caller's className joins the pill`,
        [...badges[1].classList], ['twm-detail-header__badge', 'my-badge--live']);
    const bi = badges[1].querySelector('.material-symbols-outlined');
    ok(`${tag}: the badge icon is a twm-detail-header__badge-icon`,
        bi?.classList.contains('twm-detail-header__badge-icon'));
    check(`${tag}: the badge reads icon + text`, badges[1].textContent, 'boltLive');
    for (const b of badges) check(`${tag}: no unprefixed badge class`, unprefixed(b), []);

    section(`§2 actions (${tag})`);
    const btn = (key) => header.querySelector(`button[data-action="${key}"]`);
    const variants = { run: 'primary', edit: 'secondary', delete: 'danger' };
    for (const [key, variant] of Object.entries(variants)) {
        const b = btn(key);
        ok(`${tag}/${key}: a .twm-btn`, b?.classList.contains('twm-btn'));
        ok(`${tag}/${key}: .twm-detail-header__btn`, b?.classList.contains('twm-detail-header__btn'));
        ok(`${tag}/${key}: .twm-detail-header__btn--${variant}`,
            b?.classList.contains(`twm-detail-header__btn--${variant}`));
        check(`${tag}/${key}: no unprefixed class`, unprefixed(b), []);
        ok(`${tag}/${key}: icon is a .twm-btn__glyph`,
            b?.querySelector('.material-symbols-outlined')?.classList.contains('twm-btn__glyph'));
        check(`${tag}/${key}: label is a .twm-btn__label`,
            b?.querySelector('.twm-btn__label')?.textContent,
            { run: 'Run', edit: 'Edit', delete: 'Delete' }[key]);
    }
    ok(`${tag}: primary wears .twm-btn--primary`, btn('run').classList.contains('twm-btn--primary'));
    ok(`${tag}: danger wears .twm-btn--danger`, btn('delete').classList.contains('twm-btn--danger'));
    check(`${tag}: secondary wears no colour variant`,
        [...btn('edit').classList].filter((c) => c.startsWith('twm-btn--')), []);
    ok(`${tag}: primary is not danger`, !btn('run').classList.contains('twm-btn--danger'));
}

const header = createDetailHeader(config());
document.body.appendChild(header);
checkHeader(header, 'create');

section('§2 an action without an icon');
{
    const h = createDetailHeader({ title: 'x', actions: [{ key: 'go', label: 'Go', handler: () => {} }] });
    const b = h.querySelector('button[data-action="go"]');
    check('no empty icon span', b.querySelectorAll('.material-symbols-outlined').length, 0);
    check('just the label', b.textContent, 'Go');
}

section('§3 the stylesheet');
{
    const pill = ruleBody(sheet, '.twm-detail-header__badge');
    ok('a .twm-detail-header__badge rule', pill);
    ok('  a pill: radius from --radius-pill', /border-radius:\s*var\(--radius-pill\)/.test(pill ?? ''));
    ok('  a background from tokens', /background:\s*var\(--/.test(pill ?? ''));
    ok('  a colour from tokens', /(^|[\s;])color:\s*var\(--/.test(pill ?? ''));
    ok('  inline-flex', /display:\s*inline-flex/.test(pill ?? ''));
    ok('a badge-icon rule, compounded for the Material Symbols tie',
        ruleBody(sheet, '.twm-detail-header__badge-icon, .twm-detail-header__badge-icon.material-symbols-outlined'));
    ok('the stale "moved to components/controls.css" comment is gone',
        !sheet.includes('moved to components/controls.css'));

    const base = ruleBody(sheet, '.twm-btn');
    const primary = ruleBody(sheet, '.twm-btn--primary');
    const danger = ruleBody(sheet, '.twm-btn--danger');
    ok('a .twm-btn rule', base);
    ok('a .twm-btn--primary rule', primary);
    ok('a .twm-btn--danger rule', danger);
    const bg = (body) => /background:\s*([^;]+);/.exec(body ?? '')?.[1].trim();
    ok('primary and danger backgrounds differ', bg(primary) && bg(danger) && bg(primary) !== bg(danger));
    ok('primary differs from the plain button', bg(primary) !== bg(base));
    ok('danger differs from the plain button', bg(danger) !== bg(base));
    ok('a .twm-btn__glyph rule', ruleBody(sheet, '.twm-btn__glyph, .twm-btn__glyph.material-symbols-outlined'));
    // The colour variants come after the header rules — equal specificity, so
    // nothing in the header section may undo them.
    ok('no header rule sets a button background',
        !/\.twm-detail-header__btn[^{]*\{[^}]*background/.test(sheet));
}

section('§4 updateDetailHeader');
updateDetailHeader(header, config());
checkHeader(header, 'update');

done();
