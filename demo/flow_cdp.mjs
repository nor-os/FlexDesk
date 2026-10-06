/**
 * A SMALL DEVTOOLS-PROTOCOL DRIVER for the flow demo pages (36 §8): a static
 * server over the repository, headless Edge (or Chrome), and a page you can
 * evaluate in and send REAL input to — keys through `Input.dispatchKeyEvent`,
 * the pointer through `Input.dispatchMouseEvent`, an IME through
 * `Input.imeSetComposition`. jsdom computes no layout and does no editing, so
 * what a suite cannot see — where a control is drawn, whether a native drag
 * started, what a real key does in a `contenteditable` — is settled here.
 *
 * NOT a test suite (`run.mjs` runs `tests/*.test.mjs` only) and not shipped.
 * It needs a node with a global `WebSocket` (22 or later: on this machine,
 * Windows' node) and a Chromium browser:
 *
 *     node demo/flow_kit_probe.mjs [out-dir]
 *
 * The browser is found at FLOW_BROWSER, else Edge's default Windows path.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/** Serve `root` on 127.0.0.1, on a free port. */
export function startServer(root) {
    const base = resolve(root);
    const server = createServer((req, res) => {
        const path = normalize(join(base, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
        if (!path.startsWith(base) || !existsSync(path)) { res.writeHead(404); res.end('not found'); return; }
        try {
            const body = readFileSync(path);
            res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
            res.end(body);
        } catch { res.writeHead(404); res.end('not found'); }
    });
    return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({
        port: server.address().port, close: () => new Promise((done) => server.close(done)),
    })));
}

const BROWSER = process.env.FLOW_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Launch the browser headless with remote debugging; resolves when it answers. */
export async function launchBrowser({ width = 1400, height = 1000, debugPort = 9300 + Math.floor(Math.random() * 500) } = {}) {
    const profile = mkdtempSync(join(tmpdir(), 'flow-cdp-'));
    const proc = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
                                 `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
                                 '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 100; i += 1) {
        try {
            const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
            if (r.ok) break;
        } catch { /* not yet */ }
        await sleep(100);
    }
    return {
        debugPort,
        async close() {
            proc.kill();
            await sleep(500);
            try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
        },
    };
}

/** The first page target, connected. */
export async function openPage(debugPort, url) {
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
    let seq = 0;
    const waiting = new Map();
    const listeners = new Map();
    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && waiting.has(data.id)) {
            const { ok, fail } = waiting.get(data.id);
            waiting.delete(data.id);
            if (data.error) fail(new Error(`${data.error.message} ${data.error.data || ''}`)); else ok(data.result);
        } else if (data.method) {
            for (const fn of listeners.get(data.method) || []) fn(data.params);
        }
    };
    const send = (method, params = {}) => new Promise((ok, fail) => {
        seq += 1;
        waiting.set(seq, { ok, fail });
        ws.send(JSON.stringify({ id: seq, method, params }));
    });
    const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
    await send('Page.enable');
    await send('Runtime.enable');
    const page$ = {
        send, on,
        /** Evaluate `expr` (a string, awaited) in the page and return its value. */
        async evaluate(expr) {
            const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
            if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
            return r.result.value;
        },
        async goto(to) {
            const loaded = new Promise((ok) => on('Page.loadEventFired', ok));
            await send('Page.navigate', { url: to });
            await loaded;
        },
        async waitFor(expr, ms = 10000) {
            const until = Date.now() + ms;
            while (Date.now() < until) {
                if (await page$.evaluate(expr).catch(() => false)) return true;
                await sleep(50);
            }
            throw new Error(`timed out waiting for ${expr}`);
        },
        async screenshot(file) {
            const { data } = await send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(file, Buffer.from(data, 'base64'));
        },
        close: () => ws.close(),
    };
    if (url) await page$.goto(url);
    return page$;
}

// ── real input ───────────────────────────────────────────────────────────

const KEYS = {
    ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Backspace: 8, Delete: 46, Enter: 13, Escape: 27,
    Tab: 9, Home: 36, End: 35,
};
const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

/** One key, pressed and released. `mods`: ['ctrl', 'shift'…]; `commands`: an editing command (copy, paste…). */
export async function key(page, name, { mods = [], commands = undefined } = {}) {
    const modifiers = mods.reduce((n, m) => n | MOD[m], 0);
    const printable = name.length === 1;
    const code = printable ? (/[a-z]/i.test(name) ? `Key${name.toUpperCase()}` : '') : name;
    const vk = KEYS[name] ?? (printable ? name.toUpperCase().charCodeAt(0) : 0);
    const text = printable && !(modifiers & (MOD.ctrl | MOD.meta)) ? name : (name === 'Enter' ? '\r' : undefined);
    await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: name, code, modifiers,
                                                windowsVirtualKeyCode: vk, text, unmodifiedText: text, commands });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, modifiers, windowsVirtualKeyCode: vk });
}

/** Type `text` one real key at a time. */
export async function type(page, text) {
    for (const ch of text) await key(page, ch);
}

/** A real press: move, down, up — the whole gesture a browser sees. */
export async function click(page, x, y) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

/** A real drag from one point to another, in steps. */
export async function drag(page, from, to, steps = 12) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= steps; i += 1) {
        const x = from.x + ((to.x - from.x) * i) / steps;
        const y = from.y + ((to.y - from.y) * i) / steps;
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    }
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
}

/** The centre of the element `selector` names, in viewport pixels, and what elementFromPoint finds there. */
export async function centre(page, selector) {
    return page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, w: r.width, h: r.height, hit: Boolean(hit && (hit === el || el.contains(hit))),
                 hitIs: hit ? hit.tagName.toLowerCase() + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.split(' ')[0] : '') : null };
    })()`);
}
