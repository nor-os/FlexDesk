/**
 * A FLOW EDITOR'S POPOVERS DRAW OVER THE WINDOW THEY OPEN FROM (BUG-0002).
 *
 * A consumer hosts the outline editor in a ManagedWindow; its step picker,
 * value picker and step menus are `.twm-flow-popover`s appended to the modal
 * host or the body, and the grip drag's ghost is `.twm-flow-outline__ghost`.
 * At `--z-popover` (200) all of them opened BEHIND every managed window
 * (6000-6999), so "Add a step" did nothing visible. jsdom applies no
 * stylesheet, so the contract is read as text:
 *
 *   §1  each of them resolves to a z-index above MAX_Z_INDEX, in flexdesk.css
 *       and in base.css's mirror
 *   §2  the token exists, and is above the windows too
 *
 *     node tests/flow_popover_layer.test.mjs
 */
import { assertions } from './flow_env.mjs';
import { ruleBody } from './css_rules.mjs';

const t = assertions('flow popovers — over managed windows');
const MAX = Number(/const MAX_Z_INDEX = (\d+);/.exec(t.read('src/ui/components/managed_window.js'))?.[1]);
const token = Number(/--z-over-windows:\s*(\d+);/.exec(t.css('tokens.css'))?.[1]);
const zOf = (body) => {
    const m = /z-index:\s*([^;]+);/.exec(body || '');
    if (!m) return NaN;
    const v = m[1].trim();
    const ref = /^var\(--([\w-]+)(?:,\s*(\d+))?\)$/.exec(v);
    if (!ref) return Number(v);
    return ref[1] === 'z-over-windows' ? token : Number(ref[2] ?? NaN);
};

t.section('§1 every flow popover is above the managed windows');
t.ok('MAX_Z_INDEX is read from managed_window.js', Number.isFinite(MAX), String(MAX));
for (const sheet of ['flexdesk.css', 'base.css']) {
    const css = t.css(sheet);
    for (const sel of ['.twm-flow-popover', '.twm-flow-outline__ghost']) {
        const z = zOf(ruleBody(css, sel));
        t.ok(`${sheet} ${sel}: z-index ${z} > ${MAX}`, z > MAX);
    }
}

t.section('§2 the token');
t.ok(`--z-over-windows (${token}) is above the windows`, token > MAX);
t.ok('and below the toasts, which go over everything', token < Number(/--z-toast:\s*(\d+);/.exec(t.css('tokens.css'))?.[1]));
t.done();
