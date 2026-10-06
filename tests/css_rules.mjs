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

/**
 * The specificity `[ids, classes, elements]` of ONE complex selector (no
 * top-level comma), for the selectors these stylesheets use: classes,
 * attributes, pseudo-classes, `:not()`/`:is()`/`:has()` (their most specific
 * argument), `:where()` (nothing), elements and pseudo-elements. Enough to say
 * which of two rules that reach the same cell wins, which jsdom cannot.
 */
export function specificity(selector) {
    let a = 0;
    let b = 0;
    let c = 0;
    let s = String(selector);
    s = s.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, ' ');
    s = s.replace(/:(?:not|is|has)\(((?:[^()]|\([^()]*\))*)\)/g, (_, arg) => {
        const best = arg.split(',').map(specificity).sort(compareSpecificity).at(-1);
        a += best[0]; b += best[1]; c += best[2];
        return ' ';
    });
    s = s.replace(/::?[\w-]+(?:\([^)]*\))?/g, (m) => {
        if (m.startsWith('::') || /^:(?:before|after|first-line|first-letter)$/.test(m)) c++;
        else b++;
        return ' ';
    });
    a += (s.match(/#[\w-]+/g) || []).length;
    b += (s.match(/\.[\w-]+/g) || []).length + (s.match(/\[[^\]]*\]/g) || []).length;
    s = s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]/g, ' ');
    c += (s.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
    return [a, b, c];
}

/** Negative, zero or positive, as `a` is less, as or more specific than `b`. */
export function compareSpecificity(a, b) {
    return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
}
