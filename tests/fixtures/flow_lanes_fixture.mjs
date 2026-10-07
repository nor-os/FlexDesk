/**
 * The lane editor's fixture data — a data-flow step catalogue, the approved
 * mock's flow (*Applications from the portal*, 2026-10-06) and the preview and
 * description answers the mock draws — shared by the `flow_lanes_*` suites
 * and the demo page (`demo/flow_lanes.html`).
 *
 * The types are a consumer's, in a consumer's words; the lane editor names
 * none of them. Each declares its FLOW ports in the order that is meaning: the
 * first input is the lane's, a join's second input takes another lane.
 */

const F = (name, direction, extra = {}) => ({ name, direction, port_type: 'FLOW', ...extra });
const IN = F('in', 'input');
const OUT = F('out', 'output');

export const CATEGORIES = Object.freeze([
    { id: 'source', label: 'Read', tone: 'teal' },
    { id: 'transform', label: 'Change', tone: 'indigo' },
    { id: 'operation', label: 'Combine', tone: 'violet' },
    { id: 'sink', label: 'Write', tone: 'amber' },
]);

export const TYPES = Object.freeze([
    { type_id: 'read-system', label: 'Read', category: 'source', role: 'source', icon: 'database',
      description: 'Reads a dataset of a registered system. Starts a lane.', ports: [OUT],
      config_schema: { type: 'object', required: ['dataset'], properties: {
          dataset: { type: 'string', title: 'Dataset', 'x-ui-placeholder': 'schema.table' },
          read: { type: 'string', title: 'Read', enum: ['all', 'newer'], 'x-ui-widget': 'choice-cards',
                  'x-ui-enum-labels': { all: 'Every row, every time', newer: 'Only rows newer than the last successful run' } },
          newer_by: { type: 'string', title: 'Newer by', 'x-ui-placeholder': 'a column of the dataset',
                      'x-ui-when': { field: 'read', in: ['newer'] } },
      } } },
    { type_id: 'read-table', label: 'Read', category: 'source', role: 'source', icon: 'table',
      description: 'Reads a table, as the flow’s identity. Starts a lane.', ports: [OUT],
      config_schema: { type: 'object', required: ['table'], properties: {
          table: { type: 'string', title: 'Table' },
      } } },
    { type_id: 'filter', label: 'Filter', category: 'transform', role: 'transform', icon: 'filter_alt',
      description: 'Keeps the rows a formula says yes to.', ports: [IN, OUT],
      config_schema: { type: 'object', required: ['condition'], properties: {
          condition: { type: 'string', title: 'Keep rows where', 'x-ui-widget': 'expression',
                       'x-ui-references': ['formula', 'parameter'],
                       description: 'A formula. {{intake}} is this flow’s parameter.' },
      } } },
    { type_id: 'add-columns', label: 'Add columns', category: 'transform', role: 'transform', icon: 'function',
      description: 'Adds or replaces columns, each from a formula.', ports: [IN, OUT],
      config_schema: { type: 'object', properties: {
          columns: { type: 'array', title: 'Columns', 'x-ui-widget': 'key-value-list', 'x-ui-add-label': 'Add a column' },
      } } },
    { type_id: 'rename', label: 'Rename', category: 'transform', role: 'transform', icon: 'edit_note',
      description: 'Chooses the columns that go on, and what they are called.', ports: [IN, OUT],
      config_schema: { type: 'object', properties: {
          keep: { type: 'array', title: 'Columns', 'x-ui-widget': 'upstream-columns' },
          unlisted: { type: 'string', title: 'Columns not listed', enum: ['drop', 'keep'], default: 'drop',
                      'x-ui-enum-labels': { drop: 'Drop them', keep: 'Keep them as they are' } },
      } } },
    { type_id: 'join', label: 'Join', category: 'operation', role: 'operation', icon: 'join',
      description: 'Brings a second lane in where the columns match. The line from that lane is drawn for you.',
      ports: [F('in', 'input', { label: 'This lane' }), F('in_right', 'input', { label: 'Joined lane', required: true }), OUT],
      config_schema: { type: 'object', required: ['on'], properties: {
          how: { type: 'string', title: 'Keep', enum: ['left', 'inner'], default: 'left',
                 'x-ui-enum-labels': { left: 'Every row of this lane (a left join)', inner: 'Only rows that match (an inner join)' } },
          on: { type: 'string', title: 'Match on', 'x-ui-widget': 'upstream-column' },
      } } },
    { type_id: 'union', label: 'Union', category: 'operation', role: 'operation', icon: 'stacks',
      description: 'Stacks the rows of several lanes.', ports: [IN, F('in_2', 'input', { label: 'Second' }),
                                                               F('in_3', 'input', { label: 'Third' }), OUT] },
    { type_id: 'write-table', label: 'Write', category: 'sink', role: 'sink', icon: 'download',
      description: 'Writes the rows into a table. Ends the lane.', ports: [IN],
      config_schema: { type: 'object', required: ['table'], properties: {
          table: { type: 'string', title: 'Table' },
          how: { type: 'string', title: 'How to write', enum: ['upsert', 'append', 'replace'],
                 'x-ui-enum-labels': { upsert: 'Upsert — update a matching row, insert the rest', append: 'Append',
                                       replace: 'Replace' } },
          reject_at_most: { type: 'integer', title: 'Reject at most', minimum: 0, default: 50 },
      } } },
    { type_id: 'archive', label: 'Archive', category: 'transform', role: 'transform', icon: 'inventory_2',
      description: 'Not available here.', ports: [IN, OUT], unavailable: 'Archiving is switched off on this server.' },
]);

const node = (id, type, label, config = {}) => ({ id, type, label, config });
const conn = (id, sourceId, targetId, targetPort = 'in', sourcePort = 'out') => ({ id, sourceId, sourcePort, targetId, targetPort });

/** The `Pipeline` mock's flow, in docs/08's JSON. */
export const MOCK_PIPELINE = Object.freeze({
    nodes: [
        node('src', 'read-system', 'Portal applications', { dataset: 'public.applications', read: 'newer', newer_by: 'submitted_at' }),
        node('intake', 'filter', 'This intake only', { condition: '[intake] = {{intake}}' }),
        node('prog', 'read-table', 'Programmes', { table: 'Programmes' }),
        node('join', 'join', 'Add the programme', { how: 'left', on: 'programme_code' }),
        node('tidy', 'add-columns', 'Tidy names, emails', { columns: [
            { variable: 'full_name', expression: 'TRIM([first_name] & " " & [last_name])' },
            { variable: 'email', expression: 'LOWER(TRIM([email]))' }] }),
        node('rename', 'rename', 'Name the columns', { keep: ['application_id', 'full_name', 'email', 'Programme', 'Faculty', 'intake', 'submitted_at'] }),
        node('sink', 'write-table', 'Into Applications', { table: 'Applications', how: 'upsert' }),
    ],
    connections: [
        conn('c1', 'src', 'intake'), conn('c2', 'intake', 'join'), conn('c3', 'prog', 'join', 'in_right'),
        conn('c4', 'join', 'tidy'), conn('c5', 'tidy', 'rename'), conn('c6', 'rename', 'sink'),
    ],
    parameters: { intake: { type: 'text', default: '2027' } },
});

/** One line a card, the mock's own. */
export const SUMMARIES = Object.freeze({
    src: 'public.applications · new rows', intake: 'intake = {{intake}}', prog: 'table Programmes',
    join: 'LEFT on programme_code', tidy: 'full_name +1 more', rename: '7 kept · 6 dropped',
    sink: 'upsert on Application id',
});

// ── what the mock's preview and description say ─────────────────────────

const APPS = [
    ['APP-1041', 'Mara', 'Olsen', 'Mara.Olsen@example.org ', 'CS-BSC', 2027, '2026-10-04 18:12', 'submitted', 'web'],
    ['APP-1042', 'Jonas', 'Petit', 'jonas.petit@example.org', 'ROB-MSC', 2027, '2026-10-04 19:40', 'submitted', 'web'],
    ['APP-1043', 'Leila', 'Haddad', 'LEILA.H@example.org', 'MED-BSC', 2027, '2026-10-05 08:03', 'submitted', 'agent'],
    ['APP-1044', 'Tomás', 'Ruiz', 't.ruiz@example.org', 'CS-BSC', 2026, '2026-10-05 09:27', 'late', 'web'],
    ['APP-1045', 'Anika', 'Shah', 'anika.shah@example.org', 'ART-BA', 2027, '2026-10-05 11:15', 'submitted', 'web'],
    ['APP-1046', 'Wei', 'Zhang', ' wei.zhang@example.org', 'ROB-MSC', 2027, '2026-10-05 14:52', 'submitted', 'fair'],
    ['APP-1047', 'Sofia', 'Moreau', 'sofia.moreau@example.org', 'HIS-BA', 2027, '2026-10-05 16:30', 'submitted', 'web'],
    ['APP-1048', 'Kwame', 'Mensah', 'kwame.m@example.org', 'CS-BSC', 2026, '2026-10-05 21:08', 'late', 'agent'],
];
const PROG = { 'CS-BSC': ['Computer Science BSc', 'Engineering', 120], 'ROB-MSC': ['Robotics MSc', 'Engineering', 30],
               'MED-BSC': ['Medicine BSc', 'Health', 80], 'ART-BA': ['Fine Art BA', 'Arts', 40], 'HIS-BA': ['History BA', 'Arts', 60] };
const SRC_COLS = [['application_id', 'text'], ['first_name', 'text'], ['last_name', 'text'], ['email', 'text'],
                  ['programme_code', 'text'], ['intake', 'number'], ['submitted_at', 'date & time'], ['status', 'text'],
                  ['channel', 'text']];
const col = (name, type, origin = '', change = null) => ({ name, type, origin, change });
const srcCols = SRC_COLS.map(([n, t]) => col(n, t, 'from public.applications'));
const joinCols = [...srcCols.map((c) => col(c.name, c.type, 'from This intake only')),
                  col('Programme', 'text', 'from Programmes', 'new'), col('Faculty', 'text', 'from Programmes', 'new'),
                  col('Places', 'number', 'from Programmes', 'new')];
const tidyCols = [...joinCols.map((c) => (c.name === 'email' ? col('email', 'text', 'changed here', 'changed')
    : col(c.name, c.type, 'from Add the programme'))), col('full_name', 'text', 'new here', 'new')];
const renPairs = [['Application id', 'application_id'], ['Name', 'full_name'], ['Email', 'email'],
                  ['Programme', 'Programme'], ['Faculty', 'Faculty'], ['Intake', 'intake'], ['Submitted', 'submitted_at']];
const renCols = renPairs.map(([to, from]) => col(to, tidyCols.find((c) => c.name === from).type, `was ${from}`));
const sinkCols = [['Application id', 'text'], ['Name', 'text'], ['Email', 'text'], ['Programme', 'choice'],
                  ['Faculty', 'text'], ['Intake', 'number'], ['Submitted', 'date & time']]
    .map(([n, t]) => col(n, t, 'column of Applications'));
const progCols = [col('Code', 'text', 'column of Programmes'), col('Programme', 'text', 'column of Programmes'),
                  col('Faculty', 'text', 'column of Programmes'), col('Places', 'number', 'column of Programmes')];
const kept = APPS.filter((r) => r[5] === 2027);
const joined = kept.map((r) => r.concat(PROG[r[4]]));
const tidied = joined.map((r) => {
    const out = r.slice();
    out[3] = String(r[3]).trim().toLowerCase();
    return out.concat([`${r[1]} ${r[2]}`.trim()]);
});
const renamed = tidied.map((r) => [r[0], r[12], r[3], r[9], r[10], r[5], r[6]]);
const choices = { 'Computer Science BSc': 1, 'Medicine BSc': 1, 'Fine Art BA': 1, 'History BA': 1 };
const strip = (cols) => cols.map((c) => ({ name: c.name, type: c.type }));

/** The `preview` provider's answer for the mock's flow. */
export const MOCK_PREVIEW = Object.freeze({ nodes: {
    src: { status: 'success', rows: 1000, total: 1284, columns: strip(srcCols), head: APPS,
           caption: 'First 8 of 1,000 previewed rows — read as you.' },
    intake: { status: 'success', rows: 318, columns: strip(srcCols), head: kept,
              caption: 'First 6 of the 318 previewed rows it keeps.' },
    prog: { status: 'success', rows: 18, columns: strip(progCols), head: Object.keys(PROG).map((k) => [k, ...PROG[k]]),
            caption: 'First 5 of 18 rows.' },
    join: { status: 'success', rows: 318, columns: strip(joinCols), head: joined,
            caption: 'First 6 of 318 rows. Three columns arrive from the Programmes lane; its Code is dropped.' },
    tidy: { status: 'success', rows: 318, columns: strip(tidyCols), head: tidied,
            caption: 'First 6 of 318 rows. full_name is new; email is trimmed and lower-cased.' },
    rename: { status: 'success', rows: 318, columns: strip(renCols), head: renamed,
              caption: 'First 6 of 318 rows, as the table will receive them.' },
    sink: { status: 'success', rows: 316, columns: strip(sinkCols), head: renamed.filter((r) => choices[r[3]]),
            caption: 'What would be written: first 4 of 316 rows. A preview writes nothing.',
            rejects: renamed.filter((r) => !choices[r[3]]).map((r) => ({ row: [r[0], r[1]], column: 'Programme',
                                                                       reason: `“${r[3]}” is not one of the column’s choices.` })) },
} });

/** The `describe` provider's answer: each step's columns, with where each comes from. */
export const MOCK_DESCRIBE = Object.freeze({ nodes: {
    src: { columns: srcCols }, intake: { columns: srcCols.map((c) => col(c.name, c.type, 'from Portal applications')) },
    prog: { columns: progCols }, join: { columns: joinCols }, tidy: { columns: tidyCols },
    rename: { columns: renCols }, sink: { columns: sinkCols },
} });

/** The last run, as the consumer would build it from its run's step records. */
export const MOCK_RUN = Object.freeze({
    steps: {
        src: { state: 'success', line: '1,284 · 2.1 s' }, intake: { state: 'success', line: '412 · 0.1 s' },
        prog: { state: 'cached', line: '18 · cached' }, join: { state: 'success', line: '412 · 0.2 s' },
        tidy: { state: 'success', line: '412 · 0.1 s' }, rename: { state: 'success', line: '412 · 0.0 s' },
        sink: { state: 'success', line: '409 · 3 rejected', tone: 'warning' },
    },
    banner: 'Drawn on version 2, the version the last run used.',
});
