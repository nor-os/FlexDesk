/**
 * BUG-0051 — AN OPENING SLIDE-OUT PANEL IS NEVER DRAWN OUTSIDE ITS BOX.
 *
 * While open the panel is `position: fixed` at its host's right edge, where
 * the host's `overflow: hidden` no longer clips it; sliding in from
 * translateX(100%) it was drawn across the dock panel right of the host. It
 * does not move any more: a clip alone carries the motion (closed: clipped
 * from the left by its whole width; open: not, but for the shadow's -16px),
 * so no frame paints outside its final box. No transform is animated beside
 * it: a transform (often run on the compositor) and a clip could drift apart.
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
    check('closed: clipped away from the left by its whole width', decl(closed, 'clip-path'), 'inset(0 0 0 100%)');
    check('open: not clipped (the left -16px keeps the shadow)', decl(open, 'clip-path'), 'inset(0 0 0 -16px)');
    check('closed: no transform moves it', decl(closed, 'transform'), null);
    check('open: no transform moves it', decl(open, 'transform'), null);
    for (const [name, body] of [['closing', closed], ['opening', open]]) {
        const t = decl(body, 'transition') || '';
        check(`${name}: only the clip and visibility transition`,
              t.split(',').map((x) => x.trim().split(' ')[0]).sort().join(','), 'clip-path,visibility');
    }
}

console.log(failures === 0 ? '\nall assertions passed' : `\n${failures} assertion(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
