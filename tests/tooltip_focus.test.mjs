/**
 * ══ KEYBOARD FOCUS SHOWS A TOOLTIP (0.18.1) ═══════════════════════════════
 *
 * The service listened to the mouse only, so a person on the keyboard never saw
 * what a `twm-has-tooltip` element had to say.
 *
 *   §1  focus by keyboard shows it, leaving hides it, and focus moving inside the
 *       target keeps it
 *   §2  focus after a press of the pointer shows nothing, a text field's included,
 *       and a chord says nothing either way
 *   §3  no pointer is on the target, and the three-second pointer check leaves it
 *   §4  focus passing through within a frame leaves nothing standing
 *   §5  Esc hides it
 *   §6  a scroll, the one focus causes included, does not hide what focus shows
 *   §7  a target with an empty text shows nothing, on focus or on a scroll
 *   §8  a pointer does not take down what focus holds
 *
 * The press-and-focus order and a real scroll are checked in headless Edge too.
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

const keyPress = (init = {}) => document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, ...init }));
const pointerPress = () => document.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));

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
keyPress();
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
pointerPress();
a.focus();
await frames();
t.ok('shows nothing', !shown());
plain.focus();
const field = document.body.appendChild(document.createElement('input'));
field.className = 'twm-has-tooltip';
field.setAttribute('data-tooltip', 'Field');
field.focus();
await frames();
t.ok('nor a text field a script then focuses', !shown());
plain.focus();
inner[0].focus();
await frames();
t.ok('nor a text field inside a target', !shown());
plain.focus();
keyPress({ key: 'k', ctrlKey: true });
a.focus();
await frames();
t.ok('a chord does not make it the keyboard', !shown());
plain.focus();
keyPress();
pointerPress();
keyPress({ key: 'k', ctrlKey: true });
a.focus();
await frames();
t.ok('after a press of the pointer, whatever chord came since', !shown());
plain.focus();
keyPress({ key: 'b' });
keyPress({ key: 'k', ctrlKey: true });
field.focus();
await frames();
t.check('nor undoes it', [shown(), text()], [true, 'Field']);
plain.focus();
await frames();
const stopped = document.body.appendChild(document.createElement('div'));
stopped.tabIndex = -1;
stopped.addEventListener('pointerdown', (e) => e.stopPropagation(), true);
stopped.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
a.focus();
await frames();
t.ok('a press something stops on its way down still counts', !shown());
plain.focus();
keyPress();

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
document.dispatchEvent(new w.Event('scroll'));
await frames();
t.ok('and a scroll does not bring it back', !shown());
plain.focus();

t.section('§6 a scroll');
const scroll = () => document.dispatchEvent(new w.Event('scroll'));
let underPoint = null;
document.elementFromPoint = () => underPoint;
a.focus();
// What a browser does for a target it has to bring into view: the scroll's event
// comes in the frame, ahead of the frame's callbacks.
underPoint = a;
scroll();
await frames();
t.check('the scroll focus causes does not hide it', [shown(), text()], [true, 'Save']);
const top = () => document.querySelector('.twm-latex-tooltip').style.top;
const before = top();
a.getBoundingClientRect = () => ({ left: 100, top: 300, right: 150, bottom: 320, width: 50, height: 20 });
scroll();
t.ok('it goes with its target', top() !== before);
underPoint = plain;
scroll();
t.ok('a target out of sight has none', !shown());
underPoint = a;
scroll();
t.ok('back in sight it has it again', shown());
plain.focus();
t.ok('leaving still hides it', !shown());
underPoint = null;
scroll();
t.ok('and a scroll after that shows nothing', !shown());

// Focus holds nothing: the pointer's tooltip still goes on a scroll.
TooltipService.show(a);
await frames();
t.ok('the pointer\'s tooltip is up', shown());
scroll();
t.ok('and a scroll hides it', !shown());
TooltipService.hide();

t.section('§7 nothing to say');
const empty = make('');
keyPress();
empty.focus();
await frames();
t.ok('focus on an empty text shows nothing', !shown());
underPoint = empty;
scroll();
await frames();
t.ok('nor does a scroll', !shown());
plain.focus();
await frames();

t.section('§8 a pointer and what focus holds');
const enter = (el) => el.dispatchEvent(new w.MouseEvent('mouseenter'));
const leave = (el) => el.dispatchEvent(new w.MouseEvent('mouseleave'));
const focusOn = async (el) => { keyPress(); el.focus(); await frames(); };
const tip = () => (shown() ? text() : null);

enter(a);
await frames();
t.check('the pointer on one target', tip(), 'Save');
underPoint = a;
await focusOn(b);
t.check('focus on another takes it over', tip(), 'Open');
await t.tick(3100);
t.check('the first one\'s pointer check leaves it', [document.activeElement === b, tip()], [true, 'Open']);
let asked = 0;
document.elementFromPoint = () => { asked += 1; return underPoint; };
await t.tick(3100);
t.check('and has stopped', asked, 0);
leave(a);
await frames();
t.check('the pointer leaving the first leaves it', tip(), 'Open');

enter(b);
await frames();
leave(b);
await frames();
t.check('the pointer crossing the focused target leaves it', tip(), 'Open');

underPoint = b;
enter(a);
await frames();
t.check('the pointer on another shows that one', tip(), 'Save');
leave(a);
await frames();
t.check('and off it, focus has it back', tip(), 'Open');

enter(a);
await frames();
underPoint = a;
await t.tick(3100);
t.check('the pointer still there keeps its own', tip(), 'Save');
underPoint = b;
await t.tick(3100);
await frames();
t.check('its pointer check gives it back', tip(), 'Open');

enter(a);
await frames();
scroll();
await frames();
t.check('a scroll takes the pointer\'s and gives it back', tip(), 'Open');

enter(a);
await frames();
underPoint = plain;
leave(a);
await frames();
t.ok('focus\'s target out of sight stays unshown', !shown());
underPoint = b;
scroll();
t.check('and shows again in sight', tip(), 'Open');

underPoint = a;
enter(a);
await frames();
plain.focus();
await frames();
t.check('focus leaving leaves the pointer\'s', tip(), 'Save');
leave(a);
await frames();
t.ok('which goes with the pointer', !shown());

await focusOn(empty);
enter(a);
await frames();
t.check('focus with nothing to say holds nothing', tip(), 'Save');
leave(a);
await frames();
t.ok('so the pointer\'s goes', !shown());
plain.focus();

await focusOn(b);
b.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
enter(a);
leave(a);
await frames();
t.ok('after Esc, a pointer passing does not bring it back', !shown());
plain.focus();

t.done();
