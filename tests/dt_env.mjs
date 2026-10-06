/**
 * The jsdom set-up every 0.5.0 DataTable suite shares — NOT a suite itself
 * (`run.mjs` runs `*.test.mjs` only).
 *
 * jsdom is not a FlexDesk dependency; like every DOM suite here it is borrowed
 * from the sibling Tables checkout. Without it a suite prints the one marker
 * `run.mjs` reads — `<suite>: SKIPPED — needs jsdom` — and exits 0, which the
 * runner then counts as a failure unless `--allow-skips`.
 *
 * jsdom computes no layout: everything these suites assert is the DOM, the
 * classes, the inline styles and the stylesheets' TEXT. What the layout does
 * with them was proved in headless Edge (see the 0.5.0 README section).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

export async function dataTableEnv(suite) {
    let JSDOM = null;
    try {
        ({ JSDOM } = await import('jsdom'));
    } catch {
        for (const c of [
            resolvePath(HERE, '../../Tables/web/node_modules/jsdom/lib/api.js'),
            resolvePath(HERE, '../../Tables/node_modules/jsdom/lib/api.js'),
        ]) {
            if (!existsSync(c)) continue;
            ({ JSDOM } = createRequire(import.meta.url)(c));
            break;
        }
    }
    if (!JSDOM) {
        console.log(`${suite}: SKIPPED — needs jsdom `
            + '(`cd ../Tables/web && npm install`, or `npm i -D jsdom` here)');
        process.exit(0);
    }

    const dom = new JSDOM('<!doctype html><body></body>',
                          { url: 'http://localhost/', pretendToBeVisual: true });
    for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event',
                       'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
                       'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
                       'MutationObserver', 'Range']) {
        if (dom.window[key] !== undefined && globalThis[key] === undefined) {
            globalThis[key] = dom.window[key];
        }
    }
    globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };

    const mod = await import('../src/ui/components/data_table.js');

    let failures = 0;
    const check = (name, actual, expected) => {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
        else console.log(`  ok   ${name}`);
    };
    const ok = (name, cond) => check(name, !!cond, true);
    const section = (title) => console.log(`\n${title}`);
    const done = () => {
        if (failures) {
            console.error(`\n${suite}: ${failures} assertion(s) FAILED`);
            process.exit(1);
        }
        console.log('\nall assertions passed');
    };

    const mount = (config = {}, { attach = true } = {}) => {
        const host = document.createElement('div');
        if (attach) document.body.appendChild(host);
        const table = new mod.DataTable(host, config);
        table.render();
        return { host, table };
    };
    /** The data rows on screen — never a spacer or an empty-state row. */
    const bodyRows = (host) => [...host.querySelectorAll('.twm-preview-table-wrap tbody tr')]
        .filter((tr) => tr.__rowIndex !== undefined);
    const mouse = (type, el, init = {}) => el.dispatchEvent(new dom.window.MouseEvent(type, {
        bubbles: true, cancelable: true, button: 0, ...init,
    }));
    /** A single click, the way a browser reports one: detail 1. */
    const click = (el, init = {}) => mouse('click', el, { detail: 1, ...init });
    /** A real double-click's whole sequence: click (1), click (2), dblclick (2). */
    const doubleClick = (el) => {
        click(el, { detail: 1 });
        click(el, { detail: 2 });
        mouse('dblclick', el, { detail: 2 });
    };
    const key = (el, k, init = {}) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
        key: k, bubbles: true, cancelable: true, ...init,
    }));
    const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
    const css = (name) => readFileSync(resolvePath(HERE, '../css', name), 'utf8');

    return {
        dom, window: dom.window, document: dom.window.document, ...mod,
        check, ok, section, done, mount, bodyRows, mouse, click, doubleClick, key, tick, css,
    };
}
