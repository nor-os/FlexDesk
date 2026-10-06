/**
 * THE KIT IN A REAL BROWSER (36 §8, BRIEF-flows spike S-chip) — what jsdom
 * cannot see, settled in headless Edge with real input over the DevTools
 * protocol.
 *
 *   S-chip   the chip input with REAL keys: typing either side of a chip; ← →
 *            stepping over it as one unit; one Backspace deleting it whole; a
 *            real paste of a reference making a chip; a real copy giving the
 *            exact text; an IME composition (`Input.imeSetComposition`) leaving
 *            the text intact until it commits; its own Ctrl+Z — and the NAIVE
 *            version (chips without contenteditable="false") shown failing:
 *            one Backspace splits its chip
 *   layout   `elementFromPoint` at each primary control's centre returns that
 *            control (Undo, "+", the panel's first field, its title, a field's
 *            "{ }", an action, Go to it); the panel is not covered; a refusal
 *            and a field's finding are drawn with a size
 *   pickers  the step picker and Insert a value opened by a real press, their
 *            search box focused, filtered by real keys, closed by Escape with
 *            the focus back on the anchor; a real press on a value inserts it
 *   drags    a real pointer drag across a chip starts NO native drag
 *            (a dragstart counter that stays at 0)
 *
 *     node demo/flow_kit_probe.mjs [out-dir]      (a node with a global WebSocket)
 *
 * Prints one line per check and exits 1 on any failure; writes screenshots to
 * out-dir. It uses the browser's clipboard, which on Windows is the system's.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, drag, key, launchBrowser, openPage, startServer, type } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'flow-kit-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want),
                                        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1400, height: 1000 });
let page;
try {
    page = await openPage(browser.debugPort, `http://127.0.0.1:${server.port}/demo/flow_kit.html`);
    await page.waitFor('window.__flowDemo && window.__flowDemo.ready');
    await page.screenshot(join(OUT, '1-page.png'));
    const value = () => page.evaluate('__flowDemo.spike.getValue()');
    const caret = () => page.evaluate('__flowDemo.spike.caret()');
    const chips = () => page.evaluate('[...document.querySelectorAll("#spike [data-ref]")].map((c) => c.dataset.ref)');
    const at = (start, end = start) => page.evaluate(`__flowDemo.spike.restoreCaret({ start: ${start}, end: ${end} })`);

    console.log('\nS-chip — the kit\'s chip input, real keys');
    const p = await centre(page, '#spike');
    await click(page, p.x + p.w / 2 - 4, p.y);
    same('it starts as two chips', await chips(), ['${row.name}', '${steps.check.body}']);
    await at(3);
    await type(page, 'X');
    same('typing before a chip', await value(), 'Hi X${row.name}, see ${steps.check.body}');
    await at(15);
    await type(page, 'Y');
    same('typing after a chip', await value(), 'Hi X${row.name}Y, see ${steps.check.body}');
    same('the chips are intact', await chips(), ['${row.name}', '${steps.check.body}']);
    await at(15);
    await key(page, 'ArrowLeft');
    same('← from after the chip lands before it — one unit', await caret(), { start: 4, end: 4 });
    await key(page, 'ArrowRight');
    same('→ lands after it', await caret(), { start: 15, end: 15 });
    await key(page, 'Backspace');
    same('one Backspace deletes the whole chip', await value(), 'Hi XY, see ${steps.check.body}');
    same('the caret is where it began', await caret(), { start: 4, end: 4 });

    // A real paste: the reference goes on the clipboard by a real copy from a textarea.
    await page.evaluate(`(() => { const t = document.createElement('textarea'); t.id = 'clip'; t.value = '\${a.b}';
                                  t.style.cssText = 'position:fixed;left:10px;bottom:10px;width:200px;height:24px';
                                  document.body.appendChild(t); t.focus(); t.select(); })()`);
    await key(page, 'c', { mods: ['ctrl'], commands: ['copy'] });
    await page.evaluate('__flowDemo.spike.focus()');
    const end = (await value()).length;
    await at(end);
    await key(page, 'v', { mods: ['ctrl'], commands: ['paste'] });
    same('a real paste of ${a.b} makes a chip', await chips(), ['${steps.check.body}', '${a.b}']);
    same('…and the text is the text', await value(), 'Hi XY, see ${steps.check.body}${a.b}');

    // A real copy: select everything in the field, copy, paste into the textarea.
    const all = (await value()).length;
    await at(0, all);
    await key(page, 'c', { mods: ['ctrl'], commands: ['copy'] });
    await page.evaluate('(() => { const t = document.getElementById("clip"); t.value = ""; t.focus(); })()');
    await key(page, 'v', { mods: ['ctrl'], commands: ['paste'] });
    same('a real copy gives the exact text, references and all', await page.evaluate('document.getElementById("clip").value'),
         await value());

    // An IME composition, then its commit.
    await page.evaluate('__flowDemo.spike.focus()');
    const before = await value();
    await at(before.length);
    const reported = await page.evaluate('document.getElementById("spike-out").textContent');
    await page.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
    same('during the composition the value is untouched', await value(), before);
    same('…nothing is reported', await page.evaluate('document.getElementById("spike-out").textContent'), reported);
    same('…and the chips are still there', await chips(), ['${steps.check.body}', '${a.b}']);
    await page.send('Input.insertText', { text: '日本' });
    await page.waitFor('__flowDemo.spike.getValue().endsWith("日本")', 3000).catch(() => {});
    same('the commit lands as text after the chips', await value(), `${before}日本`);
    same('…and the chips are intact', await chips(), ['${steps.check.body}', '${a.b}']);
    await key(page, 'z', { mods: ['ctrl'] });
    same('the field\'s own Ctrl+Z takes the commit back', await value(), before);
    await page.screenshot(join(OUT, '2-spike.png'));

    // A real drag across a chip starts no native drag.
    await page.evaluate('window.__drags = 0; document.addEventListener("dragstart", () => { window.__drags += 1; }, true)');
    const chip = await centre(page, '#spike [data-ref]');
    await drag(page, { x: chip.x, y: chip.y }, { x: chip.x + 60, y: chip.y + 2 });
    same('a pointer drag across a chip: dragstart counter', await page.evaluate('window.__drags'), 0);
    same('…and the text is unchanged', await value(), before);

    console.log('\nS-chip — the naive version, chips without contenteditable="false"');
    await page.evaluate(`(() => { const n = document.getElementById('naive'); n.focus();
        const text = n.querySelector('[data-ref]').nextSibling; const r = document.createRange();
        r.setStart(text, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
    await key(page, 'Backspace');
    const naive = await page.evaluate('__flowDemo.readNaive()');
    check('one Backspace after its chip SPLITS the chip (the defect the kit\'s chips exist to prevent)',
          naive.includes('«broken chip'), naive);
    await page.screenshot(join(OUT, '3-naive.png'));

    console.log('\nlayout — elementFromPoint at each primary control');
    await page.goto(`http://127.0.0.1:${server.port}/demo/flow_kit.html`);
    await page.waitFor('window.__flowDemo && window.__flowDemo.ready');
    for (const [name, sel] of [
        ['Undo', '[data-action="undo"]'], ['"+ Add a step"', '#add'],
        ['the panel\'s first field', '.twm-flow-panel [data-field="method"] select'],
        ['the panel\'s title', '.twm-flow-panel__title-input'],
        ['a field\'s Insert a value', '.twm-flow-panel [data-field="url"] .twm-flow-refbox__insert'],
        ['the Url chip input', '.twm-flow-panel [data-field="url"] .twm-flow-chipinput'],
        ['an action', '[data-action="duplicate"]'], ['the strip\'s Go to it', '.twm-flow-strip__go'],
        ['a choice card', '.twm-flow-panel [data-field="arm:error"] input[type="radio"]'],
    ]) {
        const c = await centre(page, sel);
        check(`${name} is the element at its centre`, c && c.w > 0 && c.h > 0 && c.hit, JSON.stringify(c));
    }
    const panelBox = await centre(page, '.twm-flow-panel');
    check('the panel is not covered at its centre', panelBox?.hit, JSON.stringify(panelBox));
    for (const [name, sel] of [['a refused action\'s reason', '.twm-flow-panel__refusal'],
                               ['the Url finding under its field', '[data-field="url"] .twm-flow-field__error'],
                               ['the strip', '.twm-flow-strip']]) {
        const c = await centre(page, sel);
        check(`${name} is drawn`, c && c.w > 20 && c.h > 8, JSON.stringify(c));
    }
    const heights = await page.evaluate(`[...document.querySelectorAll('.twm-flow-panel__fields > .twm-flow-field')]
        .map((f) => [f.dataset.field, Math.round(f.getBoundingClientRect().height)])`);
    check('every field has a height', heights.every(([, h]) => h > 10), JSON.stringify(heights));

    console.log('\npickers — opened by a real press');
    const plus = await centre(page, '#add');
    await click(page, plus.x, plus.y);
    await page.waitFor('document.querySelector(".twm-flow-popover--picker")');
    check('the step picker\'s search box has the focus',
          await page.evaluate('document.activeElement === document.querySelector(".twm-flow-picker__input")'));
    for (const [name, sel] of [['its search box', '.twm-flow-picker__input'], ['its first option', '.twm-flow-picker__option'],
                               ['its paste line', '.twm-flow-picker__paste']]) {
        const c = await centre(page, sel);
        check(`${name} is the element at its centre`, c?.hit, JSON.stringify(c));
    }
    const inView = async (name) => {
        const box = await page.evaluate(`(() => { const r = document.querySelector('.twm-flow-popover').getBoundingClientRect();
            const d = document.documentElement;
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: d.clientWidth, vh: d.clientHeight }; })()`);
        check(`${name} is inside the viewport, clear of the scrollbar`,
              box.left >= 0 && box.top >= 0 && box.right <= box.vw && box.bottom <= box.vh, JSON.stringify(box));
    };
    await inView('the step picker');
    await page.screenshot(join(OUT, '4-step-picker.png'));
    await type(page, 'rows');
    same('real keys filter it', await page.evaluate(`[...document.querySelectorAll('.twm-flow-picker__option')]
        .filter((o) => o.offsetParent).map((o) => o.dataset.entry)`), ['loop', 'data-0', 'data-1', 'data-2', 'data-3']);
    await key(page, 'Escape');
    check('Escape closes it', await page.evaluate('!document.querySelector(".twm-flow-popover")'));
    check('…and the focus is back on "+"', await page.evaluate('document.activeElement === document.getElementById("add")'));

    const insert = await centre(page, '.twm-flow-panel [data-field="url"] .twm-flow-refbox__insert');
    await click(page, insert.x, insert.y);
    await page.waitFor('document.querySelector(".twm-flow-popover--values")');
    await inView('Insert a value, opened from a right-hand "{ }"');
    await page.screenshot(join(OUT, '5-insert-a-value.png'));
    const groups = await page.evaluate(`[...document.querySelectorAll('.twm-flow-values__group-name')].map((g) => g.textContent)`);
    same('Insert a value lists what always runs before, nearest first', groups,
         ['This row', 'Check eligibility', 'Save the applications', 'Fetch new applications', 'Run input', 'Variables']);
    const email = await page.evaluate(`(() => { const o = [...document.querySelectorAll('.twm-flow-values__option')]
        .find((x) => x.textContent.startsWith('Email')); const r = o.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: o.contains(hit) }; })()`);
    check('an option is the element at its centre', email.hit, JSON.stringify(email));
    await click(page, email.x, email.y);
    same('a real press inserts it as text', await page.evaluate('__flowDemo.graph.nodes.find((n) => n.id === "invite").config.url'),
         '${row.email}');
    same('…drawn as a chip in the field', await page.evaluate(`[...document.querySelectorAll('[data-field="url"] [data-ref]')]
        .map((c) => c.textContent)`), ['This row › Email']);
    check('the picker closed and the strip dropped the Url finding', await page.evaluate(
        '!document.querySelector(".twm-flow-popover") && !document.querySelector(".twm-flow-strip").textContent.includes("Url needs")'));
    await page.screenshot(join(OUT, '6-inserted.png'));
    await page.evaluate('document.getElementById("side").focus()');
    await key(page, 'z', { mods: ['ctrl'] });
    same('Ctrl+Z on the editor (not in a field) undoes the insert', await page.evaluate(
        '__flowDemo.graph.nodes.find((n) => n.id === "invite").config.url ?? null'), null);
    await page.evaluate('window.__bs = null; window.addEventListener("keydown", (e) => { '
                        + 'if (e.key === "Backspace") window.__bs = { prevented: e.defaultPrevented }; })');
    await page.evaluate('document.getElementById("side").focus()');
    await key(page, 'Backspace');
    same('Backspace on the editor reaches the window, unprevented: it is the host’s', await page.evaluate('window.__bs'),
         { prevented: false });
} finally {
    page?.close();
    await browser.close();
    await server.close();
}
console.log(failures ? `\nflow kit probe: ${failures} FAILED (screenshots in ${OUT})` : `\nflow kit probe: all checks passed (screenshots in ${OUT})`);
process.exit(failures ? 1 : 0);
