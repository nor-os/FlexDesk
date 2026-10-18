/**
 * BUG-0005: StateGuard module attribution.
 *
 * The guard named a write's module by the first stack frame containing
 * `js_new/` — one application's directory layout. Anywhere else (an app under
 * `src/app/`, the dist chunks) no frame matched, the module was null and no
 * module override could ever apply; and a library's write was attributed to
 * whichever application frame first matched further up. The defaults also
 * shipped an override for one application's file and read that application's
 * debug global.
 *
 * Now a write is attributed to the frame that made it, unless the consumer
 * passes `moduleFramePattern`, and the defaults name nothing of anyone's.
 *
 * The fixtures are real modules on disk, so the frames are real frames:
 *   tests/fixtures/state_guard/src/app/my_widget.js  an application module
 *   tests/fixtures/state_guard/lib/widget_lib.js     a library it calls
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('state guard — module attribution (BUG-0005)');
const { section, ok, check, throws, read } = t;

// Set BEFORE the guard's config module loads: the defaults must not read it.
window.__ECOSIM_DEBUG__ = true;
globalThis.__ECOSIM_DEBUG__ = true;

const { StateGuardService, DEFAULT_STATE_GUARD_CONFIG, normalizeStateGuardConfig } = await import('../core.js');
const app = await import('./fixtures/state_guard/src/app/my_widget.js');

const violations = [];
const eventBus = { emit: (channel, payload) => { if (channel === 'state-guard:violation') violations.push(payload); } };
const strict = (extra = {}) => new StateGuardService({
    eventBus,
    config: { ...DEFAULT_STATE_GUARD_CONFIG, mode: 'strict', ...extra },
});
const el = () => document.createElement('div');
const lastModule = () => violations[violations.length - 1]?.module ?? null;

section('§1 the steps to reproduce: an override for a module under src/app/ applies');
{
    const guard = strict();
    guard.allow('src/app/my_widget.js', ['data-foo']);
    const node = el();
    let error = null;
    try { app.setFoo(node); } catch (err) { error = err; }
    check('setAttribute("data-foo") from my_widget.js does not throw', error && error.message, null);
    check('the attribute was written', node.getAttribute('data-foo'), 'x');
    let removeError = null;
    try { app.removeFoo(node); } catch (err) { removeError = err; }
    check('removeAttribute("data-foo") from my_widget.js is allowed too', removeError && removeError.message, null);
}

section('§2 without the override the violation names the writing module, not "unknown module"');
{
    strict();
    throws('strict mode still blocks the write', () => app.setFoo(el()),
        /StateGuard blocked setAttribute on "data-foo" from \S*src\/app\/my_widget\.js$/);
    ok('the violation event names my_widget.js', /src\/app\/my_widget\.js$/.test(lastModule() ?? ''), lastModule());
    ok('the module is a location without line and column', !/:\d+(:\d+)?$/.test(lastModule() ?? ''), lastModule());
}

section('§3 dataset writes are attributed the same way');
{
    const guard = strict();
    throws('dataset.foo from my_widget.js is blocked without an override', () => app.setFooDataset(el()),
        /dataset:set on "data-foo" from \S*src\/app\/my_widget\.js$/);
    guard.allow('src/app/my_widget.js', [], { datasetKeys: ['foo'] });
    const node = el();
    let error = null;
    try { app.setFooDataset(node); app.deleteFooDataset(node); } catch (err) { error = err; }
    check('dataset.foo set and delete pass with a datasetKeys override', error && error.message, null);
}

section('§4 a library\'s write is the library\'s, not its caller\'s');
{
    const guard = strict();
    const undo = guard.allow('src/app/my_widget.js', ['data-bar']);
    throws('an override for the calling app module does not cover the library\'s write',
        () => app.setBarThroughLibrary(el()),
        /setAttribute on "data-bar" from \S*lib\/widget_lib\.js$/);
    undo();
    guard.allow('lib/widget_lib.js', ['data-bar']);
    const node = el();
    let error = null;
    try { app.setBarThroughLibrary(node); } catch (err) { error = err; }
    check('an override for the library module covers it', error && error.message, null);
}

section('§5 moduleFramePattern: the consumer says which frames name a module');
{
    const guard = strict({ moduleFramePattern: /(src\/app\/[^/]+\.js)/ });
    throws('the library write is attributed to the first matching frame up the stack',
        () => app.setBarThroughLibrary(el()),
        /from src\/app\/my_widget\.js$/);
    check('and the module is the pattern\'s capture group', lastModule(), 'src/app/my_widget.js');
    guard.allow(/^src\/app\/my_widget\.js$/, ['data-bar']);
    let error = null;
    try { app.setBarThroughLibrary(el()); } catch (err) { error = err; }
    check('an anchored override then matches that key', error && error.message, null);

    strict({ moduleFramePattern: /no-such-directory\// });
    throws('with no matching frame the module is unknown', () => app.setFoo(el()), /from unknown module$/);

    const normalized = normalizeStateGuardConfig({ moduleFramePattern: 'src/app/' });
    ok('a string pattern is taken literally', normalized.moduleFramePattern instanceof RegExp
        && normalized.moduleFramePattern.test('x/src/app/y.js') && !normalized.moduleFramePattern.test('srcXapp/'));
    check('no pattern normalizes to null', normalizeStateGuardConfig({}).moduleFramePattern, null);
}

section('§6 a direct handleAttributeMutation call is attributed to its caller');
{
    const guard = strict();
    throws('the caller of the public method is the writer',
        () => guard.handleAttributeMutation(el(), 'setAttribute', 'data-foo', 'x'),
        /from \S*tests\/state_guard_attribution\.test\.mjs$/);
}

section('§7 the defaults name no application');
{
    check('no default module overrides', DEFAULT_STATE_GUARD_CONFIG.moduleOverrides.length, 0);
    check('default mode is warn although an application debug global is set', DEFAULT_STATE_GUARD_CONFIG.mode, 'warn');
    check('default moduleFramePattern is null', DEFAULT_STATE_GUARD_CONFIG.moduleFramePattern, null);
    for (const file of ['src/core/state_guard.js', 'src/core/state_guard_config.js']) {
        const src = read(file);
        ok(`${file} has no js_new path, no panel_controller and no application global`,
            !/js_new|panel_controller|__ECOSIM|ECOSIM/i.test(src));
    }
}

t.done();
