/**
 * THE OUTLINE EDITOR IN A REAL BROWSER (36 §8) — what jsdom cannot see,
 * settled in headless Edge with real input over the DevTools protocol.
 *
 *   layout   `elementFromPoint` at each primary control's centre returns that
 *            control: Undo, a consumer's action, Fold all, the find box, the
 *            flow row, a row, its menu, its "+" (while its row is hovered),
 *            an add row, the panel's first field, a port drawn as a setting,
 *            the strip's Go to it; the panel is not covered; a level is 22 px
 *            on the screen, and an invisible "+" catches no press
 *   picker   "+" opened by a real press, inside the viewport, its search box
 *            focused, filtered by real keys, Enter adds where it said; Escape
 *            gives the focus back to the "+"
 *   menu     the step menu by a real press; a refused line drawn with its
 *            reason; real ↓ and Enter move the step; Escape gives the focus back
 *   keys     real Alt+↑, Ctrl+D, Delete, Ctrl+Z on a row; Backspace reaches
 *            the window unprevented and removes nothing
 *   values   "{ }" by a real press: the consumer's groups, a real press inserts
 *            a chip, kept as text
 *   drag     the grip dragged with a REAL pointer: a ghost, a drop line naming
 *            the place, one move, a `dragstart` counter that stays at 0; a
 *            refused place says why and moves nothing; Escape cancels
 *   run      run 57 drawn on the outline: pills, an untaken arm, ×63, the banner
 *   refused  a flow that is not block-shaped: the sentence, a flat list
 *
 *     node demo/flow_outline_probe.mjs [out-dir]      (a node with a global WebSocket)
 *
 * Prints one line per check and exits 1 on any failure; writes screenshots to out-dir.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, key, launchBrowser, openPage, startServer, type } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'flow-outline-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want),
                                        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROW = (id) => `[data-step="${id}"] > .twm-flow-outline__row`;

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1440, height: 1000 });
let page;
try {
    page = await openPage(browser.debugPort, `http://127.0.0.1:${server.port}/demo/flow_outline.html`);
    await page.waitFor('window.__outlineDemo && window.__outlineDemo.ready');
    await page.evaluate('document.fonts.ready.then(() => true)');
    await sleep(300);
    const graph = () => page.evaluate('__outlineDemo.editor.getGraph()');
    const lines = async () => (await graph()).connections.map((c) => `${c.source}.${c.sourcePort}>${c.target}.${c.targetPort}`);
    const has = async (line) => (await lines()).includes(line);
    const mouse = (type_, x, y, buttons = 0) => page.send('Input.dispatchMouseEvent', {
        type: type_, x, y, button: type_ === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: 1 });
    const hover = async (selector) => { const c = await centre(page, selector); await mouse('mouseMoved', c.x, c.y); await sleep(60); return c; };
    const changes = () => page.evaluate('__outlineDemo.counts.changes');
    const reset = async () => { await page.evaluate('__outlineDemo.reset()'); await sleep(100); };
    await page.screenshot(join(OUT, '1-outline.png'));

    console.log('\nlayout — elementFromPoint at each primary control');
    for (const [name, sel] of [
        ['Undo', '[data-action="undo"]'], ['Validate (a consumer\'s action)', '[data-action="validate"]'],
        ['Fold all', '.twm-flow-outline__fold-all'], ['the find box', '.twm-flow-outline__find'],
        ['the flow row', '.twm-flow-outline__row--flow .twm-flow-outline__words'],
        ['a row', `${ROW('save')} .twm-flow-outline__words`], ['a block\'s fold', `${ROW('each')} .twm-flow-outline__fold`],
        ['an add row', '.twm-flow-outline__add'], ['the panel\'s first field', '.twm-flow-panel [data-field="name"] input'],
        ['the strip\'s Go to it', '.twm-flow-strip__go'],
    ]) {
        const c = await centre(page, sel);
        check(`${name} is the element at its centre`, c && c.w > 0 && c.h > 0 && c.hit, JSON.stringify(c));
    }
    await hover(`${ROW('save')} .twm-flow-outline__words`);
    const menu = await centre(page, `${ROW('save')} .twm-flow-outline__menu`);
    check('a row\'s menu is the element at its centre', menu?.hit, JSON.stringify(menu));
    const plus = await centre(page, `${ROW('save')} .twm-flow-outline__gap-plus`);
    check('…and, its row hovered, so is its "+"', plus?.hit && plus.w >= 16, JSON.stringify(plus));
    const opacity = await page.evaluate(`getComputedStyle(document.querySelector('${ROW('save')} .twm-flow-outline__gap')).opacity`);
    same('…which is drawn while its row is hovered', opacity, '1');
    await hover(`${ROW('fetch')} .twm-flow-outline__words`);
    const hidden = await page.evaluate(`(() => { const p = document.querySelector('${ROW('save')} .twm-flow-outline__gap-plus');
        const r = p.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { hitPlus: p.contains(hit), opacity: getComputedStyle(p.parentElement).opacity }; })()`);
    same('a "+" its row is not hovered is not drawn and catches no press', hidden, { hitPlus: false, opacity: '0' });
    const x = await page.evaluate(`[0, 1, 2, 3].map((d) => { const r = document.querySelector('.twm-flow-outline__row--step[style*="--twm-outline-depth: ' + d + '"] .twm-flow-outline__chip'); return r ? Math.round(r.getBoundingClientRect().left) : null; })`);
    same('a level is 22 px on the screen', x.slice(1).map((v, i) => v - x[i]), [22, 22, 22]);
    const panelBox = await centre(page, '.twm-flow-panel');
    check('the panel is not covered at its centre', panelBox?.hit, JSON.stringify(panelBox));

    // Select a step: its panel, its port as a setting.
    const check1 = await centre(page, `${ROW('check')} .twm-flow-outline__words`);
    await click(page, check1.x, check1.y);
    await sleep(80);
    same('a real press selects the row', await page.evaluate('__outlineDemo.editor.selection'), { kind: 'step', id: 'check' });
    for (const [name, sel] of [['the panel\'s title', '.twm-flow-panel__title-input'],
                               ['its first field', '.twm-flow-panel [data-field="method"] select'],
                               ['the error port, drawn as a setting', '.twm-flow-panel [data-field="__arm:error"] input[type="radio"]'],
                               ['where the arm goes after its steps', '.twm-flow-panel [data-field="__exit:error"] input[type="radio"]'],
                               ['Duplicate', '.twm-flow-panel [data-action="duplicate"]']]) {
        const c = await centre(page, sel);
        check(`${name} is the element at its centre`, c?.hit, JSON.stringify(c));
    }
    await page.screenshot(join(OUT, '2-step-selected.png'));

    console.log('\npicker — "+" by a real press');
    await hover(`${ROW('save')} .twm-flow-outline__words`);
    const p2 = await centre(page, `${ROW('save')} .twm-flow-outline__gap-plus`);
    await click(page, p2.x, p2.y);
    await page.waitFor('document.querySelector(".twm-flow-popover--picker")');
    same('it names where the step lands', await page.evaluate('document.querySelector(".twm-flow-picker__where").textContent'),
         'at the top level, after Save the applications');
    check('its search box has the focus', await page.evaluate('document.activeElement === document.querySelector(".twm-flow-picker__input")'));
    const box = await page.evaluate(`(() => { const r = document.querySelector('.twm-flow-popover').getBoundingClientRect();
        const d = document.documentElement; return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: d.clientWidth, vh: d.clientHeight }; })()`);
    check('it is inside the viewport', box.left >= 0 && box.top >= 0 && box.right <= box.vw && box.bottom <= box.vh, JSON.stringify(box));
    await page.screenshot(join(OUT, '3-add-step.png'));
    await type(page, 'log');
    same('real keys filter it', await page.evaluate(`[...document.querySelectorAll('.twm-flow-picker__option')]
        .filter((o) => o.offsetParent).map((o) => o.dataset.entry)`), ['log']);
    await key(page, 'Enter');
    await sleep(80);
    check('Enter adds it where the picker said', await has('save.out>log.in') && await has('log.out>anynew.in'));
    same('…and selects it', await page.evaluate('__outlineDemo.editor.selection.id'), 'log');
    await hover(`${ROW('save')} .twm-flow-outline__words`);
    const p3 = await centre(page, `${ROW('save')} .twm-flow-outline__gap-plus`);
    await click(page, p3.x, p3.y);
    await page.waitFor('document.querySelector(".twm-flow-popover--picker")');
    await key(page, 'Escape');
    check('Escape closes it, and the focus is back on the "+"', await page.evaluate(
        `!document.querySelector('.twm-flow-popover') && document.activeElement === document.querySelector('${ROW('save')} .twm-flow-outline__gap')`));
    await reset();

    console.log('\nmenu — a step\'s menu by a real press');
    await hover(`${ROW('invite')} .twm-flow-outline__words`);
    const m1 = await centre(page, `${ROW('invite')} .twm-flow-outline__menu`);
    await click(page, m1.x, m1.y);
    await page.waitFor('document.querySelector(".twm-flow-popover--menu")');
    const down = await page.evaluate(`(() => { const b = document.querySelector('[data-item="down"]');
        return { text: b.textContent, disabled: b.disabled, h: b.getBoundingClientRect().height }; })()`);
    check('a refused line says why, on the screen', down.disabled && down.text.startsWith('Move down — already last') && down.h > 20,
          JSON.stringify(down));
    const mbox = await page.evaluate(`(() => { const r = document.querySelector('.twm-flow-popover').getBoundingClientRect();
        const d = document.documentElement; return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: d.clientWidth, vh: d.clientHeight }; })()`);
    check('the menu is inside the viewport', mbox.left >= 0 && mbox.top >= 0 && mbox.right <= mbox.vw && mbox.bottom <= mbox.vh, JSON.stringify(mbox));
    const wrap = await centre(page, '[data-item="wrap"]');
    await click(page, wrap.x, wrap.y);
    await sleep(60);
    const sub = await centre(page, '.twm-flow-outline__menu-sub [data-item="wrap:condition"]');
    check('Wrap in opens its flyout, each block the element at its centre', sub?.hit, JSON.stringify(sub));
    await page.screenshot(join(OUT, '4-step-menu.png'));
    await key(page, 'ArrowLeft');
    await key(page, 'Home');
    await key(page, 'Enter');
    await sleep(80);
    check('real Home and Enter choose Move up', await has('each.body>invite.in') && await has('invite.out>check.in'));
    await reset();

    console.log('\nkeys — real keys on a row');
    const s1 = await centre(page, `${ROW('save')} .twm-flow-outline__words`);
    await click(page, s1.x, s1.y);
    await key(page, 'ArrowUp', { mods: ['alt'] });
    await sleep(60);
    check('Alt+↑ moves it up', await has('start.out>save.in'));
    await key(page, 'z', { mods: ['ctrl'] });
    await sleep(60);
    check('Ctrl+Z puts it back', await has('fetch.out>save.in'));
    await key(page, 'd', { mods: ['ctrl'] });
    await sleep(60);
    check('Ctrl+D duplicates it', (await graph()).nodes.some((n) => n.id === 'upsert-rows') || (await graph()).nodes.some((n) => n.id === 'save-2'));
    await key(page, 'Delete');
    await sleep(60);
    check('Delete removes the copy', !(await graph()).nodes.some((n) => n.id === 'save-2'));
    await page.evaluate('window.__bs = null; window.addEventListener("keydown", (e) => { if (e.key === "Backspace") window.__bs = { prevented: e.defaultPrevented }; })');
    const before = (await graph()).nodes.length;
    await key(page, 'Backspace');
    same('Backspace reaches the window unprevented: it is the host\'s', await page.evaluate('window.__bs'), { prevented: false });
    same('…and removes nothing', (await graph()).nodes.length, before);
    await reset();

    console.log('\nvalues — "{ }" by a real press');
    const inv = await centre(page, `${ROW('invite')} .twm-flow-outline__words`);
    await click(page, inv.x, inv.y);
    await sleep(80);
    const ins = await centre(page, '.twm-flow-panel [data-field="url"] .twm-flow-refbox__insert');
    check('the Url field\'s "{ }" is the element at its centre', ins?.hit, JSON.stringify(ins));
    await click(page, ins.x, ins.y);
    await page.waitFor('document.querySelector(".twm-flow-popover--values")');
    same('Insert a value lists what always runs before, nearest first', await page.evaluate(
        `[...document.querySelectorAll('.twm-flow-values__group-name')].map((g) => g.textContent)`),
         ['This row', 'Check eligibility', 'Anything new?', 'Save the applications', 'Fetch new applications', 'Run input', 'Variables']);
    await page.screenshot(join(OUT, '5-insert-a-value.png'));
    const email = await page.evaluate(`(() => { const o = [...document.querySelectorAll('.twm-flow-values__option')]
        .find((x) => x.textContent.startsWith('Email')); const r = o.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await click(page, email.x, email.y);
    await sleep(80);
    same('a real press inserts it, as text', (await graph()).nodes.find((n) => n.id === 'invite').config.url, '${row.email}');
    same('…drawn as a chip', await page.evaluate(`[...document.querySelectorAll('[data-field="url"] [data-ref]')].map((c) => c.textContent)`),
         ['This row › Email']);
    check('…and the demo\'s validator dropped the finding: the row says its summary again', await page.evaluate(
        `!document.querySelector('${ROW('invite')} .twm-flow-outline__summary--error')`));
    await reset();

    console.log('\ndrag — the grip, with a real pointer');
    await page.evaluate('__outlineDemo.counts.dragstart = 0');
    const n0 = await changes();
    // The list scrolls on its own: bring the place into its view first, as a reader would.
    await page.evaluate(`document.querySelector('${ROW('summary')}').scrollIntoView({ block: 'center' })`);
    await sleep(60);
    const tell = await hover(`${ROW('tell')} .twm-flow-outline__words`);
    const grip = await centre(page, `${ROW('tell')} .twm-flow-outline__grip`);
    check('the grip is drawn on its hovered row, at its centre', grip?.hit, JSON.stringify(grip));
    void tell;
    const sum = await centre(page, ROW('summary'));
    await mouse('mousePressed', grip.x, grip.y, 1);
    const target = { x: grip.x + 40, y: sum.y + sum.h / 2 - 3 };
    for (let i = 1; i <= 10; i += 1) {
        await mouse('mouseMoved', grip.x + ((target.x - grip.x) * i) / 10, grip.y + ((target.y - grip.y) * i) / 10, 1);
    }
    await sleep(60);
    const mid = await page.evaluate(`(() => { const g = document.querySelector('.twm-flow-outline__ghost');
        const l = document.querySelector('.twm-flow-outline__drop'); const r = l?.getBoundingClientRect();
        return { ghost: Boolean(g && g.parentElement === document.body), line: l && !l.hidden ? l.textContent : null,
                 lineW: r ? Math.round(r.width) : 0 }; })()`);
    same('mid-drag: a ghost on the body and a drop line naming the place', { ghost: mid.ghost, line: mid.line },
         { ghost: true, line: 'Into Branch 2 · after Write a summary' });
    check('…the line is drawn with a width', mid.lineW > 100, JSON.stringify(mid));
    await page.screenshot(join(OUT, '6-drag.png'));
    await mouse('mouseReleased', target.x, target.y, 0);
    await sleep(100);
    check('the drop moved it: after Write a summary, into the Merge', await has('summary.out>tell.in') && await has('tell.out>merged.in'));
    same('…as exactly one edit', (await changes()) - n0, 1);
    same('no native drag started (dragstart counter)', await page.evaluate('__outlineDemo.counts.dragstart'), 0);
    check('the ghost and the line are gone', await page.evaluate('!document.querySelector(".twm-flow-outline__ghost, .twm-flow-outline__drop")'));
    await reset();
    // A refused place: Check eligibility's arm goes on with the next row, so it may not leave its loop.
    const cgrip = await (async () => { await hover(`${ROW('check')} .twm-flow-outline__words`); return centre(page, `${ROW('check')} .twm-flow-outline__grip`); })();
    const pd = await centre(page, ROW('portaldown'));
    const n1 = await changes();
    await mouse('mousePressed', cgrip.x, cgrip.y, 1);
    for (let i = 1; i <= 10; i += 1) await mouse('mouseMoved', cgrip.x + 3 * i, cgrip.y + ((pd.y + pd.h / 2 - 3 - cgrip.y) * i) / 10, 1);
    await sleep(60);
    const refused = await page.evaluate(`(() => { const l = document.querySelector('.twm-flow-outline__drop');
        return { refused: l?.classList.contains('twm-flow-outline__drop--refused'), text: l?.textContent }; })()`);
    same('a refused place is drawn refused, saying why', refused,
         { refused: true, text: '‘Check eligibility’ goes on with the next item of a loop, so it can only go inside one.' });
    await page.screenshot(join(OUT, '7-drag-refused.png'));
    await mouse('mouseReleased', cgrip.x + 30, pd.y + pd.h / 2 - 3, 0);
    await sleep(80);
    same('…and dropping there changes nothing', (await changes()) - n1, 0);
    // Escape cancels.
    await mouse('mousePressed', cgrip.x, cgrip.y, 1);
    for (let i = 1; i <= 6; i += 1) await mouse('mouseMoved', cgrip.x, cgrip.y + 8 * i, 1);
    await key(page, 'Escape');
    check('Escape takes the ghost away', await page.evaluate('!document.querySelector(".twm-flow-outline__ghost")'));
    await mouse('mouseReleased', cgrip.x, cgrip.y + 48, 0);
    same('…and moves nothing', (await changes()) - n1, 0);
    same('still no native drag', await page.evaluate('__outlineDemo.counts.dragstart'), 0);

    console.log('\nrun — run 57 on the outline');
    await page.evaluate('__outlineDemo.show("run")');
    await sleep(150);
    same('the step\'s status beside its title', await page.evaluate(`document.querySelector('${ROW('check')} .twm-flow-outline__run').textContent`),
         'completed ×63');
    same('an untaken arm says so', await page.evaluate(`document.querySelector('[data-step="fetch"] .twm-flow-outline__arm-note').textContent`),
         'not taken');
    check('…and its step is dimmed', await page.evaluate(`getComputedStyle(document.querySelector('${ROW('portaldown')} .twm-flow-outline__title')).fontStyle === 'italic'`));
    const pill = await centre(page, `${ROW('check')} .twm-flow-outline__run`);
    check('a pill is drawn with a size, uncovered', pill?.hit && pill.w > 40, JSON.stringify(pill));
    const banner = await centre(page, '.twm-flow-outline__banner');
    check('the banner is drawn', banner?.h > 20, JSON.stringify(banner));
    await page.screenshot(join(OUT, '8-run.png'));

    console.log('\nrefused — a flow that is not block-shaped');
    await page.evaluate('__outlineDemo.show("tangled")');
    await sleep(150);
    same('the sentence is on the screen', await page.evaluate('document.querySelector(".twm-flow-outline__readonly-text").textContent'),
         'This flow is shown as a list in the order it runs, and cannot be edited here: ‘Stop: nothing new’ is reached from two places that are not one block.');
    const ro = await centre(page, '.twm-flow-outline__readonly');
    check('…drawn with a size', ro?.h > 20, JSON.stringify(ro));
    check('…as a flat list with nothing to edit', await page.evaluate(
        '!document.querySelector(".twm-flow-outline__menu, .twm-flow-outline__gap, .twm-flow-outline__add")'));
    await page.screenshot(join(OUT, '9-refused.png'));
} finally {
    page?.close();
    await browser.close();
    await server.close();
}
console.log(failures ? `\nflow outline probe: ${failures} FAILED (screenshots in ${OUT})`
    : `\nflow outline probe: all checks passed (screenshots in ${OUT})`);
process.exit(failures ? 1 : 0);
