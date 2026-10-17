/**
 * ══ SLIDER FIELD: NUMBER BOX, READOUT, DEFAULT AND RESET, ENABLE TOGGLE ══════
 *
 * STORY-0045. `SliderField` rendered only the range. Its companions are opt-in
 * through `field`, and this suite holds each one:
 *
 *   §1  Without companions the DOM is what it was: the range, then the helper.
 *   §2  Dragging updates the number box (and readout) live; one onChange, on release.
 *   §3  Typing a value + Enter moves the slider and reports once; clamped to
 *       the range; a following blur does not report it again.
 *   §4  'abc', '' and 'Infinity' typed leave the value unchanged and report nothing.
 *   §5  defaultValue: the root is --modified while the value differs; reset
 *       restores it, clears the state and reports.
 *   §6  setValue / setRange / setEnabled: silent reports nothing; an unchanged
 *       value reports nothing (no echo); a real change reports once.
 *   §7  The enable toggle: off reports disabledValue and disables the inputs.
 *   §8  The readout formatter; base.css mirrors flexdesk.css's companion rules.
 *
 *     node tests/slider_field.test.mjs
 *
 * It imports `../src/ui/components/slider_field.js` DIRECTLY, never `dist/`.
 * jsdom is borrowed from the sibling Tables checkout; absent, this SKIPS loudly.
 */
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const t = await dataTableEnv('slider field');
const { check, ok, section, done, tick, window, css } = t;
const { SliderField } = await import('../src/ui/components/slider_field.js');

const mount = (field = {}) => {
    const calls = [];
    const slider = new SliderField({
        fieldId: 'f',
        field,
        onChange: (value, meta) => calls.push([value, meta.immediate]),
    });
    document.body.appendChild(slider.render());
    return { slider, calls, root: slider.root };
};
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
const drag = (input, value) => { input.value = String(value); fire(input, 'input'); };
const release = (input) => fire(input, 'change');
const type = (input, text) => { input.value = text; };
const enter = (input) => input.dispatchEvent(new window.KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true, cancelable: true,
}));
const frame = () => tick(40);

// ── §1 ─────────────────────────────────────────────────────────────────────
section('§1 no companions: the DOM is unchanged');
{
    const { root, slider } = mount({ min: 0, max: 10, value: 4, helperText: 'h' });
    check('children: range then helper', [...root.children].map((c) => c.className),
          ['twm-slider-field__input', 'twm-slider-field__helper']);
    check('value', slider.sliderInput.value, '4');
    ok('no modified state without a default', !root.classList.contains('twm-slider-field--modified'));
    slider.dispose();
}

// ── §2 ─────────────────────────────────────────────────────────────────────
section('§2 dragging updates the number box live and fires one onChange on release');
{
    const { slider, calls } = mount({ min: 0, max: 100, value: 10, numberInput: true, readout: true });
    const box = slider.numberInput;
    ok('the number box exists', box && box.classList.contains('twm-slider-field__number'));
    check('box starts at the value', box.value, '10');
    drag(slider.sliderInput, 20);
    check('box follows the first drag frame', box.value, '20');
    drag(slider.sliderInput, 35);
    check('box follows the next drag frame', box.value, '35');
    check('readout follows too', slider.readoutEl.textContent, '35');
    await frame();
    check('no onChange while dragging', calls.length, 0);
    drag(slider.sliderInput, 42);
    release(slider.sliderInput);
    await frame();
    check('exactly one onChange, on release, with the released value', calls, [['42', false]]);
    check('box shows the released value', box.value, '42');
    slider.dispose();
}

// ── §3 ─────────────────────────────────────────────────────────────────────
section('§3 typing a value and pressing Enter moves the slider and fires one onChange');
{
    const { slider, calls } = mount({ min: 0, max: 100, step: 1, value: 10, numberInput: true });
    const box = slider.numberInput;
    type(box, '57');
    enter(box);
    check('slider moved', slider.sliderInput.value, '57');
    check('one onChange', calls, [['57', false]]);
    fire(box, 'change'); // the blur after Enter
    check('the blur after Enter does not report it again', calls.length, 1);

    type(box, '250');
    enter(box);
    check('out of range clamps to max: slider', slider.sliderInput.value, '100');
    check('out of range clamps to max: box', box.value, '100');
    type(box, '-3');
    enter(box);
    check('below range clamps to min', slider.sliderInput.value, '0');
    check('each commit reported once', calls, [['57', false], ['100', false], ['0', false]]);

    type(box, ' 12.6 ');
    fire(box, 'change');
    check('a blur commits too, snapped to the step', [slider.sliderInput.value, box.value], ['13', '13']);
    slider.dispose();
}
{
    const { slider } = mount({ min: 0, max: 1, step: 0.1, value: 0.2, numberInput: true });
    type(slider.numberInput, '0.3');
    enter(slider.numberInput);
    check('fractional steps carry no float noise', slider.numberInput.value, '0.3');
    slider.dispose();
}

// ── §4 ─────────────────────────────────────────────────────────────────────
section("§4 typing 'abc' leaves the value unchanged");
{
    const { slider, calls } = mount({ min: 0, max: 100, value: 30, numberInput: true });
    const box = slider.numberInput;
    for (const bad of ['abc', '', '   ', 'Infinity', '1,5x']) {
        type(box, bad);
        enter(box);
        check(`'${bad}': slider unchanged`, slider.sliderInput.value, '30');
        check(`'${bad}': box shows the value again`, box.value, '30');
    }
    type(box, 'abc');
    fire(box, 'change');
    check("'abc' on blur: unchanged", [slider.getValue(), box.value], ['30', '30']);
    check('nothing reported', calls.length, 0);
    check('setValue refuses a non-finite value', slider.setValue('abc'), false);
    slider.dispose();
}

// ── §5 ─────────────────────────────────────────────────────────────────────
section('§5 a default: the modified state, and reset restores it and fires onChange');
{
    const { slider, calls, root } = mount({ min: 0, max: 100, value: 50, defaultValue: 50, numberInput: true });
    const btn = slider.resetButton;
    ok('a reset button', btn && btn.classList.contains('twm-slider-field__reset'));
    ok('at the default: not modified', !root.classList.contains('twm-slider-field--modified'));
    ok('at the default: reset disabled', btn.disabled);
    drag(slider.sliderInput, 70);
    ok('modified as soon as the drag moves off the default',
       root.classList.contains('twm-slider-field--modified'));
    release(slider.sliderInput);
    ok('isModified()', slider.isModified());
    ok('reset enabled', !btn.disabled);
    calls.length = 0;
    btn.click();
    check('reset restores the slider', slider.sliderInput.value, '50');
    check('reset restores the box', slider.numberInput.value, '50');
    ok('modified state cleared', !root.classList.contains('twm-slider-field--modified'));
    check('reset fires onChange once with the default', calls, [['50', false]]);
    type(slider.numberInput, '20');
    enter(slider.numberInput);
    ok('a typed value off the default is modified', root.classList.contains('twm-slider-field--modified'));
    slider.dispose();
}
{
    const { root } = mount({ min: 0, max: 10, value: 3, defaultValue: 5 });
    ok('starting off the default renders modified', root.classList.contains('twm-slider-field--modified'));
    check('a default alone adds the row (slider, reset)',
          [...root.querySelector('.twm-slider-field__row').children].map((c) => c.className),
          ['twm-slider-field__input', 'twm-slider-field__reset']);
}

// ── §6 ─────────────────────────────────────────────────────────────────────
section('§6 setValue / setRange / setEnabled without echo loops');
{
    const { slider, calls } = mount({ min: 0, max: 100, value: 10, numberInput: true, readout: true });
    slider.setValue(60, { silent: true });
    check('setValue(x, {silent:true}) fires no callback', calls.length, 0);
    check('…and moves the slider, box and readout',
          [slider.sliderInput.value, slider.numberInput.value, slider.readoutEl.textContent], ['60', '60', '60']);
    slider.setValue(60);
    check('setValue to the current value fires nothing', calls.length, 0);
    slider.setValue(61);
    check('setValue to a new value fires once', calls, [['61', false]]);

    calls.length = 0;
    slider.setRange({ min: 0, max: 50 }, { silent: true });
    check('setRange silent: no callback', calls.length, 0);
    check('setRange refits the value', [slider.sliderInput.max, slider.sliderInput.value], ['50', '50']);
    slider.setRange({ max: 80 });
    check('setRange that leaves the value alone fires nothing', calls.length, 0);
    slider.setRange({ min: 55 });
    check('setRange that moves the value fires once', calls, [['55', false]]);

    // A caller that writes back in its own onChange does not loop.
    let echoes = 0;
    slider.onChange = (value) => { echoes++; slider.setValue(value); };
    slider.setValue(70);
    check('an onChange that calls setValue back is called once', echoes, 1);
    slider.dispose();
}

// ── §7 ─────────────────────────────────────────────────────────────────────
section('§7 the enable toggle and disabledValue');
{
    const { slider, calls, root } = mount({
        min: 0, max: 10, value: 4, toggleable: true, disabledValue: 0, numberInput: true, defaultValue: 2,
    });
    const toggle = slider.toggleInput;
    ok('a checkbox, checked by default', toggle && toggle.type === 'checkbox' && toggle.checked);
    toggle.checked = false;
    fire(toggle, 'change');
    check('off reports disabledValue', calls, [[0, false]]);
    ok('off: root state', root.classList.contains('twm-slider-field--off'));
    ok('off: slider, box and reset disabled',
       slider.sliderInput.disabled && slider.numberInput.disabled && slider.resetButton.disabled);
    check('getValue() while off', slider.getValue(), 0);
    slider.setEnabled(true, { silent: true });
    check('setEnabled silent: no callback', calls.length, 1);
    ok('on again: the toggle and inputs follow', toggle.checked && !slider.sliderInput.disabled);
    slider.setEnabled(false);
    slider.setEnabled(false);
    check('setEnabled(false) twice reports once', calls, [[0, false], [0, false]]);
    slider.setEnabled(true);
    check('on reports the value', calls.at(-1), ['4', false]);
    slider.dispose();
}
{
    const { slider } = mount({ min: 0, max: 10, value: 4, toggleable: true, enabled: false });
    ok('enabled:false starts off', !slider.toggleInput.checked && slider.sliderInput.disabled);
    check('disabledValue defaults to null', slider.getValue(), null);
    slider.dispose();
}

// ── §8 ─────────────────────────────────────────────────────────────────────
section('§8 readout formatting, and the stylesheet');
{
    const { slider } = mount({ min: 0, max: 1, step: 0.01, value: 0.25, readout: (v) => `${Math.round(v * 100)}%` });
    check('a formatter shapes the readout', slider.readoutEl.textContent, '25%');
    drag(slider.sliderInput, 0.5);
    check('…live while dragging', slider.readoutEl.textContent, '50%');
    slider.dispose();
}
{
    const OPEN = '/* ══ SLIDER FIELD COMPANIONS ';
    const CLOSE = '/* ══ end SLIDER FIELD COMPANIONS ══ */';
    const part = (sheet) => {
        const s = sheet.indexOf(OPEN);
        const e = sheet.indexOf(CLOSE);
        return s >= 0 && e > s ? sheet.slice(s, e + CLOSE.length) : null;
    };
    const flex = part(css('flexdesk.css'));
    ok('flexdesk.css has the companion section', flex);
    check('base.css carries the same section, byte for byte', part(css('base.css')), flex);
    for (const sel of ['.twm-slider-field__row', '.twm-slider-field__number', '.twm-slider-field__readout',
                       '.twm-slider-field__reset', '.twm-slider-field--modified .twm-slider-field__reset']) {
        ok(`${sel} has a rule`, ruleBody(flex || '', sel));
    }
    ok('the reset button is hidden until modified',
       /visibility:\s*hidden/.test(ruleBody(flex || '', '.twm-slider-field__reset') || ''));
}

done();
