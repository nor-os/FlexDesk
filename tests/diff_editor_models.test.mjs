/**
 * ══ createDiffEditor(): setModels() AND dispose() OWN THE ATTACHED PAIR ═══
 *
 * BUG-0024. setModels() disposed the FIRST pair of models while the diff editor
 * still held it, and never remembered the pair it created, so dispose() freed
 * only that first pair (twice). The reproduction:
 *
 *     h = createDiffEditor(el, 'a', 'b');
 *     h.setModels('c', 'd'); h.setModels('e', 'f'); h.dispose();
 *     monaco.editor.getModels()          // -> c, d, e, f left registered
 *
 * Monaco is a peer dependency and is not installed here, so this suite stands a
 * small fake in for it: a model registry (`getModels()`), and a diff editor that
 * records any model disposed while it is still attached — the condition real
 * Monaco reports as "TextModel got disposed before DiffEditorWidget model got
 * reset".
 */

let failures = 0;
const ok = (what, cond, detail = '') => {
    if (cond) { console.log(`  ok   ${what}`); return; }
    failures += 1;
    console.log(`  FAIL ${what}${detail ? `\n       ${detail}` : ''}`);
};

function createFakeMonaco() {
    const registry = new Set();
    const editors = [];
    const violations = [];
    let doubleDisposals = 0;

    function createModel(value, language) {
        const model = {
            value, language, disposed: false,
            getValue() { return this.value; },
            dispose() {
                if (this.disposed) { doubleDisposals += 1; return; }
                if (editors.some(e => !e.disposed && e.holds(this))) {
                    violations.push(this.value);
                }
                this.disposed = true;
                registry.delete(this);
            },
        };
        registry.add(model);
        return model;
    }

    function createDiffEditor() {
        const editor = {
            disposed: false,
            current: null,
            setModel(pair) { this.current = pair ? { ...pair } : null; },
            getModel() { return this.current; },
            holds(m) { return !!this.current && (this.current.original === m || this.current.modified === m); },
            dispose() { this.disposed = true; this.current = null; },
        };
        editors.push(editor);
        return editor;
    }

    return {
        editor: {
            createModel,
            createDiffEditor,
            getModels: () => [...registry],
            defineTheme() {},
            setTheme() {},
        },
        violations,
        get doubleDisposals() { return doubleDisposals; },
    };
}

// initMonaco() touches exactly this much of the page: a CSS <link>, and an AMD
// `require` it calls back with `window.monaco`.
const fake = createFakeMonaco();
globalThis.window = globalThis;
globalThis.document = {
    getElementById: () => null,
    createElement: () => ({}),
    head: { appendChild() {} },
};
globalThis.require = Object.assign((deps, cb) => cb(), { config() {} });
globalThis.monaco = fake;

const { initMonaco, MonacoEditorFactory } = await import('../editor.js');
await initMonaco('fake/monaco');
const factory = await new MonacoEditorFactory().init();
const container = {};
const values = () => fake.editor.getModels().map(m => m.value).sort().join(',');

console.log('§1 the reproduction from the record leaves no models behind');
{
    const h = factory.createDiffEditor(container, 'a', 'b');
    ok('two models registered after create', values() === 'a,b', values());
    h.setModels('c', 'd');
    ok('setModels frees the previous pair', values() === 'c,d', values());
    ok('the new pair is the one attached',
        h.editor.getModel().original.value === 'c' && h.editor.getModel().modified.value === 'd');
    h.setModels('e', 'f');
    ok('a second setModels frees the second pair', values() === 'e,f', values());
    h.dispose();
    ok('dispose() leaves no models registered', fake.editor.getModels().length === 0, values());
    ok('no model was disposed twice', fake.doubleDisposals === 0, String(fake.doubleDisposals));
}

console.log('§2 no model is disposed while the diff editor still holds it');
ok('no attached-model disposal', fake.violations.length === 0, fake.violations.join(','));

console.log('§3 the language argument still applies to the replacement pair');
{
    const h = factory.createDiffEditor(container, 'x', 'y', { language: 'json' });
    h.setModels('p', 'q');
    ok('default language kept', h.editor.getModel().original.language === 'json');
    h.setModels('r', 's', 'markdown');
    ok('explicit language used', h.editor.getModel().modified.language === 'markdown');
    h.dispose();
    ok('dispose() clears this editor too', fake.editor.getModels().length === 0, values());
}

console.log('§4 dispose() without setModels() still frees the initial pair');
{
    const h = factory.createDiffEditor(container, 'm', 'n');
    h.dispose();
    ok('initial pair freed', fake.editor.getModels().length === 0, values());
    ok('still no double disposal', fake.doubleDisposals === 0, String(fake.doubleDisposals));
}

if (failures) {
    console.log(`\ndiff_editor_models: ${failures} failure(s)`);
    process.exit(1);
}
console.log('\ndiff_editor_models: all passed');
