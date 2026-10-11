/**
 * THE OUTLINE EDITOR, NARROW AND WIDE, IN A REAL BROWSER — a picked step's
 * settings are on the screen after the pick (36 §8).
 *
 * Under 1000px the editor's container query stacks the list, the settings and
 * the aside one under another and the body scrolls as one, so the panel sits
 * under the whole list. A step picked there with the MOUSE used to fill a
 * panel far below the fold with nothing scrolled: the press looked like it did
 * nothing. This drives `demo/flow_outline.html` in headless Edge with REAL
 * input over the DevTools protocol, at two viewport widths:
 *
 *   900px   the layout is stacked, and the panel's first field is NOT on the
 *           screen before the pick (so the case is real); a real press on a
 *           step selects it and leaves its first field on the screen —
 *           `elementFromPoint` at the field's centre is the field; the same
 *           for the strip's Go to it after scrolling back to the top
 *   1440px  side by side; the same press scrolls nothing — the body, the
 *           panel and the page keep their scroll positions — and the field is
 *           on the screen
 *
 *     node demo/flow_outline_narrow_probe.mjs [out-dir]   (a node with a global WebSocket)
 *
 * Prints one line per check and exits 1 on any failure; writes screenshots to out-dir.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, launchBrowser, openPage, startServer } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'flow-outline-narrow-probe'));
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

/** The panel's first field — the control Enter focuses (editor.js, the `open` key). */
const FIRST_FIELD = `(() => document.querySelector('.twm-flow-outline__settings').querySelector(
    '.twm-flow-panel__fields input, .twm-flow-panel__fields select, .twm-flow-panel__fields textarea, '
    + '.twm-flow-panel__fields [contenteditable="true"], .twm-flow-panel__fields button'))()`;
/** Is that field the element at its own centre, inside the viewport? */
const FIELD_SEEN = `(() => {
    const f = ${FIRST_FIELD};
    if (!f) return { field: null };
    const r = f.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const inViewport = y >= 0 && y < innerHeight && x >= 0 && x < innerWidth;
    const hit = inViewport ? document.elementFromPoint(x, y) : null;
    return { field: f.tagName.toLowerCase() + (f.name ? '[' + f.name + ']' : ''), top: Math.round(r.top),
             seen: Boolean(hit && (hit === f || f.contains(hit))) };
})()`;
const SCROLLS = `(() => ({
    body: Math.round(document.querySelector('.twm-flow-outline__body').scrollTop),
    settings: Math.round(document.querySelector('.twm-flow-outline__settings').scrollTop),
    page: Math.round(document.scrollingElement.scrollTop),
}))()`;

const server = await startServer(ROOT);
try {
    for (const width of [900, 1440]) {
        const stacked = width < 1000;
        console.log(`\n${width}px — ${stacked ? 'stacked' : 'side by side'}`);
        const browser = await launchBrowser({ width, height: 1000 });
        let page;
        try {
            // The window size counts the frame; the VIEWPORT is set exactly.
            page = await openPage(browser.debugPort);
            await page.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
            await page.goto(`http://127.0.0.1:${server.port}/demo/flow_outline.html`);
            await page.waitFor('window.__outlineDemo && window.__outlineDemo.ready');
            await page.evaluate('document.fonts.ready.then(() => true)');
            await sleep(300);
            const layout = await page.evaluate(`({ inner: innerWidth,
                editor: Math.round(document.querySelector('.twm-flow-outline').getBoundingClientRect().width),
                wrap: getComputedStyle(document.querySelector('.twm-flow-outline__body')).flexWrap })`);
            check(`the viewport is ${width}px wide and the layout ${stacked ? 'wraps' : 'does not wrap'}`,
                  layout.inner === width && (layout.wrap === 'wrap') === stacked, JSON.stringify(layout));
            const before = await page.evaluate(FIELD_SEEN);
            if (stacked) check('before the pick the panel\'s first field is off the screen (the case is real)', !before.seen, JSON.stringify(before));
            await page.screenshot(join(OUT, `${width}-1-before.png`));

            const row = await centre(page, `${ROW('check')} .twm-flow-outline__words`);
            check('the step\'s row is the element at its centre', row?.hit, JSON.stringify(row));
            const scrolls0 = await page.evaluate(SCROLLS);
            await click(page, row.x, row.y);
            await sleep(300);
            same('a real press selects the step', await page.evaluate('__outlineDemo.editor.selection'), { kind: 'step', id: 'check' });
            const after = await page.evaluate(FIELD_SEEN);
            check('its first field is the element at the field\'s centre', after.seen, JSON.stringify(after));
            const scrolls1 = await page.evaluate(SCROLLS);
            if (stacked) {
                check('…because the body scrolled the panel on screen', scrolls1.body > scrolls0.body, JSON.stringify({ scrolls0, scrolls1 }));
                same('…and the page itself did not move', scrolls1.page, scrolls0.page);
            } else {
                same('nothing scrolled: the body, the panel and the page', scrolls1, scrolls0);
            }
            await page.screenshot(join(OUT, `${width}-2-picked.png`));

            // Go to it, from the strip above the body, with the body back at its top.
            await page.evaluate(`document.querySelector('.twm-flow-outline__body').scrollTop = 0; true`);
            await page.evaluate(`document.querySelector('[data-action="validate"]').click(); true`);
            await sleep(150);
            const go = await centre(page, '.twm-flow-strip__go');
            check('the strip\'s Go to it is the element at its centre', go?.hit, JSON.stringify(go));
            const scrolls2 = await page.evaluate(SCROLLS);
            await click(page, go.x, go.y);
            await sleep(300);
            const picked = await page.evaluate('__outlineDemo.editor.selection');
            check('Go to it selects a step', picked?.kind === 'step', JSON.stringify(picked));
            const gone = await page.evaluate(`(() => { const a = document.activeElement;
                const r = a.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
                const hit = y >= 0 && y < innerHeight ? document.elementFromPoint(x, y) : null;
                return { focused: a.tagName.toLowerCase(), inPanel: Boolean(a.closest('.twm-flow-panel')),
                         seen: Boolean(hit && (hit === a || a.contains(hit))) }; })()`);
            const seen = await page.evaluate(FIELD_SEEN);
            check('…and its settings are on the screen (the field it focused, or the first field)',
                  (gone.inPanel && gone.seen) || seen.seen, JSON.stringify({ gone, seen }));
            if (!stacked) same('…and side by side the body did not scroll', (await page.evaluate(SCROLLS)).body, scrolls2.body);
            await page.screenshot(join(OUT, `${width}-3-go-to-it.png`));
        } finally {
            page?.close();
            await browser.close();
        }
    }
} finally {
    await server.close();
}
console.log(failures ? `\nflow outline narrow probe: ${failures} FAILED (screenshots in ${OUT})`
    : `\nflow outline narrow probe: all checks passed (screenshots in ${OUT})`);
process.exit(failures ? 1 : 0);
