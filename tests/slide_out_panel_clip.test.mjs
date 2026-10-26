/**
 * BUG-0051 — AN OPENING SLIDE-OUT PANEL IS NEVER DRAWN OUTSIDE ITS HOST.
 *
 * While open the panel is `position: fixed` at its host's right edge, where
 * the host's `overflow: hidden` no longer clips it; sliding in from
 * translateX(100%) it was drawn across the dock panel right of the host. A
 * clip now runs with the slide: closed, it is shifted by its own width and
 * clipped by its own width from the right; open, neither. With the same
 * duration and easing the clip's right inset equals the shift at every frame,
 * so only the part inside the panel's final box shows.
 *
 * jsdom applies no stylesheet and runs no transition, so this reads the rules.
 *
 *     node tests/slide_out_panel_clip.test.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleBody } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (name, got, want) => {
    const ok = got === want;
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n    got      ${JSON.stringify(got)}\n    expected ${JSON.stringify(want)}`}`);
};
const decl = (body, prop) => {
    const m = body && new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
    return m ? m[1].trim() : null;
};

for (const sheet of ['flexdesk.css', 'base.css']) {
    console.log(`\n${sheet}`);
    const css = readFileSync(join(HERE, '..', 'css', sheet), 'utf8');
    const closed = ruleBody(css, '.twm-slide-out-panel');
    const open = ruleBody(css, '.twm-slide-out-panel--open');
    check('closed: shifted by its own width', decl(closed, 'transform'), 'translateX(100%)');
    check('closed: clipped by its own width from the right', decl(closed, 'clip-path'), 'inset(0 100% 0 -16px)');
    check('open: not shifted', decl(open, 'transform'), 'translateX(0)');
    check('open: not clipped (the left -16px keeps the shadow)', decl(open, 'clip-path'), 'inset(0 0 0 -16px)');
    for (const [name, body] of [['closing', closed], ['opening', open]]) {
        const t = decl(body, 'transition') || '';
        const of = (prop) => (t.split(',').map((s) => s.trim()).find((s) => s.startsWith(`${prop} `)) || '').replace(`${prop} `, '');
        check(`${name}: the clip runs with the slide, same duration and easing`, of('clip-path'), of('transform'));
    }
}

console.log(failures === 0 ? '\nall assertions passed' : `\n${failures} assertion(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
