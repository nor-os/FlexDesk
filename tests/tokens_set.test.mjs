/**
 * ══ EVERY TOKEN flexdesk.css READS WITH NO FALLBACK IS SET IN A STYLESHEET ══
 *
 * A property set only inline, by the component that uses it, is invisible to a
 * consumer's gate that reads the sheets, and such a gate is right to complain: a
 * rule reading it on an element the component did not touch computes to nothing.
 * BugDesk's `every token flexdesk.css reads without a fallback is set somewhere`
 * went red on `--twm-wspicker-rows` and `--twm-wspicker-columns` this way.
 *
 *   §1  no token is read bare and set nowhere in tokens.css or flexdesk.css
 *   §2  the two workspace picker properties carry their fallbacks
 *
 *     node tests/tokens_set.test.mjs
 */
import { assertions } from './flow_env.mjs';

const t = assertions('tokens set');

const defined = (text) => new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
const sheet = t.css('flexdesk.css');

t.section('§1 read bare, set nowhere');
{
    const have = new Set([...defined(t.css('tokens.css')), ...defined(sheet)]);
    const bare = new Set([...sheet.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)].map((m) => m[1]));
    t.check('none', [...bare].filter((v) => !have.has(v)), []);
}

t.section('§2 the workspace picker');
{
    t.ok('a capped list falls back to six rows', sheet.includes('calc(var(--twm-wspicker-rows, 6) * 38px)'));
    t.ok('the tiles fall back to two columns, as the component does',
         sheet.includes('repeat(var(--twm-wspicker-columns, 2), minmax(0, 1fr))'));
}

t.done();
