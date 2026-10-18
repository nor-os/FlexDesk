/**
 * ══ THE WIZARD (STORY-0047) ═══════════════════════════════════════════════
 *
 *   §1  steps are validated; the indicator draws done / current / upcoming
 *   §2  Next is disabled and shows the hint while canAdvance returns {ok:false}
 *   §3  revalidate() after input changes enables Next without re-rendering the body
 *   §4  clicking a done step jumps back; clicking an upcoming step does nothing
 *   §5  an async finish disables the buttons until it settles
 *   §6  a rejected finish marks the current step as error and shows the message
 *   §7  Cancel closes the wizard and calls onCancel exactly once
 *   §8  in a window: the close button cancels, a finish closes the window,
 *       and closing is refused while a finish runs
 *   §9  setStepState, goTo, render cleanups and dispose
 *   §10 every class the wizard sets is styled; the entry point exports it
 *
 *     node tests/wizard.test.mjs
 *
 * jsdom is borrowed from the sibling Tables checkout. Absent, this SKIPS loudly.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataTableEnv } from './dt_env.mjs';
import { ruleBody } from './css_rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const env = await dataTableEnv('wizard');
const { check, ok, section, done, click, key, tick, document } = env;
const { Wizard } = await import('../src/ui/components/wizard.js');

/** A promise and its two handles, so a test decides when a finish settles. */
function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/** Three steps; the first is gated on `data.name`, which its input writes. */
function threeSteps(log = {}) {
    log.renders = { source: 0, options: 0, review: 0 };
    log.cleanups = 0;
    return [
        {
            id: 'source', label: 'Source', icon: 'upload_file',
            render(bodyEl, ctx) {
                log.renders.source++;
                const input = document.createElement('input');
                input.className = 'name';
                input.value = ctx.data.name ?? '';
                input.addEventListener('input', () => { ctx.data.name = input.value; ctx.revalidate(); });
                bodyEl.appendChild(input);
                return () => { log.cleanups++; };
            },
            canAdvance: (ctx) => (ctx.data.name
                ? { ok: true } : { ok: false, hint: 'Enter a name first' }),
        },
        {
            id: 'options', label: 'Options',
            render(bodyEl) { log.renders.options++; bodyEl.textContent = 'options'; },
        },
        {
            id: 'review', label: 'Review',
            render(bodyEl) { log.renders.review++; bodyEl.textContent = 'review'; },
        },
    ];
}

function mountWizard(opts = {}, log = {}) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const wizard = new Wizard({ steps: threeSteps(log), data: {}, ...opts });
    wizard.mount(host);
    return { host, wizard, log };
}

const q = (wizard, sel) => wizard.element.querySelector(sel);
const qa = (wizard, sel) => [...wizard.element.querySelectorAll(sel)];
const nextBtn = (w) => q(w, '.twm-wizard__next');
const backBtn = (w) => q(w, '.twm-wizard__back');
const cancelBtn = (w) => q(w, '.twm-wizard__cancel');
const stepItems = (w) => qa(w, '.twm-wizard__step');
const stepButtons = (w) => qa(w, '.twm-wizard__step-btn');
const message = (w) => q(w, '.twm-wizard__message').textContent;
const stepStates = (w) => stepItems(w).map((li) => ['done', 'current', 'upcoming', 'error']
    .find((s) => li.classList.contains(`twm-wizard__step--${s}`)));
const type = (w, text) => {
    const input = q(w, 'input.name');
    input.value = text;
    input.dispatchEvent(new env.window.Event('input', { bubbles: true }));
};
/** Let the queue and the StateMachine's microtasks run. */
const settle = () => tick(0);

// ─── §1 ──────────────────────────────────────────────────────────────────
section('§1 steps are validated; the indicator draws done / current / upcoming');
{
    let threw = null;
    try { new Wizard({ steps: [] }); } catch (e) { threw = e; }
    ok('no steps throws', threw);
    threw = null;
    try { new Wizard({ steps: [{ id: 'a', render() {} }, { id: 'a', render() {} }] }); } catch (e) { threw = e; }
    ok('a duplicate id throws', threw && /duplicate/.test(threw.message));
    threw = null;
    try { new Wizard({ steps: [{ id: 'a' }] }); } catch (e) { threw = e; }
    ok('a step without render throws', threw && /render/.test(threw.message));

    const { wizard } = mountWizard();
    await settle();
    check('three steps drawn', stepItems(wizard).length, 3);
    check('two connectors join them', qa(wizard, '.twm-wizard__connector').length, 2);
    check('first is current, the rest upcoming', stepStates(wizard), ['current', 'upcoming', 'upcoming']);
    check('current step carries aria-current', stepButtons(wizard)[0].getAttribute('aria-current'), 'step');
    check('an icon is drawn as a glyph', stepButtons(wizard)[0].firstChild.textContent, 'upload_file');
    check('a step without icon shows its number', stepButtons(wizard)[1].firstChild.textContent, '2');
    check('state is "step" once the machine has entered', wizard.state, 'step');
    ok('Back is disabled on the first step', backBtn(wizard).disabled);
    check('the button reads Next before the last step', nextBtn(wizard).textContent, 'Next');
    ok('no data attribute anywhere', !wizard.element.outerHTML.includes('data-'));
    wizard.dispose();
}

// ─── §2 ──────────────────────────────────────────────────────────────────
section('§2 Next is disabled and shows the hint while canAdvance returns {ok:false}');
{
    const { wizard } = mountWizard();
    await settle();
    ok('Next is disabled', nextBtn(wizard).disabled);
    check('the hint is shown in the footer', message(wizard), 'Enter a name first');
    ok('the footer message is styled as a hint',
        q(wizard, '.twm-wizard__message').classList.contains('twm-wizard__message--hint'));
    check('Next carries the hint as its tooltip', nextBtn(wizard).title, 'Enter a name first');
    check('next() through a closed gate does not move', await wizard.next(), false);
    check('still on the first step', wizard.currentStep, 'source');
    click(nextBtn(wizard));
    await settle();
    check('a click on the disabled Next does not move', wizard.currentStep, 'source');
    wizard.dispose();
}

// ─── §3 ──────────────────────────────────────────────────────────────────
section('§3 revalidate() after input changes enables Next without re-rendering the body');
{
    const { wizard, log } = mountWizard();
    await settle();
    const input = q(wizard, 'input.name');
    check('the body rendered once', log.renders.source, 1);
    type(wizard, 'alpha');                         // the step's input handler calls ctx.revalidate()
    ok('Next is enabled', !nextBtn(wizard).disabled);
    check('the hint is gone', message(wizard), '');
    check('Next has no tooltip any more', nextBtn(wizard).title, '');
    check('the body was not rendered again', log.renders.source, 1);
    ok('the very same input element is still in the body', q(wizard, 'input.name') === input);
    check('the input kept its value', input.value, 'alpha');

    wizard.context.data.name = '';                // a change made outside the body
    wizard.revalidate();
    ok('an explicit revalidate() closes the gate again', nextBtn(wizard).disabled);
    check('… and the body is still not re-rendered', log.renders.source, 1);
    wizard.dispose();
}

// ─── §4 ──────────────────────────────────────────────────────────────────
section('§4 clicking a done step jumps back; clicking an upcoming step does nothing');
{
    const { wizard, log } = mountWizard();
    await settle();
    type(wizard, 'alpha');
    click(nextBtn(wizard));
    await settle();
    check('Next moved to the second step', wizard.currentStep, 'options');
    check('states after one Next', stepStates(wizard), ['done', 'current', 'upcoming']);
    ok('the first connector is filled',
        qa(wizard, '.twm-wizard__connector')[0].classList.contains('twm-wizard__connector--done'));
    check('a done step shows a check', stepButtons(wizard)[0].firstChild.textContent, 'check');
    ok('the done step is an enabled button', !stepButtons(wizard)[0].disabled);
    ok('the upcoming step is a disabled button', stepButtons(wizard)[2].disabled);

    click(stepButtons(wizard)[2]);
    await settle();
    check('clicking the upcoming step does nothing', wizard.currentStep, 'options');
    check('… and renders nothing', log.renders.review, 0);
    // Even if the button were enabled by a stylesheet trick, the handler refuses:
    stepButtons(wizard)[2].disabled = false;
    click(stepButtons(wizard)[2]);
    await settle();
    check('an upcoming step refuses the click in code too', wizard.currentStep, 'options');

    click(stepButtons(wizard)[0]);
    await settle();
    check('clicking the done step jumps back to it', wizard.currentStep, 'source');
    check('states after jumping back', stepStates(wizard), ['current', 'upcoming', 'upcoming']);
    check('the first step rendered again, for its new visit', log.renders.source, 2);
    check('… with the data it had', q(wizard, 'input.name').value, 'alpha');
    check('leaving the first step ran its cleanup', log.cleanups, 1);
    wizard.dispose();
}

// ─── §5 ──────────────────────────────────────────────────────────────────
section('§5 an async finish disables the buttons until it settles');
{
    const gate = deferred();
    let finishCalls = 0;
    const { wizard } = mountWizard({ onFinish: () => { finishCalls++; return gate.promise; } });
    await settle();
    type(wizard, 'alpha');
    await wizard.next();
    await wizard.next();
    check('on the last step', wizard.currentStep, 'review');
    check('the button reads Finish', nextBtn(wizard).textContent, 'Finish');
    click(nextBtn(wizard));
    await settle();
    check('onFinish was called', finishCalls, 1);
    check('state is finishing', wizard.state, 'finishing');
    ok('busy', wizard.busy);
    ok('Finish is disabled', nextBtn(wizard).disabled);
    ok('Back is disabled', backBtn(wizard).disabled);
    ok('Cancel is disabled', cancelBtn(wizard).disabled);
    ok('every step button is disabled', stepButtons(wizard).every((b) => b.disabled));
    ok('the root wears the busy class', wizard.element.classList.contains('twm-wizard--busy'));
    check('aria-busy is set', wizard.element.getAttribute('aria-busy'), 'true');

    check('back() while finishing is refused', await wizard.back(), false);
    check('cancel() while finishing is refused', await wizard.cancel(), false);
    check('a second finish() is refused', await wizard.finish(), false);
    check('onFinish still called once', finishCalls, 1);
    const root = wizard.element;
    const host = root.parentNode;

    gate.resolve();
    await settle(); await settle();
    check('a resolved finish ends in "finished"', wizard.state, 'finished');
    ok('the wizard is removed from its host', !host.contains(root));
    check('a refused cancel did not run after the finish settled', wizard.state, 'finished');
}

// ─── §6 ──────────────────────────────────────────────────────────────────
section('§6 a rejected finish marks the current step as error and shows the message');
{
    let attempt = 0;
    const { wizard } = mountWizard({
        onFinish: async () => {
            attempt++;
            await tick(5);
            if (attempt === 1) throw new Error('Server refused the import');
        },
    });
    await settle();
    type(wizard, 'alpha');
    await wizard.next();
    await wizard.next();
    check('finish() resolves false on a rejection', await wizard.finish(), false);
    check('back in the step state', wizard.state, 'step');
    check('still on the last step', wizard.currentStep, 'review');
    check('the current step is drawn as error', stepStates(wizard), ['done', 'done', 'error']);
    check('the error step shows the error glyph', stepButtons(wizard)[2].firstChild.textContent, 'error');
    check('the message is shown', message(wizard), 'Server refused the import');
    ok('the message is styled as an error',
        q(wizard, '.twm-wizard__message').classList.contains('twm-wizard__message--error'));
    check('the message is announced', q(wizard, '.twm-wizard__message').getAttribute('role'), 'alert');
    check('the step tooltip carries the message', stepButtons(wizard)[2].title, 'Server refused the import');
    ok('the buttons are enabled again', !nextBtn(wizard).disabled && !backBtn(wizard).disabled
        && !cancelBtn(wizard).disabled);
    ok('the root is no longer busy', !wizard.element.classList.contains('twm-wizard--busy'));

    const host = wizard.element.parentNode;
    check('a retry that succeeds finishes', await wizard.finish(), true);
    check('state finished', wizard.state, 'finished');
    ok('removed from the host', host.children.length === 0);
}
{
    // A rejection with something other than an Error still shows a message.
    const steps = [{ id: 'only', label: 'Only', render() {} }];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const wizard = new Wizard({ steps, onFinish: () => Promise.reject('plain text reason') });
    wizard.mount(host);
    await wizard.finish();
    check('a non-Error rejection is shown as text',
        wizard.element.querySelector('.twm-wizard__message').textContent, 'plain text reason');
    wizard.dispose();
}

// ─── §7 ──────────────────────────────────────────────────────────────────
section('§7 Cancel closes the wizard and calls onCancel exactly once');
{
    let cancels = 0;
    let finishes = 0;
    let seen = null;
    const { wizard, host } = mountWizard({
        onCancel: (ctx) => { cancels++; seen = ctx; },
        onFinish: () => { finishes++; },
    });
    await settle();
    const btn = cancelBtn(wizard);
    click(btn); click(btn); click(btn);            // a nervous triple click
    await settle(); await settle();
    check('onCancel called exactly once', cancels, 1);
    ok('onCancel receives the context', seen === wizard.context);
    check('state is cancelled', wizard.state, 'cancelled');
    check('the wizard is removed from its host', host.children.length, 0);
    check('cancel() afterwards is refused', await wizard.cancel(), false);
    check('finish() afterwards is refused', await wizard.finish(), false);
    check('onCancel still called once', cancels, 1);
    check('onFinish never called', finishes, 0);
    check('the root is released on close', wizard.element, null);
}

// ─── §8 ──────────────────────────────────────────────────────────────────
section('§8 in a window: the close button cancels, a finish closes the window');
{
    let cancels = 0;
    const wizard = new Wizard({ steps: threeSteps(), data: {}, onCancel: () => { cancels++; } });
    const win = wizard.openInWindow({ id: 'wizard-test-a', title: 'Import' });
    await settle();
    ok('the window is visible', win.isVisible);
    ok('the wizard is inside the window', win.element.contains(wizard.element));
    const closeBtn = [...win.element.querySelectorAll('button')]
        .find((b) => b.className.includes('close'));
    ok('the window has a close button', closeBtn);
    click(closeBtn);
    await settle(); await settle();
    check('the window close button cancels the wizard', wizard.state, 'cancelled');
    check('onCancel called once', cancels, 1);
    ok('the window is closed', !win.isVisible);
}
{
    let cancels = 0;
    const gate = deferred();
    const steps = [{ id: 'only', label: 'Only', render() {} }];
    const wizard = new Wizard({ steps, onFinish: () => gate.promise, onCancel: () => { cancels++; } });
    const win = wizard.openInWindow({ id: 'wizard-test-b', title: 'Import' });
    await settle();
    const finishing = wizard.finish();
    await settle();
    check('finishing', wizard.state, 'finishing');
    win.close();
    key(document, 'Escape');
    await settle();
    ok('closing the window is refused while a finish runs', win.isVisible);
    gate.resolve();
    check('the finish resolves true', await finishing, true);
    ok('a finished wizard closes its window', !win.isVisible);
    check('the refused close did not cancel later', cancels, 0);
}

// ─── §9 ──────────────────────────────────────────────────────────────────
section('§9 setStepState, goTo, render cleanups and dispose');
{
    let cancels = 0;
    const { wizard, log, host } = mountWizard({ onCancel: () => { cancels++; } });
    await settle();
    wizard.setStepState('options', 'error', 'Bad option');
    check('setStepState marks a step as error', stepStates(wizard), ['current', 'error', 'upcoming']);
    check('an upcoming error step is not clickable', stepButtons(wizard)[1].disabled, true);
    wizard.setStepState(1, null);
    check('setStepState by index clears it', stepStates(wizard), ['current', 'upcoming', 'upcoming']);
    let threw = null;
    try { wizard.setStepState('nope', 'error'); } catch (e) { threw = e; }
    ok('an unknown step throws', threw);
    threw = null;
    try { wizard.setStepState('options', 'weird'); } catch (e) { threw = e; }
    ok('an unknown state throws', threw);

    type(wizard, 'alpha');
    check('goTo a step two ahead is refused, gate open or not', await wizard.goTo('review'), false);
    check('goTo the next step through the gate', await wizard.goTo('options'), true);
    check('goTo by index back', await wizard.goTo(0), true);
    check('back() on the first step is refused', await wizard.back(), false);
    check('ctx.index follows', wizard.context.index, 0);
    check('ctx.step follows', wizard.context.step, 'source');

    wizard.dispose();
    check('dispose ran the current step cleanup', log.cleanups, 2);
    check('dispose removed the wizard', host.children.length, 0);
    check('a cancel after dispose is refused', await wizard.cancel(), false);
    check('dispose calls no callback', cancels, 0);
}
{
    const wizard = new Wizard({ steps: threeSteps(), data: {} });
    const win = wizard.openInWindow({ id: 'wizard-test-c' });
    await settle();
    wizard.dispose();
    ok('dispose closes the window it opened', !win.isVisible);
}

// ─── §10 ─────────────────────────────────────────────────────────────────
section('§10 every class the wizard sets is styled; the entry point exports it');
{
    const css = readFileSync(resolvePath(HERE, '../css/flexdesk.css'), 'utf8');
    const src = readFileSync(resolvePath(HERE, '../src/ui/components/wizard.js'), 'utf8');
    // The footer buttons wear `.twm-btn` (and Next `.twm-btn--primary`), the shared
    // button look; `__cancel`, `__back` and `__next` are hooks for embedders and tests.
    const HOOKS = new Set(['twm-wizard__cancel', 'twm-wizard__back', 'twm-wizard__next']);
    const classes = [...new Set(src.match(/twm-wizard[a-z_-]*/g))]
        .filter((c) => !c.endsWith('--') && c !== 'twm-wizard' && !HOOKS.has(c));
    ok('the footer buttons wear the shared button classes',
        /'twm-wizard__next twm-btn--primary'/.test(src) && /`twm-btn \$\{cls\}`/.test(src));
    for (const c of ['twm-wizard', ...classes]) {
        ok(`.${c} is styled`, new RegExp(`\\.${c}(?![a-z_-])[^{]*\\{`).test(css));
    }
    for (const s of ['done', 'current', 'upcoming', 'error']) {
        ok(`.twm-wizard__step--${s} is styled`, css.includes(`.twm-wizard__step--${s}`));
    }
    ok('the wizard CSS reads tokens, not hex', !/#[0-9a-f]{3,6}\b/i.test(
        css.slice(css.indexOf('WIZARD (STORY-0047)'), css.indexOf('end WIZARD'))));
    ok('the root rule exists', ruleBody(css, '.twm-wizard') !== null);

    const widgets = await import('../widgets.js');
    ok('@flexdesk/widgets exports Wizard', widgets.Wizard === Wizard);
}

done();
