/**
 * ══ OPENING A FILE: dialogs.openFile and pickFile ══
 *
 *   §1  under NULL_HOST pickFile opens the browser's chooser and resolves {ok, name, text}
 *   §2  a host whose openFile answers null falls back to the browser chooser;
 *       openFile is called as a method, and a string accept reaches it as a list;
 *       a host that answers is used as it is, and the chooser never opens
 *   §3  cancelling resolves {ok: false, cancelled: true}, and the input is gone
 *   §4  encoding 'base64' returns the bytes as base64
 *   §5  the contract: openFile is optional on dialogs, and validated hosts keep it
 *   §6  the adapters: pywebview calls read_file_dialog(accept, kind, encoding),
 *       Photino sends dialogs.openFile; both answer null when nothing is behind them
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────
 *
 *     node tests/pick_file.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHost, NULL_HOST, HOST_CONTRACT, validateCapability } from '../src/host/host.js';
import { createPywebviewHost } from '../src/host/pywebview_host.js';
import { createPhotinoHost } from '../src/host/photino_host.js';
import { pickFile } from '../src/host/file_picker.js';
import * as hostEntry from '../host.js';

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
    console.log('pick file: SKIPPED — needs jsdom '
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

/**
 * A page whose file inputs never open a real chooser: click() records the
 * input, and the test answers it by setting `files` and firing change/cancel.
 */
function page() {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
    const doc = dom.window.document;
    const clicked = [];
    dom.window.HTMLInputElement.prototype.click = function click() { clicked.push(this); };
    const choose = (input, parts, name, type = 'text/plain') => {
        const file = new dom.window.File(parts, name, { type });
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        input.dispatchEvent(new dom.window.Event('change'));
    };
    const cancel = (input) => input.dispatchEvent(new dom.window.Event('cancel'));
    return { dom, doc, clicked, choose, cancel };
}

// ── §1 ────────────────────────────────────────────────────────────────────
console.log('§1 NULL_HOST: the browser chooser');
{
    const p = page();
    const picking = pickFile(NULL_HOST, { accept: ['.json', '.csv'], document: p.doc });
    await settle();
    check('one file input was clicked', p.clicked.length, 1);
    const input = p.clicked[0];
    check('it is a file input in the page', [input?.type, p.doc.body.contains(input)], ['file', true]);
    check('accept is the list, comma-separated', input?.accept, '.json,.csv');
    check('it is hidden', input?.style.display, 'none');
    p.choose(input, ['{"a": 1}'], 'model.json', 'application/json');
    check('resolves {ok: true, name, text}', await picking, { ok: true, name: 'model.json', text: '{"a": 1}' });
    check('the input is removed afterwards', p.doc.querySelectorAll('input[type=file]').length, 0);
}
{
    const p = page();
    const picking = pickFile(NULL_HOST, { document: p.doc });
    await settle();
    check('no accept given → no accept attribute', p.clicked[0]?.hasAttribute('accept'), false);
    p.choose(p.clicked[0], ['héllo'], 'a.txt');
    check('text is decoded as UTF-8', await picking, { ok: true, name: 'a.txt', text: 'héllo' });
}

// ── §2 ────────────────────────────────────────────────────────────────────
console.log('§2 a host that answers null falls back; one that answers is used');
{
    const p = page();
    const seen = [];
    const host = createHost({ dialogs: { saveFile: async () => null, openFile: async (o) => { seen.push(o); return null; } } });
    const picking = pickFile(host, { accept: ['.csv'], kind: 'csv', document: p.doc });
    await settle();
    check('the host was asked first, with accept, kind and encoding', seen, [{ accept: ['.csv'], kind: 'csv', encoding: 'text' }]);
    check('then the browser chooser opened', p.clicked.length, 1);
    p.choose(p.clicked[0], ['a,b\n1,2'], 'rows.csv', 'text/csv');
    check('and resolves the same shape', await picking, { ok: true, name: 'rows.csv', text: 'a,b\n1,2' });
}
{
    const p = page();
    const host = createHost({ dialogs: { saveFile: async () => null, openFile: async () => { throw new Error('bridge gone'); } } });
    const picking = pickFile(host, { document: p.doc });
    await settle();
    check('a host that throws falls back too', p.clicked.length, 1);
    p.cancel(p.clicked[0]);
    check('(and cancelling it still answers)', await picking, { ok: false, cancelled: true });
}
{
    const p = page();
    const host = createHost({ dialogs: { saveFile: async () => null,
        openFile: async () => ({ ok: true, name: 'x.json', path: 'C:/x.json', text: '{}' }) } });
    check('a host answer is returned as it is',
          await pickFile(host, { document: p.doc }), { ok: true, name: 'x.json', path: 'C:/x.json', text: '{}' });
    check('and the browser chooser never opened', p.clicked.length, 0);
    const cancelling = createHost({ dialogs: { saveFile: async () => null, openFile: async () => ({ ok: false, cancelled: true }) } });
    check('a host cancel is not a fallback', await pickFile(cancelling, { document: p.doc }), { ok: false, cancelled: true });
    check('(still no browser chooser)', p.clicked.length, 0);
}
{
    const p = page();
    const host = createHost({ dialogs: { saveFile: async () => null,       // openFile uses `this`
        api: { pick: async (o) => ({ ok: true, name: 'm.json', path: '/m.json', text: '[]', asked: o }) },
        openFile(o) { return this.api.pick(o); } } });
    const picking = pickFile(host, { accept: ['.json'], kind: 'json', document: p.doc });
    await settle();
    check('a this-using openFile opens no browser chooser', p.clicked.length, 0);
    if (p.clicked.length) p.cancel(p.clicked[0]);                         // let a wrong fallback answer
    check('it is called as a method, its answer returned unchanged', await picking,
          { ok: true, name: 'm.json', path: '/m.json', text: '[]', asked: { accept: ['.json'], kind: 'json', encoding: 'text' } });
}
{
    const p = page();
    const seen = [];
    const host = createHost({ dialogs: { saveFile: async () => null,
        openFile: async (o) => { seen.push(o.accept); return { ok: false, cancelled: true }; } } });
    await pickFile(host, { accept: '.json,.csv', document: p.doc });
    await pickFile(host, { accept: ' .json , text/csv ,', document: p.doc });
    await pickFile(host, { accept: '.png', document: p.doc });
    check("a string accept reaches openFile as a list: '.json,.csv' → ['.json', '.csv']",
          seen, [['.json', '.csv'], ['.json', 'text/csv'], ['.png']]);
    check('(no browser chooser opened)', p.clicked.length, 0);
}
{
    const p = page();
    const host = createHost({ dialogs: { saveFile: async () => null } });   // dialogs without openFile
    const picking = pickFile(host, { document: p.doc });
    await settle();
    check('dialogs without openFile → the browser chooser', p.clicked.length, 1);
    p.cancel(p.clicked[0]);
    await picking;
}

// ── §3 ────────────────────────────────────────────────────────────────────
console.log('§3 cancelling');
{
    const p = page();
    const picking = pickFile(NULL_HOST, { document: p.doc });
    await settle();
    p.cancel(p.clicked[0]);
    check('cancel resolves {ok: false, cancelled: true}', await picking, { ok: false, cancelled: true });
    check('the input is removed', p.doc.querySelectorAll('input[type=file]').length, 0);
}
{
    const p = page();
    const picking = pickFile(NULL_HOST, { document: p.doc });
    await settle();
    const input = p.clicked[0];
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    input.dispatchEvent(new p.dom.window.Event('change'));
    check('a change with no file is a cancel', await picking, { ok: false, cancelled: true });
}

// ── §4 ────────────────────────────────────────────────────────────────────
console.log('§4 base64');
{
    const p = page();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x10]);
    const picking = pickFile(NULL_HOST, { encoding: 'base64', accept: '.png', document: p.doc });
    await settle();
    check('a string accept is used as it is', p.clicked[0]?.accept, '.png');
    p.choose(p.clicked[0], [bytes], 'pic.png', 'image/png');
    const r = await picking;
    check('resolves {ok: true, name, data} with the bytes as base64',
          r, { ok: true, name: 'pic.png', data: Buffer.from(bytes).toString('base64') });
    check('and no text field', 'text' in r, false);
}
{
    let threw = null;
    try { await pickFile(NULL_HOST, { encoding: 'latin1' }); } catch (e) { threw = e.constructor.name; }
    check('an unknown encoding is a TypeError', threw, 'TypeError');
}

// ── §5 ────────────────────────────────────────────────────────────────────
console.log('§5 the contract');
check('openFile is an optional dialogs member', HOST_CONTRACT.dialogs.optional, ['openFile']);
check('saveFile stays the one required member', HOST_CONTRACT.dialogs.required, ['saveFile']);
check('validateCapability accepts dialogs without openFile',
      validateCapability('dialogs', { saveFile() {} }), { ok: true, missing: [] });
check('validateCapability accepts dialogs with openFile',
      validateCapability('dialogs', { saveFile() {}, openFile() {} }), { ok: true, missing: [] });
check('createHost keeps openFile', typeof createHost({ dialogs: { saveFile() {}, openFile() {} } }).dialogs.openFile, 'function');
check('@flexdesk/host exports pickFile', typeof hostEntry.pickFile, 'function');

// ── §6 ────────────────────────────────────────────────────────────────────
console.log('§6 the adapters');
{
    const calls = [];
    const bridge = { current: { read_file_dialog: async (...args) => { calls.push(args); return { ok: true, name: 'a.json', path: '/a.json', text: '[]' }; } } };
    const host = createPywebviewHost({ bridgeRef: bridge, logger: { warn() {} } });
    check('pywebview: openFile resolves the bridge reply',
          await host.dialogs.openFile({ accept: ['.json'], kind: 'json', encoding: 'text' }),
          { ok: true, name: 'a.json', path: '/a.json', text: '[]' });
    check('pywebview: positional read_file_dialog(accept, kind, encoding)', calls, [[['.json'], 'json', 'text']]);
    await host.dialogs.openFile();
    check('pywebview: defaults are [], null, text', calls[1], [[], null, 'text']);
    const bare = createPywebviewHost({ bridgeRef: { current: {} }, logger: { warn() {} } });
    check('pywebview: no read_file_dialog → null', await bare.dialogs.openFile({}), null);
    const odd = createPywebviewHost({ bridgeRef: { current: { read_file_dialog: async () => true } }, logger: { warn() {} } });
    check('pywebview: a non-object reply → null', await odd.dialogs.openFile({}), null);
}
{
    let receive = null;
    const sent = [];
    const answer = (req) => {
        const k = `${req.cap}.${req.op}`;
        if (k === 'dialogs.openFile') return { ok: true, value: { ok: true, name: 'b.csv', text: 'x' } };
        return { ok: false, error: 'no such op' };
    };
    const external = {
        sendMessage(text) {
            const req = JSON.parse(text);
            sent.push(req);
            queueMicrotask(() => receive(JSON.stringify({ id: req.id, ...answer(req) })));
        },
        receiveMessage(cb) { receive = cb; },
    };
    const host = createPhotinoHost({ external, logger: { warn() {} } });
    check('photino: openFile resolves the native reply',
          await host.dialogs.openFile({ accept: ['.csv'], kind: 'csv', encoding: 'base64' }), { ok: true, name: 'b.csv', text: 'x' });
    const req = sent.find((m) => m.op === 'openFile');
    check('photino: sends dialogs.openFile with [{accept, kind, encoding}]',
          [req?.cap, req?.args], ['dialogs', [{ accept: ['.csv'], kind: 'csv', encoding: 'base64' }]]);

    let r2 = null;
    const refusing = createPhotinoHost({
        external: {
            sendMessage(text) { const q = JSON.parse(text); queueMicrotask(() => r2(JSON.stringify({ id: q.id, ok: false, error: 'no such op' }))); },
            receiveMessage(cb) { r2 = cb; },
        },
        logger: { warn() {} },
    });
    check('photino: refused → null (pickFile opens the browser chooser)', await refusing.dialogs.openFile({}), null);
}

if (failures) { console.log(`\npick file: ${failures} FAILED`); process.exit(1); }
console.log('\npick file: all passed');
