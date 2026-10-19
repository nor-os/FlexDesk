/**
 * ══ createEditor({ maxHeight }) AND handle.setMaxHeight(): THE CAP IS AN OPTION ══
 *
 * STORY-0058. The auto-height cap used to come from a `data-code-max-height`
 * attribute on a `.notebook-editor-container` ancestor, watched by a
 * MutationObserver, and was a hard-coded 400px. It is now the `maxHeight`
 * option (px, `Infinity` for none, the default) and `setMaxHeight(px)`, which
 * applies at once.
 *
 * Monaco is a peer dependency and is not installed here, so a fake editor
 * stands in for it: content height is `lines * 19`, `updateOptions` is
 * recorded, and `onDidContentSizeChange` hands back the listener so a suite
 * can fire it. "Scrolls internally" is Monaco's `scrollbar.handleMouseWheel`
 * being on: off, Monaco does not take the wheel and it reaches the outer
 * scroller.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let failures = 0;
const ok = (what, cond, detail = '') => {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${detail ? `\n       ${detail}` : ''}`);
};

const LINE = 19;
function fakeEditor() {
    const listeners = [];
    const ed = {
        lines: 1,
        options: { scrollbar: {} },
        layouts: 0,
        getContentHeight() { return this.lines * LINE; },
        layout() { this.layouts += 1; },
        updateOptions(o) { if (o.scrollbar) this.options.scrollbar = { ...this.options.scrollbar, ...o.scrollbar }; },
        onDidContentSizeChange(cb) { listeners.push(cb); return { dispose() { listeners.length = 0; } }; },
        onDidChangeModelContent() { return { dispose() {} }; },
        getValue() { return ''; },
        setValue() {},
        focus() {},
        dispose() {},
        /** Monaco fires this when the content height changes. */
        setLines(n) { this.lines = n; listeners.forEach((cb) => cb()); },
        get wheel() { return this.options.scrollbar.handleMouseWheel; },
    };
    return ed;
}

const created = [];
const fake = {
    editor: {
        create(container, opts) {
            const ed = fakeEditor();
            ed.createOptions = opts;
            created.push(ed);
            return ed;
        },
        defineTheme() {}, setTheme() {},
    },
};

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
globalThis.require = Object.assign((deps, cb) => cb(), { config() {} });
globalThis.requestAnimationFrame = () => 0;
globalThis.monaco = fake;

const { initMonaco, MonacoEditorFactory } = await import('../editor.js');
await initMonaco('fake/monaco');
const factory = await new MonacoEditorFactory().init();
const container = () => ({ style: {}, querySelector: () => null });

console.log('§1 maxHeight 200 with 50 lines: 200px tall, scrolls internally');
{
    const el = container();
    const h = factory.createEditor(el, '', { maxHeight: 200 });
    const ed = created.at(-1);
    ed.setLines(50);
    ok('the container is 200px tall', el.style.height === '200px', el.style.height);
    ok('Monaco handles the wheel (internal scroll)', ed.wheel === true, String(ed.wheel));
    ok('maxHeight is not passed on to Monaco as an editor option', !('maxHeight' in ed.createOptions));
    h.dispose();
}

console.log('§2 setMaxHeight(Infinity) grows it to its content immediately');
{
    const el = container();
    const h = factory.createEditor(el, '', { maxHeight: 200 });
    const ed = created.at(-1);
    ed.setLines(50);
    const layouts = ed.layouts;
    h.setMaxHeight(Infinity);
    ok('the container is the content height at once', el.style.height === `${50 * LINE}px`, el.style.height);
    ok('the editor was laid out again', ed.layouts === layouts + 1);
    ok('the wheel goes back to the outer scroller', ed.wheel === false, String(ed.wheel));
    h.setMaxHeight(300);
    ok('setMaxHeight(300) caps it at once', el.style.height === '300px' && ed.wheel === true, `${el.style.height} ${ed.wheel}`);
    h.dispose();
}

console.log('§3 below the cap, wheel events reach the outer scroller');
{
    const el = container();
    const h = factory.createEditor(el, '', { maxHeight: 200 });
    const ed = created.at(-1);
    ed.setLines(5);
    ok('the container is the content height', el.style.height === `${5 * LINE}px`, el.style.height);
    ok('Monaco leaves the wheel alone', ed.wheel === false, String(ed.wheel));
    ed.setLines(2);
    ok('the 80px minimum still applies', el.style.height === '80px', el.style.height);
    ok('and the wheel still passes through', ed.wheel === false);
    h.dispose();
}

console.log('§4 the default is no cap');
{
    const el = container();
    const h = factory.createEditor(el, '');
    const ed = created.at(-1);
    ed.setLines(500);
    ok('500 lines grow to their content', el.style.height === `${500 * LINE}px`, el.style.height);
    ok('the wheel passes through', ed.wheel === false);
    h.dispose();
}

console.log('§5 noAutoHeight: the container keeps its size, the wheel scrolls the editor');
{
    const el = container();
    const h = factory.createEditor(el, '', { noAutoHeight: true, maxHeight: 200 });
    const ed = created.at(-1);
    ed.setLines(50);
    ok('no height is set', el.style.height === undefined, String(el.style.height));
    ok('Monaco handles the wheel', ed.wheel === true);
    h.setMaxHeight(100);
    ok('setMaxHeight leaves the container alone', el.style.height === undefined, String(el.style.height));
    h.dispose();
}

console.log('§6 a cap that is not a positive number is refused');
{
    for (const bad of [0, -5, NaN, '200', null]) {
        let threw = null;
        try { factory.createEditor(container(), '', { maxHeight: bad }); } catch (e) { threw = e; }
        ok(`createEditor({ maxHeight: ${String(bad)} }) throws a RangeError`, threw instanceof RangeError, String(threw));
    }
    const h = factory.createEditor(container(), '', { maxHeight: 200 });
    let threw = null;
    try { h.setMaxHeight(-1); } catch (e) { threw = e; }
    ok('setMaxHeight(-1) throws a RangeError', threw instanceof RangeError, String(threw));
    h.dispose();
}

console.log('§7 the factory no longer reads a DOM attribute or an ancestor');
{
    const src = readFileSync(fileURLToPath(new URL('../src/editor/monaco_editor_factory.js', import.meta.url)), 'utf8');
    ok('no notebook-editor-container', !src.includes('notebook-editor-container'));
    ok('no data-code-max-height / codeMaxHeight', !/code-max-height|codeMaxHeight/.test(src));
    ok('no closest() ancestor lookup', !src.includes('.closest('));
}

if (failures) {
    console.log(`\neditor_max_height: ${failures} failure(s)`);
    process.exit(1);
}
console.log('\neditor_max_height: all passed');
