/**
 * Reading a stylesheet as TEXT, for the suites that hold a CSS contract jsdom
 * cannot apply. NOT a suite (`run.mjs` runs `*.test.mjs` only).
 */

/** Comments out, so a selector quoted in a comment is not taken for a rule. */
export function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The declarations of the rule whose selector list is exactly `selector`
 * (whitespace-normalised), or null. The FIRST such rule wins; `all` returns
 * every one.
 */
export function ruleBody(css, selector, { all = false } = {}) {
    const want = norm(selector);
    const found = [];
    const text = stripComments(css);
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (norm(m[1]) === want) {
            if (!all) return m[2];
            found.push(m[2]);
        }
    }
    return all ? found : null;
}

function norm(s) {
    return String(s).trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');
}
