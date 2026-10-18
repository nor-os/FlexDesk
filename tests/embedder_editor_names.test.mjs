/**
 * STORY-0038 — THE EDITOR THEME NAMES AND THE CHART EXPORT FILENAME ARE THE
 * EMBEDDER'S.
 *
 *   §1  with nothing configured, the built-in Monaco themes are registered as
 *       flexdesk-dark / flexdesk-light and a new editor starts on flexdesk-dark
 *   §2  setEditorThemeNames() registers them under the embedder's names, and a
 *       factory created afterwards starts on the embedder's dark name
 *   §3  the chart PNG export is named 'chart' by default and
 *       setChartExportFilename() renames it for every chart that follows
 *
 * Monaco is a peer dependency and is not installed here: a fake records the
 * themes defined and the options each editor was created with.
 *
 *     node tests/embedder_editor_names.test.mjs
 */

let failures = 0;
function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
    else console.log(`  ok   ${name}`);
}

const defined = [];
const created = [];
const themesSet = [];
globalThis.window = globalThis;
globalThis.document = {
    getElementById: () => null,
    createElement: () => ({}),
    head: { appendChild() {} },
};
globalThis.requestAnimationFrame = () => 0;
globalThis.require = Object.assign((deps, cb) => cb(), { config() {} });
globalThis.monaco = {
    editor: {
        defineTheme: (name) => defined.push(name),
        setTheme: (name) => themesSet.push(name),
        create: (container, options) => {
            created.push(options.theme);
            return {
                onDidContentSizeChange: () => ({ dispose() {} }),
                getContentHeight: () => 100,
                layout() {}, updateOptions() {}, dispose() {},
                getValue: () => '', setValue() {},
                onDidChangeModelContent: () => ({ dispose() {} }),
                getModel: () => null,
            };
        },
    },
};

const editor = await import('../editor.js');
await editor.initMonaco('fake/monaco');

console.log('§1 no names configured: flexdesk-dark and flexdesk-light');
{
    check('DEFAULT_EDITOR_THEME_NAMES', editor.DEFAULT_EDITOR_THEME_NAMES,
        { dark: 'flexdesk-dark', light: 'flexdesk-light' });
    check('getEditorThemeNames() answers the defaults', editor.getEditorThemeNames(),
        { dark: 'flexdesk-dark', light: 'flexdesk-light' });
    const factory = await new editor.MonacoEditorFactory().init();
    check('the built-in themes are defined under the default names', defined, ['flexdesk-dark', 'flexdesk-light']);
    factory.createEditor({ style: {}, closest: () => null }, 'x');
    check('a new editor starts on flexdesk-dark', created.at(-1), 'flexdesk-dark');
    await new editor.MonacoEditorFactory().init();
    check('a second factory defines nothing twice', defined, ['flexdesk-dark', 'flexdesk-light']);
}

console.log('§2 setEditorThemeNames(): the embedder\'s names');
{
    editor.setEditorThemeNames({ dark: 'app-dark', light: 'app-light' });
    check('getEditorThemeNames() answers them', editor.getEditorThemeNames(),
        { dark: 'app-dark', light: 'app-light' });
    const factory = await new editor.MonacoEditorFactory().init();
    check('the built-in themes are defined under the new names too',
        defined.slice(2), ['app-dark', 'app-light']);
    factory.createEditor({ style: {}, closest: () => null }, 'x');
    check('a factory created afterwards starts on app-dark', created.at(-1), 'app-dark');
    factory.setTheme('app-light');
    check('setTheme() takes the embedder\'s name', themesSet.at(-1), 'app-light');
    factory.createEditor({ style: {}, closest: () => null }, 'y');
    check('…and editors created after it use it', created.at(-1), 'app-light');
    editor.setEditorThemeNames();
    check('setEditorThemeNames() with nothing goes back to the defaults', editor.getEditorThemeNames(),
        { dark: 'flexdesk-dark', light: 'flexdesk-light' });
}

console.log('§3 the chart PNG export filename');
{
    const charts = await import('../src/charts/plotly_wrapper.js');
    check('DEFAULT_CHART_EXPORT_FILENAME', charts.DEFAULT_CHART_EXPORT_FILENAME, 'chart');
    check('DEFAULT_CONFIG exports as chart.png by default',
        charts.DEFAULT_CONFIG.toImageButtonOptions.filename, 'chart');
    charts.setChartExportFilename('app_chart');
    check('getChartExportFilename() answers the new name', charts.getChartExportFilename(), 'app_chart');
    const spread = { ...charts.DEFAULT_CONFIG };
    check('a config spread from DEFAULT_CONFIG carries it', spread.toImageButtonOptions.filename, 'app_chart');
    charts.setChartExportFilename();
    check('setChartExportFilename() with nothing goes back to the default', charts.getChartExportFilename(), 'chart');
}

if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
}
console.log('\nembedder editor names: all checks passed');
