/**
 * renderMarkdown — markdown to an HTML string, safe by default.
 *
 * A CommonMark-ish subset: ATX headings, paragraphs, emphasis, strong,
 * strikethrough, code spans, fenced code, block quotes, ordered and unordered
 * lists (nested), GFM pipe tables, thematic breaks, links, images, autolinks,
 * hard line breaks, backslash escapes and `$…$` / `$$…$$` math. Not in it:
 * setext headings, indented code blocks, reference links, raw HTML blocks.
 *
 * SAFE BY DEFAULT. Every character of the source is text unless markdown makes
 * it markup:
 *
 *   - raw HTML is escaped. `options.allowHtml` names tags that may pass
 *     through — the tag only, never its attributes, and never a tag that runs
 *     or embeds anything (`script`, `iframe`, `svg`, … throw). It is empty by
 *     default. An allowed tag left open is closed at the end of its paragraph,
 *     and a closer with no opener is shown as text.
 *   - a link goes out only to `http:`, `https:`, `mailto:` or a `#anchor`,
 *     always with `rel="noopener noreferrer"`. Any other target — a
 *     `javascript:` URL, a `data:` URL, a relative path — renders the link's
 *     text and no anchor. An image loads only from `http(s):` or a relative
 *     path; otherwise its alt text is shown.
 *
 * What the CALLER returns is trusted: the highlighter's HTML, the math hook's
 * HTML and the extension rules' HTML go into the output as they are.
 *
 * WELL-FORMED WHILE STREAMING. Every element this renderer opens it closes,
 * so any prefix of a document — a chat reply arriving token by token — renders
 * to balanced HTML: an open code fence is closed at the end of the input, an
 * emphasis or a link whose closer has not arrived yet is text, and a table
 * whose delimiter row has not arrived yet is a paragraph.
 *
 *     renderMarkdown(source, {
 *         inline: false,          // true: inline markup only, no blocks, no <p>
 *         allowHtml: [],          // e.g. ['kbd', 'br']
 *         highlight: null,        // (code, lang) => html | null (null: escaped)
 *         math: undefined,        // undefined: window.katex when present;
 *                                 // false: `$` is text; or (tex, {display}) => html | null
 *         inlineRules: [],        // [{ pattern: /\[\[ref:(\w+)\]\]/, render: (match, ctx) => html | null }]
 *         blockRules: [],         // [{ start: /^:::note/, end: /^:::$/, render: ({lines, match, closed}, ctx) => html | null }]
 *     })
 *
 * A rule whose render answers null or undefined declines, and the text is
 * read as markdown. `ctx` carries `escape(text)` and `inline(text)` (render
 * markdown inline with the same options). An inline rule is tried at every
 * position outside a code span, before the built-in markup; a block rule's
 * `start` is tested against each line that begins a block, and the block runs
 * to the first later line matching `end` (inclusive) — or, with no `end`, is
 * that one line. A block whose `end` has not arrived is passed with
 * `closed: false` and runs to the end of the input.
 *
 * @module markdown
 */

/** Tags `allowHtml` refuses: each runs script, embeds content or takes input. */
const NEVER_ALLOWED = new Set([
    'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
    'template', 'noscript', 'textarea', 'title', 'xmp', 'plaintext', 'noembed',
    'svg', 'math', 'link', 'meta', 'base', 'form', 'input', 'button', 'select',
    'option', 'video', 'audio', 'source', 'track', 'img', 'image', 'html',
    'head', 'body', 'portal', 'dialog',
]);
const VOID_TAGS = new Set(['br', 'hr', 'wbr']);

const LINK_URL = /^(?:https?:\/\/|mailto:|#)/i;
const IMAGE_URL = /^(?:https?:\/\/|\/\/|[^:/?#]*(?:[/?#]|$))/i;
const ENTITY = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});/;
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;

const RE = {
    blank: /^[ \t]*$/,
    heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
    hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
    fence: /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/,
    quote: /^ {0,3}> ?/,
    item: /^( {0,3})([-*+]|\d{1,9}[.)])(?=[ \t]|$)([ \t]*)(.*)$/,
    mathOpen: /^ {0,3}\$\$/,
    tableDelim: /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/,
};

/**
 * Text for HTML: text content and attribute values alike.
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** The default math hook: window.katex, looked up per call, when it is there. */
function katexMath(tex, { display }) {
    const katex = globalThis.window?.katex ?? globalThis.katex;
    if (typeof katex?.renderToString !== 'function') return null;
    try {
        return katex.renderToString(tex, { displayMode: display, throwOnError: false });
    } catch {
        return null;
    }
}

function compileOptions(options) {
    const allow = new Set();
    for (const raw of options.allowHtml ?? []) {
        const tag = String(raw).toLowerCase();
        if (!/^[a-z][a-z0-9-]*$/.test(tag)) {
            throw new TypeError(`renderMarkdown: allowHtml entry "${raw}" is not a tag name`);
        }
        if (NEVER_ALLOWED.has(tag)) {
            throw new TypeError(`renderMarkdown: <${tag}> cannot be allowed`);
        }
        allow.add(tag);
    }
    const fn = (value, name) => {
        if (value == null) return null;
        if (typeof value !== 'function') throw new TypeError(`renderMarkdown: ${name} must be a function`);
        return value;
    };
    const inlineRules = (options.inlineRules ?? []).map((rule, i) => {
        if (!(rule?.pattern instanceof RegExp) || typeof rule.render !== 'function') {
            throw new TypeError(`renderMarkdown: inlineRules[${i}] needs a RegExp pattern and a render function`);
        }
        // Sticky: the rule matches AT the position being read, never further on.
        const flags = rule.pattern.flags.replace(/[gy]/g, '') + 'y';
        return { pattern: new RegExp(rule.pattern.source, flags), render: rule.render };
    });
    const blockRules = (options.blockRules ?? []).map((rule, i) => {
        if (!(rule?.start instanceof RegExp) || typeof rule.render !== 'function'
            || (rule.end != null && !(rule.end instanceof RegExp))) {
            throw new TypeError(`renderMarkdown: blockRules[${i}] needs a RegExp start, an optional RegExp end and a render function`);
        }
        const plain = (re) => new RegExp(re.source, re.flags.replace(/[gy]/g, ''));
        return { start: plain(rule.start), end: rule.end ? plain(rule.end) : null, render: rule.render };
    });
    return {
        allow,
        highlight: fn(options.highlight, 'highlight'),
        math: options.math === undefined ? katexMath
            : options.math === false || options.math === null ? null
                : fn(options.math, 'math'),
        inlineRules,
        blockRules,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// Inline
// ═══════════════════════════════════════════════════════════════════════════

/** Index of the run of exactly `len` backticks closing a code span, or -1. */
function findBacktickCloser(text, from, len) {
    let i = from;
    while (i < text.length) {
        const j = text.indexOf('`', i);
        if (j === -1) return -1;
        let k = j;
        while (text[k] === '`') k++;
        if (k - j === len) return j;
        i = k;
    }
    return -1;
}

/** Index after the `]` matching the `[` at `open`, or -1. */
function findBracketClose(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (c === '\\') { i++; continue; }
        if (c === '`') {
            let k = i;
            while (text[k] === '`') k++;
            const close = findBacktickCloser(text, k, k - i);
            if (close !== -1) { i = close + (k - i) - 1; continue; }
            i = k - 1;
            continue;
        }
        if (c === '[') depth++;
        else if (c === ']' && --depth === 0) return i;
    }
    return -1;
}

/** `(url "title")` starting at `open`: {url, title, end} or null. */
function parseDestination(text, open) {
    if (text[open] !== '(') return null;
    let i = open + 1;
    while (text[i] === ' ' || text[i] === '\t' || text[i] === '\n') i++;
    let url = '';
    if (text[i] === '<') {
        const close = text.indexOf('>', i);
        if (close === -1 || /[\n<]/.test(text.slice(i + 1, close))) return null;
        url = text.slice(i + 1, close);
        i = close + 1;
    } else {
        let depth = 0;
        const start = i;
        for (; i < text.length; i++) {
            const c = text[i];
            if (c === '\\' && i + 1 < text.length) { i++; continue; }
            if (/\s/.test(c)) break;
            if (c === '(') depth++;
            else if (c === ')') { if (depth === 0) break; depth--; }
        }
        url = text.slice(start, i);
    }
    while (text[i] === ' ' || text[i] === '\t' || text[i] === '\n') i++;
    let title = null;
    const q = text[i];
    if (q === '"' || q === "'" || q === '(') {
        const closeQ = q === '(' ? ')' : q;
        const close = text.indexOf(closeQ, i + 1);
        if (close === -1) return null;
        title = text.slice(i + 1, close);
        i = close + 1;
        while (text[i] === ' ' || text[i] === '\t' || text[i] === '\n') i++;
    }
    if (text[i] !== ')') return null;
    return { url: url.replace(/\\([!-/:-@[-`{-~])/g, '$1'), title, end: i + 1 };
}

const isSpace = (c) => c === undefined || /\s/.test(c);
const isWord = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * The closer of an emphasis run of `len` × `ch` opened at `from`: the index
 * of a run of exactly `len` that is not preceded by whitespace (and, for `_`,
 * not followed by a word character), or -1.
 */
function findEmphasisCloser(text, from, ch, len) {
    let i = from;
    while (i < text.length) {
        const c = text[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '`') {
            let k = i;
            while (text[k] === '`') k++;
            const close = findBacktickCloser(text, k, k - i);
            i = close === -1 ? k : close + (k - i);
            continue;
        }
        if (c !== ch) { i++; continue; }
        let k = i;
        while (text[k] === ch) k++;
        if (k - i === len && i > from && !isSpace(text[i - 1])
            && !(ch === '_' && isWord(text[k]))) return i;
        i = k;
    }
    return -1;
}

/** `$…$` or `$$…$$` at `i`: {tex, display, end} or null. */
function parseInlineMath(text, i) {
    if (text[i + 1] === '$') {
        const close = text.indexOf('$$', i + 2);
        if (close === -1 || close === i + 2) return null;
        return { tex: text.slice(i + 2, close), display: true, end: close + 2 };
    }
    if (isSpace(text[i + 1])) return null;
    for (let j = i + 1; j < text.length; j++) {
        if (text[j] === '\\') { j++; continue; }
        if (text[j] === '\n' && text[j + 1] === '\n') return null;
        if (text[j] === '$' && j > i + 1 && !isSpace(text[j - 1]) && !/\d/.test(text[j + 1] ?? '')) {
            return { tex: text.slice(i + 1, j), display: false, end: j + 1 };
        }
    }
    return null;
}

function renderInline(text, ctx, { inLink = false } = {}) {
    const { opts } = ctx;
    let out = '';
    let plain = '';
    const flush = () => { out += escapeHtml(plain); plain = ''; };
    const emit = (html) => { flush(); out += html; };
    const open = []; // allowed raw-HTML tags open in this span

    let i = 0;
    while (i < text.length) {
        const c = text[i];

        // Backslash: an escaped punctuation character, or a hard break.
        if (c === '\\') {
            const n = text[i + 1];
            if (n === '\n') { emit('<br>\n'); i += 2; continue; }
            if (n !== undefined && ASCII_PUNCT.test(n)) { plain += n; i += 2; continue; }
            plain += c; i++; continue;
        }

        // Code span: wins over everything, including the caller's rules.
        if (c === '`') {
            let k = i;
            while (text[k] === '`') k++;
            const close = findBacktickCloser(text, k, k - i);
            if (close === -1) { plain += text.slice(i, k); i = k; continue; }
            let code = text.slice(k, close).replace(/\n/g, ' ');
            if (code.length > 2 && code[0] === ' ' && code.at(-1) === ' ' && code.trim()) code = code.slice(1, -1);
            emit(`<code>${escapeHtml(code)}</code>`);
            i = close + (k - i);
            continue;
        }

        // The caller's rules.
        let ruled = false;
        for (const rule of opts.inlineRules) {
            rule.pattern.lastIndex = i;
            const m = rule.pattern.exec(text);
            if (!m || !m[0].length) continue;
            const html = rule.render(m, ctx.api);
            if (html == null) continue;
            emit(String(html));
            i += m[0].length;
            ruled = true;
            break;
        }
        if (ruled) continue;

        // Hard break: two or more spaces before a newline.
        if (c === '\n') {
            if (/ {2,}$/.test(plain)) { plain = plain.replace(/ +$/, ''); emit('<br>\n'); }
            else { plain = plain.replace(/ +$/, ''); plain += '\n'; }
            i++;
            continue;
        }

        if (c === '&') {
            const m = ENTITY.exec(text.slice(i, i + 40));
            if (m) { emit(m[0]); i += m[0].length; continue; }
        }

        if (c === '$' && opts.math) {
            const m = parseInlineMath(text, i);
            if (m) {
                const html = opts.math(m.tex, { display: m.display });
                if (html == null) plain += text.slice(i, m.end);
                else emit(String(html));
                i = m.end;
                continue;
            }
        }

        // Images and links.
        if ((c === '!' && text[i + 1] === '[') || (c === '[' && !inLink)) {
            const bracket = c === '!' ? i + 1 : i;
            const close = findBracketClose(text, bracket);
            const dest = close === -1 ? null : parseDestination(text, close + 1);
            if (dest) {
                const label = text.slice(bracket + 1, close);
                const title = dest.title == null ? '' : ` title="${escapeHtml(dest.title)}"`;
                if (c === '!') {
                    if (IMAGE_URL.test(dest.url) && !/[\s\x00-\x1f]/.test(dest.url)) {
                        emit(`<img src="${escapeHtml(dest.url)}" alt="${escapeHtml(label)}"${title}>`);
                    } else {
                        plain += label;
                    }
                } else if (LINK_URL.test(dest.url) && !/[\s\x00-\x1f]/.test(dest.url)) {
                    emit(`<a href="${escapeHtml(dest.url)}"${title} rel="noopener noreferrer">`
                        + `${renderInline(label, ctx, { inLink: true })}</a>`);
                } else {
                    // Inert: the text the reader was shown, and nowhere to go.
                    emit(renderInline(label, ctx, { inLink: true }));
                }
                i = dest.end;
                continue;
            }
        }

        if (c === '<') {
            const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(text.slice(i, i + 2048));
            if (auto && !inLink) {
                emit(`<a href="${escapeHtml(auto[1])}" rel="noopener noreferrer">${escapeHtml(auto[1])}</a>`);
                i += auto[0].length;
                continue;
            }
            const tag = opts.allow.size ? /^<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?\/?>/.exec(text.slice(i, i + 1024)) : null;
            const name = tag?.[2].toLowerCase();
            if (tag && opts.allow.has(name)) {
                if (VOID_TAGS.has(name)) {
                    if (!tag[1]) emit(`<${name}>`);
                    i += tag[0].length;
                    continue;
                }
                if (!tag[1]) {
                    emit(`<${name}>`);
                    open.push(name);
                    i += tag[0].length;
                    continue;
                }
                const at = open.lastIndexOf(name);
                if (at !== -1) {
                    while (open.length > at) emit(`</${open.pop()}>`);
                    i += tag[0].length;
                    continue;
                }
            }
        }

        // Emphasis, strong, strikethrough.
        if (c === '*' || c === '_' || c === '~') {
            let k = i;
            while (text[k] === c) k++;
            const run = k - i;
            const opens = !isSpace(text[k]) && !(c === '_' && isWord(text[i - 1]));
            const len = c === '~' ? (run === 2 ? 2 : 0) : run <= 3 ? run : 0;
            if (opens && len) {
                const close = findEmphasisCloser(text, k, c, len);
                if (close !== -1) {
                    const inner = renderInline(text.slice(k, close), ctx, { inLink });
                    const wrapped = c === '~' ? `<del>${inner}</del>`
                        : len === 1 ? `<em>${inner}</em>`
                            : len === 2 ? `<strong>${inner}</strong>`
                                : `<strong><em>${inner}</em></strong>`;
                    emit(wrapped);
                    i = close + len;
                    continue;
                }
            }
            plain += text.slice(i, k);
            i = k;
            continue;
        }

        plain += c;
        i++;
    }
    flush();
    while (open.length) out += `</${open.pop()}>`;
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Blocks
// ═══════════════════════════════════════════════════════════════════════════

/** A pipe-table row's cells: unescaped `|` splits, outside code spans. */
function splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells = [];
    let cell = '';
    let inCode = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '\\' && s[i + 1] === '|') { cell += '|'; i++; continue; }
        if (c === '`') {
            let k = i;
            while (s[k] === '`') k++;
            const len = k - i;
            if (inCode === len) inCode = 0;
            else if (!inCode && findBacktickCloser(s, k, len) !== -1) inCode = len;
            cell += s.slice(i, k);
            i = k - 1;
            continue;
        }
        if (c === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue; }
        cell += c;
    }
    cells.push(cell.trim());
    return cells;
}

function isTableStart(lines, i) {
    if (!lines[i].includes('|') || i + 1 >= lines.length
        || !lines[i + 1].includes('|') || !RE.tableDelim.test(lines[i + 1])) return false;
    return splitRow(lines[i]).length === splitRow(lines[i + 1]).length;
}

function blockRuleAt(line, ctx) {
    for (const rule of ctx.opts.blockRules) {
        const match = rule.start.exec(line);
        if (match) return { rule, match };
    }
    return null;
}

/**
 * A `$$` line opens a display-math block when the rest of it is empty or the
 * whole formula (`$$x$$`); `$$x$$ and more` is a paragraph with inline math.
 */
function isMathBlockStart(line, ctx) {
    if (!ctx.opts.math || !RE.mathOpen.test(line)) return false;
    const rest = line.replace(RE.mathOpen, '');
    return !rest.includes('$$') || /^[^$]*\$\$[ \t]*$/.test(rest) && !/^[ \t]*\$\$/.test(rest);
}

/** Does `lines[i]` begin a block that interrupts a paragraph? */
function startsBlock(lines, i, ctx) {
    const line = lines[i];
    if (RE.heading.test(line) || RE.hr.test(line) || RE.fence.test(line) || RE.quote.test(line)) return true;
    if (isMathBlockStart(line, ctx)) return true;
    const item = RE.item.exec(line);
    if (item && item[4].trim() && (!/\d/.test(item[2]) || /^1[.)]$/.test(item[2]))) return true;
    if (blockRuleAt(line, ctx)) return true;
    return isTableStart(lines, i);
}

function renderCode(lines, i, ctx) {
    const [, indent, fence, lang] = RE.fence.exec(lines[i]);
    const body = [];
    const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`);
    let j = i + 1;
    for (; j < lines.length; j++) {
        if (close.test(lines[j])) { j++; break; }
        let line = lines[j];
        for (let n = 0; n < indent.length && line[0] === ' '; n++) line = line.slice(1);
        body.push(line);
    }
    const code = body.length ? body.join('\n') + '\n' : '';
    const highlighted = ctx.opts.highlight ? ctx.opts.highlight(code, lang) : null;
    const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    return { html: `<pre><code${cls}>${highlighted == null ? escapeHtml(code) : String(highlighted)}</code></pre>\n`, next: j };
}

function renderMathBlock(lines, i, ctx) {
    const first = lines[i].replace(/^ {0,3}\$\$/, '');
    const body = [];
    let j = i;
    let closed = false;
    if (/\$\$[ \t]*$/.test(first)) {
        body.push(first.replace(/\$\$[ \t]*$/, ''));
        closed = true;
        j = i + 1;
    } else {
        if (first.trim()) body.push(first);
        for (j = i + 1; j < lines.length; j++) {
            if (/\$\$[ \t]*$/.test(lines[j])) {
                const last = lines[j].replace(/\$\$[ \t]*$/, '');
                if (last.trim()) body.push(last);
                closed = true;
                j++;
                break;
            }
            body.push(lines[j]);
        }
    }
    const tex = body.join('\n').trim();
    const html = closed && tex ? ctx.opts.math(tex, { display: true }) : null;
    if (html != null) return { html: `<div class="twm-md-math">${String(html)}</div>\n`, next: j };
    return { html: `<p>${escapeHtml(lines.slice(i, j).join('\n'))}</p>\n`, next: j };
}

function renderTable(lines, i, ctx) {
    const head = splitRow(lines[i]);
    const align = splitRow(lines[i + 1]).map((d) => {
        const l = d.startsWith(':');
        const r = d.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
    });
    const cell = (tag, text, n) => {
        const style = align[n] ? ` style="text-align: ${align[n]}"` : '';
        return `<${tag}${style}>${renderInline(text ?? '', ctx)}</${tag}>`;
    };
    let html = '<table>\n<thead>\n<tr>' + head.map((t, n) => cell('th', t, n)).join('') + '</tr>\n</thead>\n';
    let j = i + 2;
    const rows = [];
    for (; j < lines.length; j++) {
        if (RE.blank.test(lines[j]) || startsBlock(lines, j, ctx)) break;
        const cells = splitRow(lines[j]);
        rows.push('<tr>' + head.map((_, n) => cell('td', cells[n], n)).join('') + '</tr>\n');
    }
    if (rows.length) html += '<tbody>\n' + rows.join('') + '</tbody>\n';
    return { html: html + '</table>\n', next: j };
}

function renderList(lines, i, ctx) {
    const first = RE.item.exec(lines[i]);
    const ordered = /\d/.test(first[2]);
    const delim = ordered ? first[2].at(-1) : first[2];
    const sameList = (m) => m && (ordered ? /\d/.test(m[2]) && m[2].at(-1) === delim : m[2] === delim);
    const items = [];
    let loose = false;
    let j = i;
    while (j < lines.length) {
        const m = RE.item.exec(lines[j]);
        if (!sameList(m) || (items.length && m[1].length >= items.at(-1).indent)) break;
        const gap = m[3].length >= 5 || !m[4] ? 1 : m[3].length;
        const indent = m[1].length + m[2].length + gap;
        const item = { indent, lines: [m[3].length >= 5 ? ' '.repeat(m[3].length - 1) + m[4] : m[4]] };
        items.push(item);
        j++;
        let pendingBlank = 0;
        while (j < lines.length) {
            const line = lines[j];
            if (RE.blank.test(line)) { pendingBlank++; j++; continue; }
            const lead = line.match(/^ */)[0].length;
            if (lead >= indent) {
                for (; pendingBlank; pendingBlank--) item.lines.push('');
                item.lines.push(line.slice(indent));
                j++;
                continue;
            }
            const next = RE.item.exec(line);
            if (pendingBlank === 0 && !next && !startsBlock(lines, j, ctx)
                && !RE.blank.test(item.lines.at(-1) ?? '')) {
                item.lines.push(line.trim()); // lazy paragraph continuation
                j++;
                continue;
            }
            break;
        }
        if (pendingBlank) {
            const next = RE.item.exec(lines[j] ?? '');
            if (j < lines.length && sameList(next) && next[1].length < indent) loose = true;
            else { j -= pendingBlank; break; }
        }
        if (item.lines.slice(0, -1).some((l) => RE.blank.test(l)) && item.lines.length > 1) {
            // A blank line between two of the item's own blocks.
            const inner = item.lines.join('\n');
            if (!/^(`{3,}|~{3,})/m.test(inner)) loose = true;
        }
    }
    const tag = ordered ? 'ol' : 'ul';
    const start = ordered ? parseInt(first[2], 10) : 1;
    let html = start !== 1 ? `<${tag} start="${start}">\n` : `<${tag}>\n`;
    for (const item of items) {
        const body = renderBlocks(item.lines, ctx, { tight: !loose });
        html += `<li>${body.replace(/\n$/, '')}</li>\n`;
    }
    return { html: html + `</${tag}>\n`, next: j };
}

function renderBlocks(lines, ctx, { tight = false } = {}) {
    let out = '';
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (RE.blank.test(line)) { i++; continue; }

        const ruled = blockRuleAt(line, ctx);
        if (ruled) {
            let j = i + 1;
            let closed = true;
            if (ruled.rule.end) {
                closed = false;
                for (; j < lines.length; j++) {
                    if (ruled.rule.end.test(lines[j])) { closed = true; j++; break; }
                }
            }
            const html = ruled.rule.render({ lines: lines.slice(i, j), match: ruled.match, closed }, ctx.api);
            if (html != null) {
                out += String(html) + '\n';
                i = j;
                continue;
            }
        }

        let block = null;
        if (RE.fence.test(line)) block = renderCode(lines, i, ctx);
        else if (isMathBlockStart(line, ctx)) block = renderMathBlock(lines, i, ctx);
        else if (RE.heading.test(line)) {
            const [, hashes, text = ''] = RE.heading.exec(line);
            const n = hashes.length;
            block = { html: `<h${n}>${renderInline(text.trim(), ctx)}</h${n}>\n`, next: i + 1 };
        } else if (RE.hr.test(line)) block = { html: '<hr>\n', next: i + 1 };
        else if (RE.quote.test(line)) {
            const inner = [];
            let j = i;
            for (; j < lines.length && RE.quote.test(lines[j]); j++) inner.push(lines[j].replace(RE.quote, ''));
            block = { html: `<blockquote>\n${renderBlocks(inner, ctx)}</blockquote>\n`, next: j };
        } else if (RE.item.test(line)) block = renderList(lines, i, ctx);
        else if (isTableStart(lines, i)) block = renderTable(lines, i, ctx);

        if (block) {
            out += block.html;
            i = block.next;
            continue;
        }

        const para = [line];
        let j = i + 1;
        for (; j < lines.length && !RE.blank.test(lines[j]) && !startsBlock(lines, j, ctx); j++) para.push(lines[j]);
        const inline = renderInline(para.map((l, n) => (n === 0 ? l.replace(/^[ \t]+/, '') : l.trimStart()))
            .join('\n').replace(/[ \t]+$/, ''), ctx);
        out += tight ? `${inline}\n` : `<p>${inline}</p>\n`;
        i = j;
    }
    return out;
}

/**
 * Render markdown to an HTML string. See the module comment for the subset,
 * the safety rules and the options.
 *
 * @param {string} source
 * @param {Object} [options]
 * @param {boolean} [options.inline=false] - Inline markup only: no blocks, no `<p>`.
 * @param {string[]} [options.allowHtml=[]] - Raw HTML tags that pass through, without attributes.
 * @param {(code: string, lang: string) => (string|null)} [options.highlight] - Fenced code's HTML.
 * @param {false|null|((tex: string, o: {display: boolean}) => (string|null))} [options.math]
 *   Omitted: `window.katex` when present. `false`: `$` is plain text.
 * @param {Array<{pattern: RegExp, render: (match: RegExpExecArray, ctx: Object) => (string|null)}>} [options.inlineRules]
 * @param {Array<{start: RegExp, end?: RegExp, render: (block: {lines: string[], match: RegExpExecArray, closed: boolean}, ctx: Object) => (string|null)}>} [options.blockRules]
 * @returns {string}
 */
export function renderMarkdown(source, options = {}) {
    const ctx = { opts: compileOptions(options ?? {}) };
    ctx.api = Object.freeze({
        escape: escapeHtml,
        inline: (text) => renderInline(String(text ?? ''), ctx),
    });
    const text = String(source ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '�');
    if (options?.inline) return renderInline(text, ctx);
    return renderBlocks(text.split('\n'), ctx);
}
