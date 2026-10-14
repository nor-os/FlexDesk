/**
 * THE CSV EXPORT BUTTON ON A ONE-PAGE TABLE, AND THE FILE IT NAMES (0.14.1, STORY-0025).
 *
 * `showExportButton` puts "Download visible rows as CSV" in the pagination
 * strip, and the strip is not drawn when everything fits on one page — so on
 * most tables the button was never there. And every table saved `data.csv`.
 *
 *   §1  with showExportButton, a one-page table draws the button alone (no
 *       page buttons), in the 0.6 strip's place and under the 0.7 pager
 *   §2  without it, a one-page table still draws no strip
 *   §3  a table with several pages keeps its full strip, button at the end
 *   §4  exportFilename (a string, or a function of the table) names the file;
 *       without it, data.csv
 *
 *     node tests/export_button.test.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    for (const c of [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('export button: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                   'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver']) {
    if (dom.window[key] !== undefined && globalThis[key] === undefined) {
        globalThis[key] = dom.window[key];
    }
}
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };

const { DataTable } = await import('../src/ui/components/data_table.js');

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}

const rowsOf = (n) => Array.from({ length: n }, (_, i) => [`r${i}`, i]);
function mount(config = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const table = new DataTable(host, {
        headers: ['Name', 'Value'], rows: rowsOf(3), pageSize: 10, pagination: true,
        selectable: false, copyable: false, ...config,
    });
    table.render();
    return { host, table };
}
const strip = (host) => host.querySelector('.twm-pagination-controls');
const buttons = (host) => [...(strip(host)?.querySelectorAll('button') || [])]
    .map((b) => b.getAttribute('data-tooltip') || b.textContent.trim());
const EXPORT = 'Download visible rows as CSV';
/** The file name the export button saves, without running the download. */
function savedName(table, host) {
    let name = null;
    table.downloadCSV = (f) => { name = f; };
    [...strip(host).querySelectorAll('button')].find((b) => b.getAttribute('data-tooltip') === EXPORT).click();
    return name;
}

console.log('\n§1 a one-page table with showExportButton draws the button alone');
{
    const { host } = mount({ showExportButton: true });
    check('the strip is there', !!strip(host), true);
    check('…holding the export button and nothing else', buttons(host), [EXPORT]);
}
{
    const { host } = mount({ showExportButton: true, pagerLabels: {} });
    check('the 0.7 pager does the same', buttons(host), [EXPORT]);
}
{
    const { host } = mount({ showExportButton: true, pagerPosition: 'bottom' });
    check('and at the bottom', !!host.querySelector('.twm-pagination-controls--bottom'), true);
}

console.log('\n§2 without showExportButton, a one-page table draws no strip');
{
    const { host } = mount();
    check('no strip', strip(host), null);
    const { host: h7 } = mount({ pagerLabels: {} });
    check('no strip under the 0.7 pager either', strip(h7), null);
}

console.log('\n§3 several pages keep the full strip, button last');
{
    const { host } = mount({ showExportButton: true, rows: rowsOf(25) });
    const b = buttons(host);
    check('page buttons are there', b.length > 1, true);
    check('the export button is last', b[b.length - 1], EXPORT);
}

console.log('\n§4 exportFilename');
{
    const { host, table } = mount({ showExportButton: true });
    check('without it, data.csv', savedName(table, host), 'data.csv');
}
{
    const { host, table } = mount({ showExportButton: true, exportFilename: 'bugs.csv' });
    check('a string', savedName(table, host), 'bugs.csv');
}
{
    const { host, table } = mount({ showExportButton: true, exportFilename: (t) => `rows-${t.config.rows.length}.csv` });
    check('a function of the table', savedName(table, host), 'rows-3.csv');
}

console.log(failures === 0 ? '\nall assertions passed\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
