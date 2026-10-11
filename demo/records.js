/**
 * The record-list and fact-sheet page (`records.html`): every shape the two
 * 0.7.0 components draw, with long words on purpose, so headless Edge can say
 * what jsdom cannot — that nothing has zero height, that long values wrap
 * inside their box, and that every verb is clickable at its centre.
 *
 * What the page did is written to `window.events` for the probe.
 */
import { createFactTable, createRecordList } from '../widgets.js';

const events = [];
window.events = events;
const said = document.getElementById('said');
const say = (s) => { events.push(s); said.textContent = s; };

const keys = [
    { id: 'k1', name: 'ETL loader', key_id: 'tblk_8f2a91', role: 'acts with the account’s role',
      project: 'Northfield College — Admissions and Enrolment', expires: null, used: '2026-10-05 14:05', state: 'active' },
    { id: 'k2', name: 'Nightly export to the finance warehouse', key_id: 'tblk_77c0de', role: 'Viewer',
      project: 'Finance', expires: '2027-01-01', used: null, state: 'paused' },
    { id: 'k3', name: 'Old integration key', key_id: 'tblk_0001aa', role: 'Editor',
      project: 'Finance', expires: null, used: '2025-12-24 09:00', state: 'off', revoked: true, url: true },
];

window.keysList = createRecordList(document.getElementById('keys'), {
    records: keys,
    label: 'Keys',
    activeKey: 'k1',
    describe: (k) => ({
        name: k.name,
        facts: [k.key_id, k.role, `in ${k.project}`, k.expires ? `expires ${k.expires}` : 'never expires',
                k.used ? `last used ${k.used}` : 'never used'],
        pills: [k.revoked ? { text: 'revoked', tone: 'muted' } : k.state === 'paused'
            ? { text: 'paused', tone: 'warn' } : { text: 'live', tone: 'success' },
                k.url ? { text: 'URL', tone: 'danger', title: 'Readable in a URL' } : null],
        state: k.state,
        verbs: [
            { label: k.state === 'paused' ? 'Resume' : 'Pause',
              refusal: k.revoked ? 'This key is revoked, and revoking cannot be undone.' : null,
              onClick: (r) => say(`verb ${k.state === 'paused' ? 'Resume' : 'Pause'} ${r.id}`) },
            { label: 'Revoke', danger: true,
              refusal: k.revoked ? 'This key is revoked, and revoking cannot be undone.' : null,
              onClick: (r) => say(`verb Revoke ${r.id}`) },
        ],
    }),
    rowAttrs: (k) => ({ 'data-key-id': k.key_id }),
    onActivate: (r) => { say(`open ${r.id}`); window.keysList.setActiveKey(r.id); },
});

window.narrowList = createRecordList(document.getElementById('narrow'), {
    records: [
        { id: 'd1', event: 'row.changed', state: 'dead', attempts: 8,
          last: 'connect ECONNREFUSED 10.0.12.7:8443 — the receiver at https://hooks.receiver.example.internal/tables/very/long/path/that/never/ends refused the connection' },
        { id: 'd2', event: 'view.rows.changed', state: 'active', attempts: 1, last: '200 · 41 ms' },
        { id: 'd3', event: 'workflow.run.failed', state: 'error', attempts: 3, last: '503 · 2.1 s',
          error: 'The receiver answered 503 three times; the next attempt is in 20 minutes.' },
    ],
    describe: (d) => ({
        name: d.event,
        mono: true,
        facts: [`${d.attempts} attempt${d.attempts === 1 ? '' : 's'}`, d.last],
        pills: [{ text: d.state, tone: d.state === 'dead' || d.state === 'error' ? 'danger' : 'success' }],
        state: d.state,
        error: d.error,
        verbs: d.state === 'dead' ? [{ label: 'Replay', primary: true, onClick: (r) => say(`verb Replay ${r.id}`) }] : [],
    }),
    onActivate: (r) => say(`open ${r.id}`),
});

window.clipList = createRecordList(document.getElementById('clip'), {
    facts: 'ellipsis',
    records: [{ id: 'c1', name: 'Ada Lovelace', facts: ['Held through Finance ▸ All staff ▸ Everyone in the building',
                                                          'granted 2026-10-05', 'expires never'] }],
});

createRecordList(document.getElementById('empty'), { records: [], emptyState: 'No connected apps yet.' });

window.factSheet = createFactTable(document.getElementById('facts'), {
    rows: [
        { label: 'Server', value: 'db-main-01.internal' },
        { label: 'Version', value: '16.4', numeric: true },
        { label: 'Connection string', mono: true,
          value: 'postgresql://tables_app@db-main-01.internal:5432/tables_control?application_name=tables-api&sslmode=verify-full&target_session_attrs=read-write' },
        { label: 'Options', value: { pool: { min: 2, max: 16 }, statement_cache: false, prepare_threshold: null } },
        { label: 'Note', value: 'A long sentence that has to wrap inside the value column and never be cut off with an ellipsis, however narrow the card it sits in becomes.' },
        { label: 'Replica', value: null },
    ],
    nullDisplay: '—',
    label: 'Connection',
});

window.compareSheet = createFactTable(document.getElementById('compare'), {
    compare: true,
    headers: ['Field', 'Now', 'After the restore'],
    rows: [
        { label: 'Amount', before: 1200, after: 950, numeric: true },
        { label: 'Status', before: 'approved', after: 'approved' },
        { label: 'Description', before: 'Quarterly licence fee for the analytics platform, invoiced in arrears.',
          after: 'Quarterly licence fee for the analytics platform, invoiced in advance, with the support tier upgraded from standard to premium.' },
        { label: 'Reviewer', after: 'Bea Beta' },
        { label: 'Legacy code', before: 'LIC-0042' },
        { label: 'Row id', value: 4711 },
    ],
});

window.columnSheet = createFactTable(document.getElementById('columns'), {
    headers: ['Schema', 'Provisioned', 'Changed by', 'Tables'],
    numeric: [3],
    rows: [['app', 'yes', 'system:deploy', 14], ['meta', 'yes', 'system:deploy', 9],
           ['an', 'no — no analytical store is attached to this deployment']],
});

window.ready = true;
