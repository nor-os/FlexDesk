/**
 * line_diff.js — what changed between two texts, as lines to draw.
 *
 * Two ways in, one shape out:
 *
 *   computeLineDiff(before, after)   the two texts themselves, compared here
 *   parseUnifiedDiff(text)           what `git diff` printed, read here
 *
 * Both answer an array of DiffLine:
 *
 *   { kind: 'context' | 'add' | 'del', oldLine, newLine, text }
 *   { kind: 'gap', oldLine: null, newLine: null, text: '', hidden }   unchanged lines left out
 *   { kind: 'hunk' | 'meta' | 'file', oldLine: null, newLine: null, text }
 *
 * `oldLine` and `newLine` are 1-based, and null on the side a line is not on.
 * There is no DOM here and nothing about what the text is: a consumer that
 * compares only part of a file says where that part starts (`beforeStart`,
 * `afterStart`) and the numbers are the file's.
 */

/** Past this many differing lines a side, computeLineDiff answers null rather than compare. */
export const LINE_DIFF_LIMIT = 1500;

/**
 * A text as its lines. CRLF and LF are the same line end, and a final line end
 * does not make a last empty line.
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
export function splitLines(text) {
    const s = String(text ?? '');
    if (s === '') return [];
    const lines = s.split(/\r?\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
}

/** The edit script of two line arrays, by longest common subsequence: deletions before additions. */
function editScript(a, b) {
    const n = a.length;
    const m = b.length;
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && a[i] === b[j]) { ops.push(['context', i, j]); i++; j++; }
        else if (i < n && (j >= m || lcs[i + 1][j] >= lcs[i][j + 1])) { ops.push(['del', i, -1]); i++; }
        else { ops.push(['add', -1, j]); j++; }
    }
    return ops;
}

/**
 * Compare two texts line by line.
 *
 * Unchanged lines at the start and the end are set aside first, so `maxLines`
 * limits the part that actually differs: a long file with a small edit is
 * compared, however long it is.
 *
 * @param {string|null|undefined} before
 * @param {string|null|undefined} after
 * @param {Object} [options]
 * @param {number} [options.context=3] - Unchanged lines kept around each change; `Infinity` keeps them all.
 * @param {number} [options.maxLines=LINE_DIFF_LIMIT]
 * @param {number} [options.beforeStart=1] - The line number of `before`'s first line.
 * @param {number} [options.afterStart=1] - The line number of `after`'s first line.
 * @returns {Array<Object>|null} DiffLines; `[]` when the texts have the same lines, `null` when too long to compare.
 */
export function computeLineDiff(before, after, {
    context = 3,
    maxLines = LINE_DIFF_LIMIT,
    beforeStart = 1,
    afterStart = 1,
} = {}) {
    const a = splitLines(before);
    const b = splitLines(after);

    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head
        && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

    const midA = a.slice(head, a.length - tail);
    const midB = b.slice(head, b.length - tail);
    if (midA.length === 0 && midB.length === 0) return [];
    if (midA.length > maxLines || midB.length > maxLines) return null;

    const ops = [];
    for (let k = 0; k < head; k++) ops.push(['context', k, k]);
    for (const [kind, i, j] of editScript(midA, midB)) {
        ops.push([kind, i < 0 ? -1 : i + head, j < 0 ? -1 : j + head]);
    }
    for (let k = tail; k > 0; k--) ops.push(['context', a.length - k, b.length - k]);

    // A line is kept when a change is within `context` lines of it, either way.
    const keep = new Uint8Array(ops.length);
    let reach = -1;
    for (let k = 0; k < ops.length; k++) {
        if (ops[k][0] !== 'context') reach = k + context;
        if (k <= reach) keep[k] = 1;
    }
    reach = ops.length;
    for (let k = ops.length - 1; k >= 0; k--) {
        if (ops[k][0] !== 'context') reach = k - context;
        if (k >= reach) keep[k] = 1;
    }

    const out = [];
    let skipped = 0;
    ops.forEach(([kind, i, j], k) => {
        if (!keep[k]) { skipped++; return; }
        if (skipped > 0 && out.length > 0) {
            out.push({ kind: 'gap', oldLine: null, newLine: null, text: '', hidden: skipped });
        }
        skipped = 0;
        out.push({
            kind,
            oldLine: i < 0 ? null : beforeStart + i,
            newLine: j < 0 ? null : afterStart + j,
            text: j < 0 ? a[i] : b[j],
        });
    });
    return out;
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Read a unified diff into DiffLines: `diff --git`, `index`, `---` and `+++`
 * headers are left out, a `@@` line is a `hunk`, and `\ No newline at end of
 * file` and `Binary files … differ` are `meta`. A diff of several files has a
 * `file` line before each file's hunks; a diff of one file has none.
 * @param {string|null|undefined} text
 * @returns {Array<Object>}
 */
export function parseUnifiedDiff(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    const fileHeaders = lines.filter((l) => l.startsWith('diff --git ')).length;
    const out = [];
    const header = (kind, line) => out.push({ kind, oldLine: null, newLine: null, text: line });
    let oldNo = 0;
    let newNo = 0;
    let oldLeft = 0;
    let newLeft = 0;
    for (const line of lines) {
        if (oldLeft > 0 || newLeft > 0) {
            const sign = line[0];
            const body = line.slice(1);
            if (sign === '-') {
                out.push({ kind: 'del', oldLine: oldNo++, newLine: null, text: body });
                oldLeft--;
            } else if (sign === '+') {
                out.push({ kind: 'add', oldLine: null, newLine: newNo++, text: body });
                newLeft--;
            } else if (sign === '\\') {
                header('meta', line);
            } else {
                // A context line; a tool that strips trailing blanks leaves it empty.
                out.push({ kind: 'context', oldLine: oldNo++, newLine: newNo++, text: body });
                oldLeft--;
                newLeft--;
            }
            continue;
        }
        const hunk = HUNK_RE.exec(line);
        if (hunk) {
            oldNo = Number(hunk[1]);
            newNo = Number(hunk[3]);
            oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
            newLeft = hunk[4] === undefined ? 1 : Number(hunk[4]);
            header('hunk', line);
        } else if (line.startsWith('\\') || /^Binary files .* differ$/.test(line)) {
            header('meta', line);
        } else if (line.startsWith('diff --git ') && fileHeaders > 1) {
            header('file', / b\/(.*)$/.exec(line)?.[1] ?? line.slice('diff --git '.length));
        }
    }
    return out;
}

/**
 * How many lines a diff adds and removes, for a one-glance summary.
 * @param {Array<Object>} lines - DiffLines.
 * @returns {{ added: number, removed: number }}
 */
export function diffStats(lines) {
    let added = 0;
    let removed = 0;
    for (const l of lines) {
        if (l.kind === 'add') added++;
        else if (l.kind === 'del') removed++;
    }
    return { added, removed };
}
