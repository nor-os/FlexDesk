/**
 * ══ AN EVENT IS BUILT BY ITS TARGET'S WINDOW ══
 *
 * `dispatchEvent` takes only an event from the target's realm. Node ≥ 19 has a
 * global `Event` and `CustomEvent`, jsdom refuses both, and `ManagedWindow`'s
 * close used a bare `new CustomEvent`: nine suites died in the middle of a close
 * under Node 24, and so did any consumer's suite that closed a window.
 *
 *   §1  no file under src/ builds an event with a bare constructor
 *   §2  with Node's constructors on the global, a window's whole life runs and
 *       its events arrive
 *   §3  `fireEvent` builds from the target's own window, even another document's
 *
 *     node tests/event_realm.test.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { flowEnv } from './flow_env.mjs';

const NodeEvent = globalThis.Event;
const NodeCustomEvent = globalThis.CustomEvent;

const t = await flowEnv('event realm');
const { window: w, document } = t;

// flowEnv puts jsdom's constructors on the global. This suite wants what a
// consumer's suite has when it only sets `window` and `document`.
globalThis.Event = NodeEvent;
globalThis.CustomEvent = NodeCustomEvent;

const { ManagedWindow } = await import('../src/ui/components/managed_window.js');
const { fireEvent } = await import('../src/ui/utils/fire_event.js');

t.section('§1 no bare constructor under src/');
{
    const hits = [];
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) { walk(p); continue; }
            readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
                if (/^\s*(\*|\/\/)/.test(line)) return;
                if (/(?<![.\w])new (Event|CustomEvent|KeyboardEvent|MouseEvent|PointerEvent)\(/.test(line)) {
                    hits.push(`${relative(t.root, p).replace(/\\/g, '/')}:${i + 1}`);
                }
            });
        }
    };
    walk(join(t.root, 'src'));
    t.check('no hits', hits, []);
}

t.section("§2 a window's whole life, with Node's constructors on the global");
{
    const heard = [];
    for (const name of ['minimized', 'restored', 'maximized', 'closed']) {
        w.addEventListener(`managed-window-${name}`, (e) => heard.push([name, e.detail.id]));
    }
    const win = new ManagedWindow({ id: 'realm', title: 'Realm', content: document.createElement('div'), persistGeometry: false });
    win.show();
    win.minimize();
    win.show();
    win.toggleMaximize();
    win.close();
    t.check('every event arrived, with its detail', heard,
            [['minimized', 'realm'], ['restored', 'realm'], ['maximized', 'realm'], ['closed', 'realm']]);
    t.ok('the window is closed', win.isClosed);
}

t.section("§3 fireEvent uses the target's own window");
{
    const input = document.createElement('input');
    document.body.append(input);
    let seen = null;
    input.addEventListener('change', (e) => { seen = e; });
    fireEvent(input, 'change', { bubbles: true });
    t.ok('the event arrived', !!seen);
    t.ok('built by the page', seen instanceof w.Event);
    t.check('with its init', seen.bubbles, true);

    const frame = document.createElement('iframe');
    document.body.append(frame);
    const other = frame.contentDocument.createElement('input');
    frame.contentDocument.body.append(other);
    let foreign = null;
    other.addEventListener('input', (e) => { foreign = e; });
    fireEvent(other, 'input');
    t.ok("an iframe's element gets the iframe's event", foreign instanceof frame.contentWindow.Event);
}

t.done();
