/**
 * ══ KEYBOARD FOCUS SHOWS A TOOLTIP (0.18.1) ═══════════════════════════════
 *
 * The service listened to the mouse only, so a person on the keyboard never saw
 * what a `twm-has-tooltip` element had to say.
 *
 *   §1  focus by keyboard shows it, leaving hides it, and focus moving inside the
 *       target keeps it
 *   §2  the focus a click leaves shows nothing
 *   §3  no pointer is on the target, and the three-second pointer check leaves it
 *   §4  focus passing through within a frame leaves nothing standing
 *   §5  Esc hides it
 *
 * jsdom has no modality, so `:focus-visible` is stubbed; a browser's is checked in
 * headless Edge.
 *
 *     node tests/tooltip_focus.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('tooltip — focus');
const { window: w, document } = t;

const { TooltipService } = await import('../widgets.js');
// No KaTeX here: the listeners attach on the service's 2 s fallback.
await t.tick(2100);
t.ok('the service is the export', typeof TooltipService.show === 'function');

let byKeyboard = true;
const realMatches = w.Element.prototype.matches;
w.Element.prototype.matches = function matches(selector) {
    return selector === ':focus-visible' ? byKeyboard : realMatches.call(this, selector);
};

const frame = () => new Promise((r) => w.requestAnimationFrame(() => r()));
const frames = async () => { await frame(); await frame(); };
const shown = () => !!document.querySelector('.twm-latex-tooltip.visible');
const text = () => document.querySelector('.twm-latex-tooltip')?.textContent;

const make = (tooltip) => {
    const el = document.body.appendChild(document.createElement('button'));
    el.className = 'twm-has-tooltip';
    el.setAttribute('data-tooltip', tooltip);
    return el;
};
const a = make('Save');
const b = make('Open');
const wrapper = document.body.appendChild(document.createElement('div'));
wrapper.className = 'twm-has-tooltip';
wrapper.setAttribute('data-tooltip', 'Around');
const inner = [wrapper.appendChild(document.createElement('input')), wrapper.appendChild(document.createElement('input'))];
const plain = document.body.appendChild(document.createElement('button'));

t.section('§1 focus shows, leaving hides');
a.focus();
await frames();
t.check('focus shows it', [shown(), text()], [true, 'Save']);
b.focus();
await frames();
t.check('focus moving on shows the next', [shown(), text()], [true, 'Open']);
plain.focus();
await frames();
t.ok('focus on something without one hides it', !shown());
inner[0].focus();
await frames();
t.check('focus inside a target shows it', [shown(), text()], [true, 'Around']);
inner[1].focus();
await frames();
t.ok('and moving inside keeps it', shown());
plain.focus();
await frames();

t.section('§2 a click\'s focus');
byKeyboard = false;
a.focus();
await frames();
t.ok('shows nothing', !shown());
plain.focus();
byKeyboard = true;

t.section('§3 the pointer check');
a.focus();
await frames();
await t.tick(3100);
t.ok('three seconds on, with no pointer on it, it stands', shown());
plain.focus();
await frames();

t.section('§4 passing through');
a.focus();
plain.focus();
await frames();
t.ok('focus gone within the frame leaves nothing standing', !shown());

t.section('§5 Esc');
a.focus();
await frames();
a.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
t.ok('hides it', !shown());
plain.focus();

t.done();
