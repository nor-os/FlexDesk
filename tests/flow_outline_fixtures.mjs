/**
 * What the outline suites share — NOT a suite (`run.mjs` runs `*.test.mjs`
 * only): the fixture catalogue, the block mapping a logic-flow consumer would
 * pass (36 §6.2, the first consumer's words), and the corpus.
 *
 * The mapping lives here rather than in a JSON file because a mapping carries
 * functions (an arm's words name its step).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStepCatalogue } from '../src/flow/kit/catalogue.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const json = (name) => JSON.parse(readFileSync(resolve(HERE, 'fixtures', name), 'utf8'));

export const CATALOGUE_FIXTURE = json('flow_outline_catalogue.json');
export const CORPUS = json('flow_outline_corpus.json');

export function catalogue() {
    return createStepCatalogue(CATALOGUE_FIXTURE.types, {
        categories: CATALOGUE_FIXTURE.categories,
        idBase: (type) => String(type.type_id).replace(/^table-/, ''),
    });
}

/** The block mapping, in the words of the mocks. */
export const BLOCKS = Object.freeze({
    start: { role: 'start', label: 'When it runs' },
    end: { role: 'end' },
    step: { input: 'in', continue: 'out' },
    branch: { role: 'branch', arms: { true: 'Then', false: 'Otherwise' }, unconnected: 'stop',
              entry: { label: 'If … otherwise', sub: 'Condition',
                       description: 'Ask a yes-or-no question; run one set of steps or the other.' } },
    fanout: { role: 'fanout', join: { role: 'join', type: 'merge', input: 'in', output: 'out', field: 'join',
                                      foot: { all: 'Then wait for every branch',
                                              any: 'Then go on when the first finishes' } },
              arm: 'Branch {n}', addArm: 'Add a branch',
              entry: { label: 'At the same time', sub: 'Parallel + Merge',
                       description: 'Run branches side by side, then wait for them.' } },
    loop: { role: 'loop', ports: { entry: 'in', next: 'next', body: 'body', done: 'done' },
            foot: 'Next row', skip: 'Go on with the next row', addInside: 'Add a step to the loop',
            entry: { label: 'For each row', sub: 'Loop over rows',
                     description: 'Run the steps inside it once for every row of a table.' } },
    arms: {
        error: { label: (step) => `If ${step.label} fails`, unconnected: 'fail',
                 setting: { label: 'If it fails', unconnected: 'Fail the run',
                            connected: (arm) => `Run the steps under “${arm}”` } },
        empty: { label: 'If there are no rows', unconnected: 'stop',
                 setting: { label: 'If there are no rows', unconnected: 'Stop here',
                            connected: (arm) => `Run the steps under “${arm}”` } },
    },
    types: { 'http-request': { arms: { error: { label: 'If the request fails',
                                                setting: { label: 'If the request fails' } } } } },
});

/** A corpus entry by name. */
export function entry(name) {
    const e = CORPUS.graphs.find((g) => g.name === name);
    if (!e) throw new Error(`no corpus graph called ${name}`);
    return e;
}
