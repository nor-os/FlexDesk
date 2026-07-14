/**
 * Where the help modal gets its help.
 *
 * HelpModal used to `import { getHelpService, HELP_TOPICS } from './help_service.js'` —
 * and help_service.js is 249 domain words of EcoAgent prose about sectors,
 * currencies, agents and markets. That import was the last framework -> domain
 * edge in the core: a generic modal reaching into one application's manual.
 *
 * The modal now asks this registry, and the application fills it. If nobody
 * fills it, the modal opens and says there is no help — which is the correct
 * behaviour for a library that ships no documentation about your app.
 *
 * @typedef {Object} HelpProvider
 * @property {() => string[]} getCategories
 * @property {(category: string) => Array<{id: string, title: string}>} getTopicsByCategory
 * @property {(id: string) => Promise<Object|null>} loadTopic
 * @property {(query: string) => Array<Object>} searchTopics
 *
 * @typedef {Object.<string, {label: string, icon: string}>} HelpCategories
 *   Keyed by category id; ITERATION ORDER IS DISPLAY ORDER.
 *
 * @typedef {{title: string, welcome: string}} HelpCopy
 *   The landing heading. The modal used to hardcode "EcoAgent Help" and
 *   "Welcome to EcoAgent!".
 */

/** A provider with nothing in it. Not an error — just an app with no help. */
const EMPTY_PROVIDER = Object.freeze({
    getCategories: () => [],
    getTopicsByCategory: () => [],
    loadTopic: async () => null,
    searchTopics: () => [],
});

const DEFAULT_COPY = Object.freeze({
    title: 'Help',
    welcome: 'Select a topic from the sidebar or browse the categories below.',
});

let _provider = EMPTY_PROVIDER;
let _categories = Object.freeze({});
let _copy = DEFAULT_COPY;

/**
 * @param {HelpProvider} provider
 * @param {HelpCategories} [categories] Display labels + icons, in display order.
 * @param {Partial<HelpCopy>} [copy] Landing heading and welcome line.
 */
export function setHelpProvider(provider, categories = {}, copy = {}) {
    _provider = provider ?? EMPTY_PROVIDER;
    _categories = Object.freeze({ ...categories });
    _copy = Object.freeze({ ...DEFAULT_COPY, ...copy });
}

export function helpProvider() {
    return _provider;
}

export function helpCategories() {
    return _categories;
}

export function helpCopy() {
    return _copy;
}
