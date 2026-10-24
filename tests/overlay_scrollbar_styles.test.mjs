/**
 * ══ THE OVERLAY SCROLLBAR IS STYLED BY FLEXDESK (BUG-0039) ═════════════════
 *
 * `installOverlayScrollbar` appends a `.overlay-scrollbar-v` / `-h` bar with a
 * `.track` and a `.thumb` to its container. No FlexDesk stylesheet had a rule
 * for them, so the bar was `position: static`: it took space in the scroll
 * container, its height fed the container's content height and the container
 * grew without limit, unless the embedder brought its own CSS.
 *
 *   §1  both sheets (flexdesk.css and its base.css mirror) make the bars
 *       absolute, hidden and pointer-transparent, pin them to the right /
 *       bottom edge, and give the thumb its pointer events back
 *   §2  every var() the block reads is a token in tokens.css
 *   §3  with only tokens.css and flexdesk.css loaded, a bar installed on an
 *       overflowing container computes `position: absolute`, opacity 0 and
 *       no pointer events, its thumb `pointer-events: auto`; the container
 *       carries `data-scrollable="1"` and hovering it shows the bar
 *
 *     node tests/overlay_scrollbar_styles.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, §3 SKIPS loudly.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { ruleBody, stripComments } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_DIR = join(HERE, '..', 'css');
const css = (f) => readFileSync(join(CSS_DIR, f), 'utf8');

let failures = 0;
const ok = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.error(`  FAIL ${name}${detail ? `\n    ${detail}` : ''}`); }
};
const decl = (body, prop) => {
    if (!body) return null;
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
    return m ? m[1].trim() : null;
};

// ── §1 the rules, in both sheets ────────────────────────────────────────────
const BAR = '.overlay-scrollbar-v, .overlay-scrollbar-h';
const THUMB = '.overlay-scrollbar-v .thumb, .overlay-scrollbar-h .thumb';
for (const sheet of ['flexdesk.css', 'base.css']) {
    const text = css(sheet);
    const bar = ruleBody(text, BAR);
    ok(`${sheet}: a rule for the bars`, bar !== null);
    ok(`${sheet}: the bars are position: absolute`, decl(bar, 'position') === 'absolute', `got ${decl(bar, 'position')}`);
    ok(`${sheet}: the bars start hidden`, decl(bar, 'opacity') === '0');
    ok(`${sheet}: the bars take no pointer events`, decl(bar, 'pointer-events') === 'none');
    ok(`${sheet}: the bars sit on a z-index token`, /^var\(--/.test(decl(bar, 'z-index') || ''));

    const v = ruleBody(text, '.overlay-scrollbar-v');
    ok(`${sheet}: the vertical bar is at the right edge`, decl(v, 'right') === '0' && decl(v, 'top') === '0');
    ok(`${sheet}: the vertical bar's width is a token`, /^var\(--/.test(decl(v, 'width') || ''));
    const h = ruleBody(text, '.overlay-scrollbar-h');
    ok(`${sheet}: the horizontal bar is at the bottom edge`, decl(h, 'bottom') === '0' && decl(h, 'left') === '0');
    ok(`${sheet}: the horizontal bar's height is a token`, /^var\(--/.test(decl(h, 'height') || ''));

    const thumb = ruleBody(text, THUMB);
    ok(`${sheet}: the thumb is absolute`, decl(thumb, 'position') === 'absolute');
    ok(`${sheet}: the thumb takes pointer events (it drags)`, decl(thumb, 'pointer-events') === 'auto');
    ok(`${sheet}: the thumb's colour is a token`, /^var\(--/.test(decl(thumb, 'background') || ''));
    const track = ruleBody(text, '.overlay-scrollbar-v .track, .overlay-scrollbar-h .track');
    ok(`${sheet}: the track fills the bar`, decl(track, 'position') === 'absolute' && decl(track, 'inset') === '0');
    ok(`${sheet}: the track's colour is a token`, /^var\(--/.test(decl(track, 'background') || ''));
}

// ── §2 every token the block reads exists ───────────────────────────────────
{
    const text = stripComments(css('flexdesk.css'));
    const tokens = css('tokens.css');
    const used = new Set();
    const re = /(\.overlay-scrollbar-[vh][^{}]*)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        for (const v of m[2].matchAll(/var\((--[\w-]+)/g)) used.add(v[1]);
    }
    ok('the block reads tokens', used.size > 0);
    for (const t of used) ok(`${t} is defined in tokens.css`, new RegExp(`${t}\\s*:`).test(tokens));
}

// ── §3 computed styles with only FlexDesk's sheets loaded ───────────────────
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
    console.log('overlay_scrollbar_styles §3: SKIPPED — needs jsdom '
        + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
} else {
    const dom = new JSDOM('<!doctype html><head></head><body></body>',
                          { url: 'http://localhost/', pretendToBeVisual: true });
    for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                       'MouseEvent', 'getComputedStyle', 'requestAnimationFrame',
                       'cancelAnimationFrame', 'MutationObserver']) {
        if (globalThis[key] === undefined && dom.window[key] !== undefined) globalThis[key] = dom.window[key];
    }
    globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };

    // Only FlexDesk's own stylesheets: no embedder CSS.
    for (const f of ['tokens.css', 'flexdesk.css']) {
        const style = document.createElement('style');
        style.textContent = css(f);
        document.head.appendChild(style);
    }

    const { installOverlayScrollbar } = await import('../src/ui/utils/overlay_scrollbar.js');

    const fake = (el, props) => {
        for (const [k, v] of Object.entries(props)) {
            Object.defineProperty(el, k, { configurable: true, get: () => v });
        }
    };

    for (const orientation of ['vertical', 'horizontal']) {
        const box = document.createElement('div');
        box.style.height = '100px';
        box.style.width = '100px';
        document.body.appendChild(box);
        // jsdom computes no layout: the container overflows on both axes.
        fake(box, { scrollHeight: 1000, clientHeight: 100, scrollWidth: 1000, clientWidth: 100 });

        const handle = installOverlayScrollbar(box, { orientation });
        handle.update();
        const { bar, thumb } = handle;
        const cs = getComputedStyle(bar);
        const tag = orientation;
        ok(`${tag}: the bar is position: absolute`, cs.position === 'absolute', `got ${cs.position}`);
        ok(`${tag}: the bar is hidden until hovered`, cs.opacity === '0', `got ${cs.opacity}`);
        ok(`${tag}: the bar takes no pointer events`, cs.pointerEvents === 'none', `got ${cs.pointerEvents}`);
        ok(`${tag}: the thumb is position: absolute`, getComputedStyle(thumb).position === 'absolute');
        ok(`${tag}: the thumb takes pointer events`, getComputedStyle(thumb).pointerEvents === 'auto',
           `got ${getComputedStyle(thumb).pointerEvents}`);
        ok(`${tag}: FlexDesk sets data-scrollable on an overflowing container`, box.dataset.scrollable === '1');

        box.dispatchEvent(new MouseEvent('mouseenter'));
        ok(`${tag}: hovering the container shows the bar`, getComputedStyle(bar).opacity === '1');
        box.dispatchEvent(new MouseEvent('mouseleave'));
        ok(`${tag}: leaving it hides the bar`, getComputedStyle(bar).opacity === '0');
        handle.cleanup();
        box.remove();
    }
    // Let the deferred updates installOverlayScrollbar scheduled run out.
    await new Promise((r) => setTimeout(r, 80));
}

if (failures) {
    console.error(`\noverlay_scrollbar_styles: ${failures} failure(s)`);
    process.exit(1);
}
console.log('\noverlay_scrollbar_styles: all passed');
process.exit(0);
