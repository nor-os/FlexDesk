/**
 * ══ COLLAPSIBLE SCROLLBARS ARE SCOPED TO THE CALLER'S ROOT (BUG-0006) ══════
 *
 *   §1  sections already visible when installCollapsibleScrollbars(root) is
 *       called get a bar at once — no class toggle needed
 *   §2  a section under root that gains `.visible`, or is mounted visible,
 *       gets one too
 *   §3  nothing outside root is touched, and class changes outside root do
 *       not run the observer
 *   §4  disconnect stops watching
 *   §5  no root given: the whole body is the root
 *   §6  no shipped file names the old hard-coded `twm-fixed-200`
 *
 *     node tests/collapsible_scrollbars.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

let JSDOM = null;
try {
    ({ JSDOM } = await import('jsdom'));
} catch {
    const candidates = [
        resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
        resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
    ];
    for (const c of candidates) {
        if (!existsSync(c)) continue;
        ({ JSDOM } = createRequire(import.meta.url)(c));
        break;
    }
}
if (!JSDOM) {
    console.log('collapsible scrollbars: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
    process.exit(0);
}

const dom = new JSDOM('<!doctype html><body></body>',
                      { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                   'MouseEvent', 'getComputedStyle', 'requestAnimationFrame',
                   'cancelAnimationFrame', 'MutationObserver']) {
    if (globalThis[key] === undefined && dom.window[key] !== undefined) globalThis[key] = dom.window[key];
}
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };

const { installCollapsibleScrollbars } = await import('../src/ui/utils/overlay_scrollbar.js');

let failures = 0;
const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const hasBar = (el) => !!el.__overlayScrollbarInstalled?.vertical;
const section = (parent, visible) => {
    const el = document.createElement('div');
    el.className = 'twm-collapsible-content' + (visible ? ' visible' : '');
    el.appendChild(document.createElement('p'));
    parent.appendChild(el);
    return el;
};

// ── §1 the steps to reproduce: visible sections in a sidebar, then install ──
const sidebar = document.createElement('aside');
const outside = document.createElement('main');
document.body.append(sidebar, outside);
const shown = section(sidebar, true);
const hidden = section(sidebar, false);
const elsewhere = section(outside, true);

const disconnect = installCollapsibleScrollbars(sidebar);
check('§1 an already-visible section under root has a bar at once', hasBar(shown), true);
check('§1 a collapsed section has none yet', hasBar(hidden), false);
check('§1 the function returns a disconnect', typeof disconnect, 'function');

// ── §2 class toggles and lazy mounts under root ──────────────────────────
hidden.classList.add('visible');
const mounted = document.createElement('div');
const lazy = section(mounted, true);
sidebar.appendChild(mounted);
await flush();
check('§2 a section that gains .visible gets a bar', hasBar(hidden), true);
check('§2 a section mounted visible gets a bar', hasBar(lazy), true);

// ── §3 scoped: nothing outside root ─────────────────────────────────────
check('§3 a visible section outside root is left alone', hasBar(elsewhere), false);
const toggled = section(outside, false);
toggled.classList.add('visible');
await flush();
check('§3 a toggle outside root installs nothing', hasBar(toggled), false);

// The observer itself is on root, not the document: count its callbacks.
const RealMO = globalThis.MutationObserver;
const observed = [];
globalThis.MutationObserver = class extends RealMO {
    observe(target, opts) { observed.push(target); return super.observe(target, opts); }
};
const d2 = installCollapsibleScrollbars(sidebar);
check('§3 the observer watches root only', observed.map((t) => t === sidebar), [true]);
d2();
globalThis.MutationObserver = RealMO;

// ── §4 disconnect ───────────────────────────────────────────────────────
disconnect();
const after = section(sidebar, true);
await flush();
check('§4 after disconnect a new section is not picked up', hasBar(after), false);

// ── §5 default root ─────────────────────────────────────────────────────
const d3 = installCollapsibleScrollbars();
check('§5 with no root, visible sections anywhere in the body get bars',
      [hasBar(elsewhere), hasBar(after)], [true, true]);
d3();

// ── §6 the hard-coded id is gone from shipped source ───────────────────
const SRC = resolvePath(HERE, '../src');
const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
});
const offenders = walk(SRC)
    .filter((p) => /\.(js|css)$/.test(p))
    .filter((p) => readFileSync(p, 'utf8').split('\n')
        .some((line) => /twm-fixed-200/.test(line) && !/^\s*(\*|\/\/)/.test(line)));
check('§6 no shipped code (outside comments) names twm-fixed-200', offenders, []);

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
