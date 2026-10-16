/**
 * ══ LINKS THAT LEAVE THE APP: routeExternalLinks ══
 *
 *   §1  without host.shell nothing changes (a browser tab)
 *   §2  external clicks go to shell.openExternal; the app's own links stay
 *   §3  window.open of an external address goes out too; anything else is untouched
 *   §4  a refused openExternal falls back to window.open
 *   §5  dispose() puts everything back
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/external_links.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHost, NULL_HOST } from '../src/host/host.js';
import { routeExternalLinks } from '../src/host/external_links.js';

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
    console.log('external links: SKIPPED — needs jsdom '
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
const settle = () => new Promise((r) => setTimeout(r, 0));

function page() {
    const dom = new JSDOM(`<!doctype html><body>
        <a id="blank" href="https://example.com/x" target="_blank">x</a>
        <a id="other" href="https://example.com/y">y</a>
        <a id="mail" href="mailto:a@b.c">mail</a>
        <a id="own" href="/records/7">own</a>
        <a id="ownblank" href="/help" target="_blank">help</a>
        <a id="js" href="javascript:void(0)" target="_blank">js</a>
        <a id="file" href="file:///etc/passwd" target="_blank">file</a>
        <a id="dl" href="https://example.com/f.csv" download>dl</a>
        <a id="handled" href="https://example.com/z" target="_blank">z</a>
        </body>`, { url: 'http://localhost:8766/app' });
    const win = dom.window;
    const opened = [];
    win.open = (url, target, features) => { opened.push([String(url), target ?? null]); return null; };
    // Read whether the router prevented the default, then prevent it anyway:
    // jsdom cannot navigate and says so loudly on every link it is left to follow.
    let prevented = null;
    const last = (e) => { prevented = e.defaultPrevented; e.preventDefault(); };
    win.addEventListener('click', last);
    win.addEventListener('auxclick', last);
    const click = (id, init = {}) => {
        const ev = new win.MouseEvent(init.type || 'click', { bubbles: true, cancelable: true, button: 0, ...init });
        win.document.getElementById(id).dispatchEvent(ev);
        return prevented;
    };
    return { win, doc: win.document, opened, click };
}
function shellHost(answer = true) {
    const sent = [];
    const host = createHost({ shell: { openExternal: async (url) => { sent.push(url); return answer; } } });
    return { host, sent };
}

console.log('\nexternal links\n');

// §1
{
    const { win, doc, click, opened } = page();
    const before = win.open;
    const r = routeExternalLinks({ host: NULL_HOST, root: doc, win });
    check('no shell: window.open is not wrapped', win.open === before, true);
    check('no shell: a _blank link keeps its default', click('blank'), false);
    check('no shell: nothing was opened through anything', opened, []);
    r.dispose();
}

// §2
{
    const { win, doc, click } = page();
    const { host, sent } = shellHost();
    const r = routeExternalLinks({ host, root: doc, win });
    doc.getElementById('handled').addEventListener('click', (e) => e.preventDefault());
    check('_blank https link: prevented', click('blank'), true);
    check('another origin without a target: prevented', click('other'), true);
    check('mailto: prevented', click('mail'), true);
    check('the app\'s own link: left alone', click('own'), false);
    // In a native window the alternative is a bare popup with no way back.
    check('the app\'s own page in _blank: out to the browser too', click('ownblank'), true);
    check('javascript: left alone', click('js'), false);
    check('file: never sent out', click('file'), false);
    check('a download link: left alone', click('dl'), false);
    click('handled');
    check('a middle click on an external link goes out', click('other', { type: 'auxclick', button: 1 }), true);
    check('a right click is not a navigation', click('blank', { button: 2 }), false);
    await settle();
    check('openExternal got exactly the external ones, absolute',
          sent, ['https://example.com/x', 'https://example.com/y', 'mailto:a@b.c',
                 'http://localhost:8766/help', 'https://example.com/y']);
    r.dispose();
}

// §3
{
    const { win, doc, opened } = page();
    const { host, sent } = shellHost();
    const r = routeExternalLinks({ host, root: doc, win });
    check('window.open of an external address returns null', win.open('https://example.org/'), null);
    win.open('/records/9', '_blank');
    win.open('blob:http://localhost:8766/abc');
    await settle();
    check('…and goes to openExternal', sent, ['https://example.org/']);
    check('same-origin and blob opens reach the original window.open', opened.map((o) => o[0]),
          ['/records/9', 'blob:http://localhost:8766/abc']);
    r.dispose();
}

// §4
{
    const { win, doc, click, opened } = page();
    const { host } = shellHost(false);
    const r = routeExternalLinks({ host, root: doc, win });
    click('blank');
    await settle(); await settle();
    check('refused: falls back to window.open in a new window', opened, [['https://example.com/x', '_blank']]);
    r.dispose();
}

// §5
{
    const { win, doc, click } = page();
    const original = win.open;
    const { host, sent } = shellHost();
    routeExternalLinks({ host, root: doc, win }).dispose();
    check('dispose restores window.open', win.open === original, true);
    check('…and stops routing clicks', click('blank'), false);
    await settle();
    check('…so nothing was sent', sent, []);
}

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
