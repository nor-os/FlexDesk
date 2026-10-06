/**
 * The jsdom set-up every flow suite shares — NOT a suite itself (`run.mjs`
 * runs `*.test.mjs` only). Owned by the kit (36 §2); the editors' suites use it
 * too.
 *
 * jsdom is not a FlexDesk dependency; like every DOM suite here it is borrowed
 * from the sibling Tables checkout. Without it a suite prints the one marker
 * `run.mjs` reads — `<suite>: SKIPPED — needs jsdom` — and exits 0, which the
 * runner counts as a failure unless `--allow-skips`.
 *
 * ONE DIFFERENCE FROM `dt_env.mjs`, ON PURPOSE: the event constructors are
 * REPLACED with jsdom's, not only filled in when absent. Node ≥ 19 has its own
 * global `Event`/`CustomEvent`, and jsdom's `dispatchEvent` refuses a foreign
 * event ("parameter 1 is not of type 'Event'") — which is why a clean 0.5.0
 * fails `tiles_data_source.test.mjs` under Windows' node 24. A kit module that
 * builds an event builds jsdom's here, under any node.
 *
 * jsdom computes no layout and has no editing: a test can assert the DOM, the
 * classes, the selection and the events a module dispatches, never where
 * something is drawn or what a real key does in a `contenteditable`. Those
 * are settled in headless Edge (the README's flow-kit section says which).
 *
 *     const t = await flowEnv('flow kit — widgets');
 *     t.section('§1 …'); t.ok('…', cond); t.check('…', got, want); t.done();
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The assertion helpers, with no DOM: what a pure suite uses. */
export function assertions(suite) {
    let failures = 0;
    const check = (name, actual, expected) => {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e) { failures++; console.error(`  FAIL ${name}\n    got      ${a}\n    expected ${e}`); }
        else console.log(`  ok   ${name}`);
    };
    const ok = (name, cond, detail = '') => {
        if (cond) console.log(`  ok   ${name}`);
        else { failures++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
    };
    const throws = (name, fn, pattern = null) => {
        try {
            fn();
        } catch (err) {
            ok(name, !pattern || pattern.test(String(err?.message ?? err)), String(err?.message ?? err));
            return;
        }
        ok(name, false, 'did not throw');
    };
    const section = (title) => console.log(`\n${title}`);
    const done = () => {
        if (failures) {
            console.error(`\n${suite}: ${failures} assertion(s) FAILED`);
            process.exit(1);
        }
        console.log(`\n${suite}: all assertions passed`);
    };
    const css = (name) => readFileSync(resolvePath(HERE, '../css', name), 'utf8');
    const read = (rel) => readFileSync(resolvePath(HERE, '..', rel), 'utf8');
    return { check, ok, throws, section, done, css, read, root: resolvePath(HERE, '..') };
}

/** jsdom installed on `globalThis`, and the helpers. */
export async function flowEnv(suite) {
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

    const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true });
    const w = dom.window;
    const FORCE = ['Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'InputEvent', 'UIEvent',
                   'CompositionEvent'];
    const FILL = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Text', 'Range', 'Selection',
                  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver',
                  'Option', 'DOMParser', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement',
                  'DocumentFragment', 'navigator'];
    for (const key of FORCE) {
        if (w[key] !== undefined) {
            try { globalThis[key] = w[key]; } catch { Object.defineProperty(globalThis, key, { value: w[key], configurable: true, writable: true }); }
        }
    }
    for (const key of FILL) {
        if (w[key] === undefined || globalThis[key] !== undefined) continue;
        try { globalThis[key] = w[key]; } catch { /* a read-only global of this node */ }
    }
    globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
    w.HTMLElement.prototype.scrollIntoView ||= function scrollIntoView() {};

    const base = assertions(suite);
    const fire = (el, type, init = {}, Kind = w.Event) => el.dispatchEvent(new Kind(type, {
        bubbles: true, cancelable: true, ...init,
    }));
    const mouse = (type, el, init = {}) => fire(el, type, { button: 0, ...init }, w.MouseEvent);
    /** A press the way a browser reports one: mousedown, mouseup, click. */
    const press = (el, init = {}) => {
        mouse('mousedown', el, init);
        mouse('mouseup', el, init);
        return mouse('click', el, { detail: 1, ...init });
    };
    const key = (el, k, init = {}) => fire(el, 'keydown', { key: k, ...init }, w.KeyboardEvent);
    /** Type `value` into an `<input>`/`<textarea>` and say so the way a browser does. */
    const typeInto = (el, value) => { el.value = value; fire(el, 'input'); };
    const change = (el, value) => { if (value !== undefined) el.value = value; fire(el, 'change'); };
    const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
    const host = () => {
        const h = w.document.createElement('div');
        w.document.body.appendChild(h);
        return h;
    };
    return { ...base, dom, window: w, document: w.document, fire, mouse, press, key, typeInto, change, tick, host };
}
