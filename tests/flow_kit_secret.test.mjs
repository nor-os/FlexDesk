/**
 * THE SECRET WIDGET (36 §3.3, 0.20.0) — a setting whose value the settings never
 * hold: an API key, a password, a token, kept by the consumer's keeper.
 *
 *   §1  it asks the keeper whether one is stored and says so: Checking…, then
 *       Stored (Replace, Clear) or Not stored (Set); the stored value is never
 *       asked for and never shown
 *   §2  Set opens a password box: Save hands the text to the keeper and the
 *       settings get nothing (no onChange, the step's config untouched); the
 *       box is emptied; Enter saves, Escape cancels
 *   §3  a keeper's refusal (an answer or a throw) is said under the field, the
 *       typed text stays and the box keeps the focus; Clear removes the secret
 *   §4  no keeper: refused on screen, by name; a status the keeper cannot give
 *       is Not known, with the reason
 *   §5  a value written into the settings themselves is said, and Remove from
 *       the settings is the one write the widget makes (`undefined`)
 *   §6  read only: nothing can be set or cleared; every editor that builds a
 *       panel hands it its `secrets`
 *
 *     node tests/flow_kit_secret.test.mjs
 */
import { flowEnv } from './flow_env.mjs';

const t = await flowEnv('flow kit — secret widget');
const { createSettingsPanel } = await import('../src/flow/kit/settings_panel.js');
const { createWidgetRegistry, GENERIC_WIDGETS } = await import('../src/flow/kit/widgets.js');
const { document } = t;

const SOURCE = {
    type_id: 'source', label: 'Source',
    config_schema: { type: 'object', properties: {
        base_url: { type: 'string' },
        api_key: { type: 'string', title: 'API key', 'x-ui-widget': 'secret' },
    } },
};

/** A keeper in memory that records every call; `refuse` and `throws` script its answers. */
function keeper(initial = {}) {
    const kept = new Map(Object.entries(initial));
    const calls = [];
    const k = {
        calls, kept, refuse: null, throws: null, statusFails: null,
        status(q) { calls.push(['status', q.stepId, q.key]); if (k.statusFails) throw new Error(k.statusFails); return kept.has(q.key); },
        async store(q, text) {
            calls.push(['store', q.stepId, q.key, text]);
            if (k.throws) throw new Error(k.throws);
            if (k.refuse) return { ok: false, error: k.refuse };
            kept.set(q.key, text);
            return { ok: true };
        },
        async clear(q) { calls.push(['clear', q.stepId, q.key]); kept.delete(q.key); },
    };
    return k;
}

function setup(secrets, config = {}, opts = {}) {
    const changes = [];
    const panel = createSettingsPanel({ widgets: createWidgetRegistry(), secrets, host: t.host(),
                                        onChange: (...a) => changes.push(a), ...opts });
    const step = { id: 'fred', type: 'source', label: 'FRED', config };
    panel.show({ step, type: SOURCE, title: step.label });
    const field = () => panel.el.querySelector('[data-field="api_key"]');
    const q = (s) => field().querySelector(s);
    const action = (id) => q(`[data-action="${id}"]`);
    return { panel, changes, step, field, q, action };
}
const settle = async () => { await t.tick(); await t.tick(); };

t.section('§1 Stored or Not stored, never the secret');
{
    t.ok('secret is a generic widget', typeof GENERIC_WIDGETS.secret === 'function');
    const k = keeper({ api_key: 'not-real' });
    const { q, action } = setup(k);
    t.check('Checking… until the keeper answers', q('.twm-flow-secret__status').textContent, 'Checking…');
    t.ok('Set waits for the answer', action('set').disabled);
    await settle();
    t.check('the keeper was asked for this step and key', k.calls, [['status', 'fred', 'api_key']]);
    t.check('Stored', q('.twm-flow-secret__status').textContent, 'Stored');
    t.ok('the stored class', q('.twm-flow-secret__status').classList.contains('twm-flow-secret__status--stored'));
    t.check('Replace and Clear', [action('set').textContent, action('clear').textContent], ['Replace', 'Clear']);
    t.ok('the password box is hidden', q('.twm-flow-secret__editor').hidden);
    t.ok('the secret is nowhere in the field', !q('.twm-flow-secret').outerHTML.includes('not-real'));
    t.check('the box is empty', q('input').value, '');

    const empty = setup(keeper());
    await settle();
    t.check('Not stored, Set, no Clear', [empty.q('.twm-flow-secret__status').textContent, empty.action('set').textContent,
                                          empty.action('clear')], ['Not stored', 'Set', null]);
}

t.section('§2 Save hands the text to the keeper, never to the settings');
{
    const k = keeper();
    const { q, action, changes, step, panel } = setup(k, { base_url: 'https://x' });
    await settle();
    t.press(action('set'));
    const box = q('input');
    t.check('a password box, not remembered by the browser', [box.type, box.autocomplete], ['password', 'new-password']);
    t.ok('it has the focus', document.activeElement === box);
    t.ok('the editor is shown', !q('.twm-flow-secret__editor').hidden);
    t.typeInto(box, 'fred-key-not-real');
    t.press(action('save'));
    await settle();
    t.check('the keeper got it', k.calls.at(-1), ['store', 'fred', 'api_key', 'fred-key-not-real']);
    t.check('no change was reported', changes, []);
    t.check('the step\'s config is untouched', step.config, { base_url: 'https://x' });
    t.check('nor does the panel\'s working copy hold it', panel.value, { base_url: 'https://x' });
    t.check('Stored, the box emptied and hidden', [q('.twm-flow-secret__status').textContent, box.value, q('.twm-flow-secret__editor').hidden],
            ['Stored', '', true]);

    t.press(action('set'));
    t.typeInto(q('input'), 'second');
    t.key(q('input'), 'Enter');
    await settle();
    t.check('Enter saves', k.kept.get('api_key'), 'second');
    t.press(action('set'));
    t.typeInto(q('input'), 'abandoned');
    t.key(q('input'), 'Escape');
    t.check('Escape cancels: nothing stored, the box emptied', [k.kept.get('api_key'), q('input').value, q('.twm-flow-secret__editor').hidden],
            ['second', '', true]);
    t.press(action('set'));
    t.press(action('save'));
    await settle();
    t.check('an empty box saves nothing', k.calls.filter((c) => c[0] === 'store').length, 2);
}

t.section('§3 a refusal is said; Clear');
{
    const k = keeper();
    const { q, action } = setup(k);
    await settle();
    k.refuse = 'No Windows Credential Manager is available.';
    t.press(action('set'));
    t.typeInto(q('input'), 'kept');
    t.press(action('save'));
    t.ok('busy: Save and Cancel wait', action('save').disabled && action('cancel').disabled);
    await settle();
    t.check('the refusal under the field', q('.twm-flow-secret__message').textContent, 'No Windows Credential Manager is available.');
    t.ok('it is shown', !q('.twm-flow-secret__message').hidden);
    t.check('the typed text stays, the box keeps the focus', [q('input').value, document.activeElement === q('input')], ['kept', true]);
    t.check('still Not stored', q('.twm-flow-secret__status').textContent, 'Not stored');
    k.refuse = null;
    k.throws = 'store locked';
    t.press(action('save'));
    await settle();
    t.check('a throw is a refusal too', q('.twm-flow-secret__message').textContent, 'store locked');
    k.throws = null;
    t.press(action('save'));
    await settle();
    t.check('then it is stored, the message gone', [q('.twm-flow-secret__status').textContent, q('.twm-flow-secret__message').hidden],
            ['Stored', true]);
    t.press(action('clear'));
    await settle();
    t.check('Clear asks the keeper', k.calls.at(-1), ['clear', 'fred', 'api_key']);
    t.check('Not stored again', q('.twm-flow-secret__status').textContent, 'Not stored');
}

t.section('§4 no keeper; a status the keeper cannot give');
{
    const { q, field } = setup(null);
    t.check('refused on screen', q('.twm-flow-field__refusal').textContent,
            'This setting is a secret, and this editor has nowhere to keep one. Nothing is written into the settings.');
    t.ok('no box to type a secret into', field().querySelector('input') === null);
    const k = keeper();
    k.statusFails = 'access denied';
    const s = setup(k);
    await settle();
    t.check('Not known, and why', [s.q('.twm-flow-secret__status').textContent, s.q('.twm-flow-secret__message').textContent],
            ['Not known', 'Whether one is stored is not known: access denied']);
    t.check('it can still be set or cleared', [s.action('set').disabled, Boolean(s.action('clear'))], [false, true]);
}

t.section('§5 a value in the settings themselves');
{
    const k = keeper();
    const { q, action, changes } = setup(k, { api_key: 'written-in-a-file' });
    await settle();
    t.check('it is said', q('.twm-flow-secret__in-settings').firstChild.textContent,
            'A value is written into the settings themselves, where a secret does not belong.');
    t.ok('and not shown', !q('.twm-flow-secret').outerHTML.includes('written-in-a-file'));
    t.press(action('remove-from-settings'));
    t.check('removed from the settings: the one write', changes, [['fred', 'api_key', undefined]]);
    t.ok('the note is gone', q('.twm-flow-secret__in-settings') === null);
    t.check('the keeper was not touched', k.calls.map((c) => c[0]), ['status']);
}

t.section('§6 read only; the editors hand it on');
{
    const k = keeper({ api_key: 'x' });
    const { action } = setup(k, {}, { readOnly: { reason: 'Read only.' } });
    await settle();
    t.ok('Replace and Clear are disabled', action('set').disabled && action('clear').disabled);
    for (const file of ['src/flow/lanes/editor.js', 'src/flow/canvas_editor/editor.js', 'src/flow/outline/editor.js']) {
        t.ok(`${file} hands the panel its secrets`, /createSettingsPanel\(\{[\s\S]*?\bsecrets\b[\s\S]*?\}\);/.test(t.read(file)));
    }
}

t.done();
