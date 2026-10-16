/**
 * ══ THE NATIVE CONTEXT MENU: suppressNativeContextMenu ══
 *
 *   §1  prevented where nobody claimed the right-click
 *   §2  a handler that shows its own menu keeps working
 *   §3  editable text and selected text keep the native menu
 *   §4  allow() and dispose()
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/native_context_menu.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { suppressNativeContextMenu } from '../src/ui/utils/native_context_menu.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    for (const c of [resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
                     resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js')]) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('native context menu: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

let failures = 0;
function check(what, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) console.log(`  ok   ${what}`);
    else { failures += 1; console.log(`  FAIL ${what}\n       expected ${e}, got ${a}`); }
}

const dom = new JSDOM(`<!doctype html><body>
    <div id="plain">plain <span id="inner">text</span></div>
    <div id="row">a row with its own menu</div>
    <div id="stopper">stops propagation</div>
    <input id="text" type="text"><input id="search" type="search"><input id="box" type="checkbox">
    <textarea id="area"></textarea>
    <div contenteditable="true"><p id="rich">rich text</p></div>
    <p id="sel">selectable words</p>
    <div id="keep">kept by allow()</div>
    </body>`, { url: 'http://localhost/' });
const { window: win } = dom;
const doc = win.document;
/** True when the native menu would show (nobody prevented the default). */
const native = (id) => {
    const ev = new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    doc.getElementById(id).dispatchEvent(ev);
    return !ev.defaultPrevented;
};

let ownMenu = 0;
doc.getElementById('row').addEventListener('contextmenu', (e) => { e.preventDefault(); ownMenu += 1; });
doc.getElementById('stopper').addEventListener('contextmenu', (e) => e.stopPropagation());

console.log('\nnative context menu\n');
check('before: the native menu shows everywhere', native('plain'), true);

const off = suppressNativeContextMenu({ root: doc, allow: (e) => e.target.id === 'keep' });

// §1
check('plain content: no native menu', native('plain'), false);
check('…nor on a child of it', native('inner'), false);
check('a checkbox is not text: no native menu', native('box'), false);

// §2
check('a handler with its own menu: still prevented', native('row'), false);
check('…and its handler ran', ownMenu, 1);
check('a handler that stops propagation is its own business', native('stopper'), true);

// §3
check('text input keeps the native menu (Paste)', native('text'), true);
check('search input too', native('search'), true);
check('textarea too', native('area'), true);
check('contenteditable too', native('rich'), true);
check('unselected text: no native menu', native('sel'), false);
const range = doc.createRange();
range.selectNodeContents(doc.getElementById('sel'));
win.getSelection().addRange(range);
check('selected text keeps the native menu (Copy)', native('sel'), true);
check('…but only where the selection is', native('plain'), false);
win.getSelection().removeAllRanges();

// §4
check('allow() keeps it where the app says so', native('keep'), true);
off.dispose();
check('dispose(): the native menu is back', native('plain'), true);

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
