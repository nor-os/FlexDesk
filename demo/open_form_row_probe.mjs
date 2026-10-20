/**
 * openForm's `{ row: [...] }` AND `min` / `max` IN A REAL BROWSER (STORY-0042).
 * jsdom lays nothing out, so `tests/open_form_rows_bounds.test.mjs` can only
 * read the container query's text; this drives `demo/open_form_row.html` in
 * headless Edge and measures:
 *
 *   600px  the dialog is 600px wide and the row's two fields sit side by side
 *          (same top, the second to the right of the first)
 *   340px  the same dialog narrowed below 360px stacks them (the second under
 *          the first, both as wide as the row)
 *          `setVisible` on one field of the row hides only that one
 *          a row that leads the form, then two ordinary fields: the first of
 *          them is 10px below the row, as every other pair of fields is (and
 *          the same with the row in the middle)
 *          a real press on OK with Steps = 500 is refused, with the error under
 *          Steps, and the form stays open
 *
 *     node demo/open_form_row_probe.mjs [out-dir]   (a node with a global WebSocket)
 *
 * Prints one line per check and exits 1 on any failure; writes screenshots to out-dir.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { centre, click, launchBrowser, openPage, startServer, type } from './flow_cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'open-form-row-probe'));
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Size the dialog to `w` px and report where the row's two fields are. */
const MEASURE = (w) => `(async () => {
    const win = document.querySelector('.twm-managed-window--modal');
    win.style.width = '${w}px';
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom),
                 width: Math.round(r.width) }; };
    return { dialog: Math.round(win.getBoundingClientRect().width),
             form: Math.round(document.querySelector('.twm-modal__form').getBoundingClientRect().width),
             group: box('.twm-modal__field-group'),
             lo: box('[data-field-row="lo"]'), hi: box('[data-field-row="hi"]') };
})()`;

const server = await startServer(ROOT);
const browser = await launchBrowser({ width: 1200, height: 900 });
try {
    const page = await openPage(browser.debugPort);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.goto(`http://127.0.0.1:${server.port}/demo/open_form_row.html`);
    await page.waitFor('window.__formDemo && window.__formDemo.ready');
    await page.evaluate('__formDemo.open()');
    await page.waitFor(`!!document.querySelector('.twm-modal__field-group')`);
    await sleep(200);

    const wide = await page.evaluate(MEASURE(600));
    check('the dialog is 600px wide', wide.dialog === 600, JSON.stringify(wide));
    check('at 600px the row\'s fields sit side by side', wide.lo.top === wide.hi.top && wide.hi.left >= wide.lo.right,
          JSON.stringify(wide));
    await page.screenshot(join(OUT, '1-600.png'));

    const narrow = await page.evaluate(MEASURE(340));
    check('the dialog is 340px wide (form below 360px)', narrow.dialog === 340 && narrow.form < 360, JSON.stringify(narrow));
    check('at 340px the row stacks: the second field under the first', narrow.hi.top >= narrow.lo.bottom
          && narrow.lo.left === narrow.hi.left, JSON.stringify(narrow));
    await page.screenshot(join(OUT, '2-340.png'));

    await page.evaluate(MEASURE(600));
    // Visibility: a second form whose onFieldChange hides `hi` when Mode is 'lo'.
    await page.evaluate(`(async () => {
        document.querySelector('.twm-managed-window--modal [data-action="cancel"]').click();
        await __formDemo.result;
        const { openForm } = await import('../widgets.js');
        __formDemo.result = openForm({ title: 'Range', fields: [
            { name: 'mode', label: 'Mode', type: 'select', options: ['both', 'lo'], default: 'both' },
            { row: [ { name: 'lo', label: 'Min', type: 'number', default: 0 },
                     { name: 'hi', label: 'Max', type: 'number', default: 10 } ] } ],
            onFieldChange: (name, v, api) => { api.setVisible('hi', api.get('mode') !== 'lo'); } });
        return true;
    })()`);
    await page.waitFor(`!!document.querySelector('.twm-modal__field-group')`);
    await page.evaluate(`(() => { const s = document.querySelector('[name="mode"]'); s.value = 'lo';
        s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await sleep(100);
    const vis = await page.evaluate(`(() => { const r = (n) => document.querySelector('[data-field-row="' + n + '"]').getBoundingClientRect();
        return { lo: Math.round(r('lo').width), hi: Math.round(r('hi').width), mode: Math.round(r('mode').width) }; })()`);
    check('setVisible(hi, false) hides only hi: lo and mode keep their box', vis.hi === 0 && vis.lo > 0 && vis.mode > 0, JSON.stringify(vis));
    await page.screenshot(join(OUT, '3-hidden.png'));

    // Spacing: [ {row:[lo,hi]}, a, b ] and [ a, {row:[lo,hi]}, b ] — every gap 10px.
    const GAPS = (fields) => `(async () => {
        document.querySelector('.twm-managed-window--modal [data-action="cancel"]').click();
        await __formDemo.result;
        const { openForm } = await import('../widgets.js');
        __formDemo.result = openForm({ title: 'Range', fields: ${fields} });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        document.querySelector('.twm-managed-window--modal').style.width = '640px';
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const r = (n) => document.querySelector('[data-field-row="' + n + '"]').getBoundingClientRect();
        const rowBottom = Math.round(Math.max(r('lo').bottom, r('hi').bottom));
        return { loTop: Math.round(r('lo').top), rowBottom,
                 aTop: Math.round(r('a').top), aBottom: Math.round(r('a').bottom), bTop: Math.round(r('b').top) };
    })()`;
    const ROW = "{ row: [ { name: 'lo', label: 'Min', type: 'number' }, { name: 'hi', label: 'Max', type: 'number' } ] }";
    const A = "{ name: 'a', label: 'A' }";
    const B = "{ name: 'b', label: 'B' }";
    const lead = await page.evaluate(GAPS(`[ ${ROW}, ${A}, ${B} ]`));
    check('a field after a leading row is 10px below it', lead.aTop - lead.rowBottom === 10, JSON.stringify(lead));
    check('…and the next field 10px below that', lead.bTop - lead.aBottom === 10, JSON.stringify(lead));
    await page.screenshot(join(OUT, '4-leading-row.png'));
    const mid = await page.evaluate(GAPS(`[ ${A}, ${ROW}, ${B} ]`));
    check('a row in the middle is 10px from the field above and the field below',
          mid.loTop - mid.aBottom === 10 && mid.bTop - mid.rowBottom === 10, JSON.stringify(mid));

    await page.evaluate(`(async () => { document.querySelector('.twm-managed-window--modal [data-action="cancel"]').click();
        await __formDemo.result; return __formDemo.open(); })()`);
    await page.waitFor(`!!document.querySelector('[name="steps"]')`);

    // A real press on OK with an out-of-range value.
    const steps = await centre(page, '[name="steps"]');
    await click(page, steps.x, steps.y);
    await page.evaluate(`(() => { const s = document.querySelector('[name="steps"]'); s.select(); return true; })()`);
    await type(page, '500');
    const ok = await centre(page, '.twm-managed-window--modal button[type="submit"]');
    check('OK is the element at its centre', ok?.hit, JSON.stringify(ok));
    await click(page, ok.x, ok.y);
    await sleep(200);
    const err = await page.evaluate(`(() => { const e = document.querySelector('[data-field-error="steps"]');
        return { text: e.hidden ? null : e.textContent, inRow: !!e.closest('[data-field-row="steps"]'),
                 open: !!document.querySelector('.twm-managed-window--modal') }; })()`);
    check('Steps = 500 is refused with "Must be between 2 and 200." under Steps, the form still open',
          err.text === 'Must be between 2 and 200.' && err.inRow && err.open, JSON.stringify(err));
    await page.screenshot(join(OUT, '5-range.png'));
    page.close();
} finally {
    await browser.close();
    await server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
