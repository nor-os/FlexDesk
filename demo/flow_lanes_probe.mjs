/**
 * THE LANE EDITOR IN A REAL BROWSER (36 §8) — what jsdom cannot see, settled
 * in headless Edge with real input over the DevTools protocol.
 *
 *   wires    THE LAYOUT AND THE SHEET AGREE: in a laid-out page, each lane
 *            wire starts at its card's tip and ends in the next card's notch,
 *            the join's line ends at the join's bottom centre and its port dot
 *            sits there — at all three sizes (the layout computes the wires
 *            from numbers, the sheet sizes the cards; this is where the two
 *            meet)
 *   layout   `elementFromPoint` at each primary control's centre returns it:
 *            Undo, a card, the "+" of a card, Add a source, a step tab, Steps
 *            show, a parameter, the panel's first field and its name, a dock
 *            tab, a preview cell; the settings are not covered; the preview's
 *            DataTable draws rows with a height (a table in a box with no
 *            height draws none); every card's words stay inside the card
 *   "+"      hidden until the card is hovered, focused or chosen — never on
 *            hover alone: a real Tab from a card reaches its "+" and shows it
 *   pointer  a real press on "+" opens the step picker inside the viewport
 *            with its search focused; real keys filter it and Enter adds the
 *            step; a real drag across a card starts NO native drag and moves
 *            nothing (a `dragstart` counter at 0) — nothing is dragged
 *   keys     real arrows move between cards, Delete removes, Ctrl+Z undoes,
 *            Backspace removes nothing
 *   preview  three real keystrokes in a field ask the preview ONCE, after the
 *            debounce
 *   run      Steps show: The last run, by a real press
 *
 *     node demo/flow_lanes_probe.mjs [out-dir]      (a node with a global WebSocket)
 *
 * Prints one line per check, exits 1 on any failure, and writes screenshots
 * to out-dir.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, drag, key, launchBrowser, openPage, startServer, type } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'flow-lanes-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want),
                                        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In the page: where each wire meets its cards, against where the cards are laid out. */
const WIRES = `(() => {
    const svg = document.querySelector('.twm-flow-lanes__wires');
    const s = svg.getBoundingClientRect();
    const card = (id) => { const r = document.querySelector('.twm-flow-lanes__node[data-step="' + id + '"]').getBoundingClientRect();
                           return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const ends = (p) => { const n = p.getTotalLength(); const a = p.getPointAtLength(0); const b = p.getPointAtLength(n);
                          return { x1: s.left + a.x, y1: s.top + a.y, x2: s.left + b.x, y2: s.top + b.y }; };
    const out = [];
    for (const p of svg.querySelectorAll('.twm-flow-lanes__wire')) {
        const e = ends(p);
        out.push({ kind: p.dataset.kind, from: card(p.dataset.from), to: card(p.dataset.to), ...e });
    }
    const dot = svg.querySelector('.twm-flow-lanes__port');
    const d = dot ? dot.getBoundingClientRect() : null;
    return { wires: out, dot: d ? { x: d.left + d.width / 2, y: d.top + d.height / 2 } : null };
})()`;

function checkWires(label, w, { tip, notch }) {
    const lanes = w.wires.filter((x) => x.kind === 'lane');
    check(`${label}: every lane wire starts at its card's tip and ends in the next card's notch`,
          lanes.length > 0 && lanes.every((x) => near(x.x1, x.from.right - tip) && near(x.y1, x.from.top + x.from.height / 2)
              && near(x.x2, x.to.left + notch) && near(x.y2, x.to.top + x.to.height / 2)),
          JSON.stringify(lanes.map((x) => [Math.round(x.x1 - x.from.right), Math.round(x.x2 - x.to.left)])));
    const j = w.wires.find((x) => x.kind === 'join');
    check(`${label}: the join's line leaves the feeder's tip and ends at the join's bottom centre`,
          j && near(j.x1, j.from.right - tip) && near(j.x2, j.to.left + j.to.width / 2) && near(j.y2, j.to.bottom),
          JSON.stringify(j && [j.x1 - j.from.right, j.x2 - j.to.left - j.to.width / 2, j.y2 - j.to.bottom]));
    return j;
}

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1440, height: 1180 });
let page;
try {
    page = await openPage(browser.debugPort, `http://127.0.0.1:${server.port}/demo/flow_lanes.html`);
    await page.waitFor('window.__lanesDemo && window.__lanesDemo.ready');
    await page.waitFor('document.querySelector(".twm-flow-lanes__table tbody tr")');
    await sleep(300);
    await page.screenshot(join(OUT, '1-editor.png'));

    console.log('\nwires — the layout and the sheet agree');
    const w = await page.evaluate(WIRES);
    const j = checkWires('regular', w, { tip: 4, notch: 12 });
    check('regular: the port dot sits at the join\'s bottom centre', w.dot && j && near(w.dot.x, j.x2) && near(w.dot.y, j.y2),
          JSON.stringify(w.dot));
    const sizes = await page.evaluate(`[...document.querySelectorAll('.twm-flow-lanes__node')].map((n) => { const r = n.getBoundingClientRect(); return [r.width, r.height]; })`);
    check('regular: every card is 200 × 62', sizes.every(([a, b]) => a === 200 && b === 62), JSON.stringify(sizes[0]));
    const clip = await page.evaluate(`getComputedStyle(document.querySelector('[data-step="join"] .twm-flow-lanes__body')).clipPath`);
    check('a step is notched: its clip-path reads the notch', /12px 50%/.test(clip), clip);

    console.log('\nlayout — elementFromPoint at each control\'s centre');
    const at = async (name, selector) => {
        const c = await centre(page, selector);
        check(`${name} is the element at its own centre`, c && c.hit && c.w > 0 && c.h > 0, JSON.stringify(c));
        return c;
    };
    await at('Undo', '[data-action="undo"]');
    await at('a card (Tidy names)', '[data-step="tidy"] .twm-flow-lanes__card');
    await at('the chosen card\'s "+"', '[data-step="join"] .twm-flow-lanes__add');
    await at('Add a source', '.twm-flow-lanes__add-source');
    await at('a step tab', '.twm-flow-lanes__tab:nth-child(3)');
    await at('Steps show: The last run', '.twm-flow-lanes__show-btn[data-mode="run"]');
    await at('the parameter', '.twm-flow-lanes__param');
    await at('the panel\'s first field (This lane)', '.twm-flow-panel__fields select');
    await at('the step\'s name', '.twm-flow-panel__title-input');
    await at('Remove step', '.twm-flow-panel__action');
    await at('the dock\'s Columns tab', '.twm-flow-lanes__datatab:nth-child(2)');
    await at('a preview cell', '.twm-flow-lanes__table tbody tr:first-child td:first-child');
    const covered = await page.evaluate(`(() => {
        const col = document.querySelector('.twm-flow-lanes__settings').getBoundingClientRect();
        const pts = [[0.2, 0.1], [0.5, 0.3], [0.8, 0.5], [0.5, 0.9]];
        return pts.map(([fx, fy]) => { const el = document.elementFromPoint(col.left + col.width * fx, col.top + col.height * fy);
                                       return Boolean(el && document.querySelector('.twm-flow-lanes__settings').contains(el)); });
    })()`);
    same('the settings are covered by nothing, anywhere in them', covered, [true, true, true, true]);
    const rows = await page.evaluate(`[...document.querySelectorAll('.twm-flow-lanes__table tbody tr')].map((r) => Math.round(r.getBoundingClientRect().height))`);
    check('the preview\'s DataTable draws all six rows, each with a height', rows.length === 6 && rows.every((h) => h >= 16), JSON.stringify(rows));
    const box = await page.evaluate(`Math.round(document.querySelector('.twm-flow-lanes__table').getBoundingClientRect().height)`);
    check('…in a box with a definite height', box > 200, String(box));
    const spill = await page.evaluate(`[...document.querySelectorAll('.twm-flow-lanes__node')].filter((n) => {
        const r = n.getBoundingClientRect();
        return [...n.querySelectorAll('.twm-flow-lanes__title, .twm-flow-lanes__sub, .twm-flow-lanes__line')]
            .some((t) => { const q = t.getBoundingClientRect(); return q.right > r.right + 0.5 || q.left < r.left - 0.5; });
    }).map((n) => n.dataset.step)`);
    same('every card\'s words stay inside the card (ellipsis, not overflow)', spill, []);

    console.log('\n"+" — shown on hover, on focus and on the chosen card, never on hover alone');
    const op = (id) => page.evaluate(`getComputedStyle(document.querySelector('[data-step="${id}"] .twm-flow-lanes__add')).opacity`);
    same('a card neither chosen, hovered nor focused hides its "+"', await op('intake'), '0');
    same('the chosen card shows it', await op('join'), '1');
    const intake = await centre(page, '[data-step="intake"] .twm-flow-lanes__card');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: intake.x, y: intake.y });
    await sleep(50);
    same('hovering the card shows it', await op('intake'), '1');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    await page.evaluate(`document.querySelector('[data-step="join"] .twm-flow-lanes__card').focus()`);
    await key(page, 'Tab');
    same('a real Tab from the chosen card reaches its "+"', await page.evaluate(`document.activeElement.className`), 'twm-flow-lanes__add');

    console.log('\npointer — "+" opens the picker; a drag moves nothing');
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: intake.x, y: intake.y });
    await sleep(50);
    const plus = await centre(page, '[data-step="intake"] .twm-flow-lanes__add');
    await click(page, plus.x, plus.y);
    await page.waitFor('document.querySelector(".twm-flow-picker")');
    const picker = await page.evaluate(`(() => { const r = document.querySelector('.twm-flow-popover').getBoundingClientRect();
        return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
                 focused: document.activeElement === document.querySelector('.twm-flow-picker__input'),
                 where: document.querySelector('.twm-flow-picker__where').textContent }; })()`);
    same('the step picker opens inside the viewport, its search focused, saying where', picker,
         { inside: true, focused: true, where: 'after This intake only' });
    await page.screenshot(join(OUT, '2-picker.png'));
    await type(page, 'rename');
    const shown = await page.evaluate(`[...document.querySelectorAll('.twm-flow-picker [role="option"]')].filter((o) => !o.hidden).map((o) => o.dataset.entry)`);
    same('real keys filter it', shown, ['rename']);
    await key(page, 'Enter');
    await page.waitFor('document.querySelectorAll(".twm-flow-lanes__node").length === 8');
    const added = await page.evaluate(`({ lane: [...document.querySelectorAll('.twm-flow-lanes__lane')[0].querySelectorAll('.twm-flow-lanes__node')].map((n) => n.dataset.step),
        focused: document.activeElement.closest('[data-step]')?.dataset.step })`);
    same('Enter added it after This intake only, and the new card has the focus', added,
         { lane: ['src', 'intake', 'rename-2', 'join', 'tidy', 'rename', 'sink'], focused: 'rename-2' });
    await sleep(200);
    const w2 = await page.evaluate(WIRES);
    checkWires('after the add', w2, { tip: 4, notch: 12 });
    await page.screenshot(join(OUT, '3-added.png'));
    await key(page, 'z', { mods: ['ctrl'] });
    await page.waitFor('document.querySelectorAll(".twm-flow-lanes__node").length === 7');
    check('a real Ctrl+Z takes it back', true);

    const before = await page.evaluate(`[...document.querySelectorAll('.twm-flow-lanes__node')].map((n) => n.style.left + ',' + n.style.top).join(';')`);
    const tidy = await centre(page, '[data-step="tidy"] .twm-flow-lanes__card');
    await drag(page, { x: tidy.x, y: tidy.y }, { x: tidy.x + 90, y: tidy.y + 70 }, 16);
    await sleep(100);
    const after = await page.evaluate(`[...document.querySelectorAll('.twm-flow-lanes__node')].map((n) => n.style.left + ',' + n.style.top).join(';')`);
    same('a real drag across a card starts no native drag (dragstart counter)', await page.evaluate('__lanesDemo.dragstarts'), 0);
    check('…and moves nothing: every card is where the layout put it', before === after);

    console.log('\nkeys — real ones');
    const src = await centre(page, '[data-step="src"] .twm-flow-lanes__card');
    await click(page, src.x, src.y);
    await key(page, 'ArrowRight');
    await key(page, 'ArrowDown');
    same('→ then ↓ from the first card reaches Programmes, focused and chosen',
         await page.evaluate(`[document.activeElement.closest('[data-step]')?.dataset.step, document.querySelector('[data-step="prog"]').classList.contains('twm-flow-lanes__node--selected')]`),
         ['prog', true]);
    await key(page, 'Backspace');
    same('Backspace removes nothing', await page.evaluate('document.querySelectorAll(".twm-flow-lanes__node").length'), 7);
    await key(page, 'Delete');
    await page.waitFor('document.querySelectorAll(".twm-flow-lanes__node").length === 6');
    check('Delete removes the step', true);
    await key(page, 'z', { mods: ['ctrl'] });
    await page.waitFor('document.querySelectorAll(".twm-flow-lanes__node").length === 7');
    check('…and Ctrl+Z brings it back', true);
    await key(page, 'Enter');
    same('Enter opens the chosen step\'s settings on their first field', await page.evaluate(`document.activeElement.closest('[data-field]')?.dataset.field`), 'dataset');

    console.log('\npreview — debounced');
    const asked = await page.evaluate('__lanesDemo.requests.length');
    await click(page, src.x, src.y);
    await page.evaluate(`document.querySelector('[data-field="dataset"] input').focus()`);
    await type(page, 'xyz');
    await sleep(500);
    same('three keystrokes: nothing asked 500 ms on', await page.evaluate('__lanesDemo.requests.length'), asked);
    await sleep(700);
    same('…ONE request, after the debounce', await page.evaluate('__lanesDemo.requests.length'), asked + 1);

    console.log('\nrun — Steps show');
    const run = await centre(page, '.twm-flow-lanes__show-btn[data-mode="run"]');
    await click(page, run.x, run.y);
    await page.waitFor(`document.querySelector('[data-step="src"] .twm-flow-lanes__line').textContent === '1,284 · 2.1 s'`);
    check('a real press on The last run: the cards say what the run did', true);
    await page.screenshot(join(OUT, '4-last-run.png'));
    page.close();

    for (const [view, size, geometry] of [['small', [160, 50], { tip: 4, notch: 10 }], ['strip', [92, 26], { tip: 2, notch: 6 }]]) {
        console.log(`\n${view}`);
        page = await openPage(browser.debugPort, `http://127.0.0.1:${server.port}/demo/flow_lanes.html?view=${view}`);
        await page.waitFor('window.__lanesDemo && window.__lanesDemo.ready');
        await sleep(400);
        await page.screenshot(join(OUT, `5-${view}.png`));
        const ws = await page.evaluate(WIRES);
        checkWires(view, ws, geometry);
        const s2 = await page.evaluate(`[...document.querySelectorAll('.twm-flow-lanes__node')].map((n) => { const r = n.getBoundingClientRect(); return [r.width, r.height]; })`);
        check(`${view}: every card is ${size.join(' × ')}`, s2.every(([a, b]) => a === size[0] && b === size[1]), JSON.stringify(s2[0]));
        if (view === 'strip') {
            same('strip: nothing in it can be focused', await page.evaluate(`document.querySelectorAll('.twm-flow-lanes button, .twm-flow-lanes [tabindex]').length`), 0);
            const fits = await page.evaluate(`(() => { const s = document.querySelector('.twm-flow-lanes__surface').getBoundingClientRect(); return [s.width, s.height]; })()`);
            same('strip: the PipelineStep mock\'s 602 × 66', fits, [602, 66]);
        }
        page.close();
    }
} catch (err) {
    failures += 1;
    console.log(`  FAIL the probe threw: ${err?.stack || err}`);
} finally {
    await browser.close();
    await server.close();
}
console.log(failures ? `\nflow lanes probe: ${failures} check(s) FAILED (screenshots in ${OUT})`
                     : `\nflow lanes probe: every check passed (screenshots in ${OUT})`);
process.exit(failures ? 1 : 0);
