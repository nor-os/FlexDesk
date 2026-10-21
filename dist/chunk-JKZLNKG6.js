// src/help/help_registry.js
var EMPTY_PROVIDER = Object.freeze({
  getCategories: () => [],
  getTopicsByCategory: () => [],
  loadTopic: async () => null,
  searchTopics: () => []
});
var DEFAULT_COPY = Object.freeze({
  title: "Help",
  welcome: "Select a topic from the sidebar or browse the categories below."
});
var _provider = EMPTY_PROVIDER;
var _categories = Object.freeze({});
var _copy = DEFAULT_COPY;
function setHelpProvider(provider, categories = {}, copy = {}) {
  _provider = provider ?? EMPTY_PROVIDER;
  _categories = Object.freeze({ ...categories });
  _copy = Object.freeze({ ...DEFAULT_COPY, ...copy });
}
function helpProvider() {
  return _provider;
}
function helpCategories() {
  return _categories;
}
function helpCopy() {
  return _copy;
}

// src/ui/utils/markdown.js
var NEVER_ALLOWED = /* @__PURE__ */ new Set([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "template",
  "noscript",
  "textarea",
  "title",
  "xmp",
  "plaintext",
  "noembed",
  "svg",
  "math",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "select",
  "option",
  "video",
  "audio",
  "source",
  "track",
  "img",
  "image",
  "html",
  "head",
  "body",
  "portal",
  "dialog"
]);
var VOID_TAGS = /* @__PURE__ */ new Set(["br", "hr", "wbr"]);
var LINK_URL = /^(?:https?:\/\/|mailto:|#)/i;
var IMAGE_URL = /^(?:https?:\/\/|\/\/|[^:/?#]*(?:[/?#]|$))/i;
var ENTITY = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});/;
var ASCII_PUNCT = /[!-/:-@[-`{-~]/;
var RE = {
  blank: /^[ \t]*$/,
  heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  fence: /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/,
  quote: /^ {0,3}> ?/,
  item: /^( {0,3})([-*+]|\d{1,9}[.)])(?=[ \t]|$)([ \t]*)(.*)$/,
  mathOpen: /^ {0,3}\$\$/,
  tableDelim: /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
};
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function katexMath(tex, { display }) {
  const katex = globalThis.window?.katex ?? globalThis.katex;
  if (typeof katex?.renderToString !== "function") return null;
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false });
  } catch {
    return null;
  }
}
function compileOptions(options) {
  const allow = /* @__PURE__ */ new Set();
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
    if (typeof value !== "function") throw new TypeError(`renderMarkdown: ${name} must be a function`);
    return value;
  };
  const inlineRules = (options.inlineRules ?? []).map((rule, i) => {
    if (!(rule?.pattern instanceof RegExp) || typeof rule.render !== "function") {
      throw new TypeError(`renderMarkdown: inlineRules[${i}] needs a RegExp pattern and a render function`);
    }
    const flags = rule.pattern.flags.replace(/[gy]/g, "") + "y";
    return { pattern: new RegExp(rule.pattern.source, flags), render: rule.render };
  });
  const blockRules = (options.blockRules ?? []).map((rule, i) => {
    if (!(rule?.start instanceof RegExp) || typeof rule.render !== "function" || rule.end != null && !(rule.end instanceof RegExp)) {
      throw new TypeError(`renderMarkdown: blockRules[${i}] needs a RegExp start, an optional RegExp end and a render function`);
    }
    const plain = (re) => new RegExp(re.source, re.flags.replace(/[gy]/g, ""));
    return { start: plain(rule.start), end: rule.end ? plain(rule.end) : null, render: rule.render };
  });
  return {
    allow,
    highlight: fn(options.highlight, "highlight"),
    math: options.math === void 0 ? katexMath : options.math === false || options.math === null ? null : fn(options.math, "math"),
    inlineRules,
    blockRules
  };
}
function findBacktickCloser(text, from, len) {
  let i = from;
  while (i < text.length) {
    const j = text.indexOf("`", i);
    if (j === -1) return -1;
    let k = j;
    while (text[k] === "`") k++;
    if (k - j === len) return j;
    i = k;
  }
  return -1;
}
function findBracketClose(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "`") {
      let k = i;
      while (text[k] === "`") k++;
      const close = findBacktickCloser(text, k, k - i);
      if (close !== -1) {
        i = close + (k - i) - 1;
        continue;
      }
      i = k - 1;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return i;
  }
  return -1;
}
function parseDestination(text, open) {
  if (text[open] !== "(") return null;
  let i = open + 1;
  while (text[i] === " " || text[i] === "	" || text[i] === "\n") i++;
  let url = "";
  if (text[i] === "<") {
    const close = text.indexOf(">", i);
    if (close === -1 || /[\n<]/.test(text.slice(i + 1, close))) return null;
    url = text.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    const start = i;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === "\\" && i + 1 < text.length) {
        i++;
        continue;
      }
      if (/\s/.test(c)) break;
      if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) break;
        depth--;
      }
    }
    url = text.slice(start, i);
  }
  while (text[i] === " " || text[i] === "	" || text[i] === "\n") i++;
  let title = null;
  const q = text[i];
  if (q === '"' || q === "'" || q === "(") {
    const closeQ = q === "(" ? ")" : q;
    const close = text.indexOf(closeQ, i + 1);
    if (close === -1) return null;
    title = text.slice(i + 1, close);
    i = close + 1;
    while (text[i] === " " || text[i] === "	" || text[i] === "\n") i++;
  }
  if (text[i] !== ")") return null;
  return { url: url.replace(/\\([!-/:-@[-`{-~])/g, "$1"), title, end: i + 1 };
}
var isSpace = (c) => c === void 0 || /\s/.test(c);
var isWord = (c) => c !== void 0 && /[\p{L}\p{N}]/u.test(c);
function findEmphasisCloser(text, from, ch, len) {
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      let k2 = i;
      while (text[k2] === "`") k2++;
      const close = findBacktickCloser(text, k2, k2 - i);
      i = close === -1 ? k2 : close + (k2 - i);
      continue;
    }
    if (c !== ch) {
      i++;
      continue;
    }
    let k = i;
    while (text[k] === ch) k++;
    if (k - i === len && i > from && !isSpace(text[i - 1]) && !(ch === "_" && isWord(text[k]))) return i;
    i = k;
  }
  return -1;
}
function parseInlineMath(text, i) {
  if (text[i + 1] === "$") {
    const close = text.indexOf("$$", i + 2);
    if (close === -1 || close === i + 2) return null;
    return { tex: text.slice(i + 2, close), display: true, end: close + 2 };
  }
  if (isSpace(text[i + 1])) return null;
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === "\\") {
      j++;
      continue;
    }
    if (text[j] === "\n" && text[j + 1] === "\n") return null;
    if (text[j] === "$" && j > i + 1 && !isSpace(text[j - 1]) && !/\d/.test(text[j + 1] ?? "")) {
      return { tex: text.slice(i + 1, j), display: false, end: j + 1 };
    }
  }
  return null;
}
function renderInline(text, ctx, { inLink = false } = {}) {
  const { opts } = ctx;
  let out = "";
  let plain = "";
  const flush = () => {
    out += escapeHtml(plain);
    plain = "";
  };
  const emit = (html) => {
    flush();
    out += html;
  };
  const open = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      const n = text[i + 1];
      if (n === "\n") {
        emit("<br>\n");
        i += 2;
        continue;
      }
      if (n !== void 0 && ASCII_PUNCT.test(n)) {
        plain += n;
        i += 2;
        continue;
      }
      plain += c;
      i++;
      continue;
    }
    if (c === "`") {
      let k = i;
      while (text[k] === "`") k++;
      const close = findBacktickCloser(text, k, k - i);
      if (close === -1) {
        plain += text.slice(i, k);
        i = k;
        continue;
      }
      let code = text.slice(k, close).replace(/\n/g, " ");
      if (code.length > 2 && code[0] === " " && code.at(-1) === " " && code.trim()) code = code.slice(1, -1);
      emit(`<code>${escapeHtml(code)}</code>`);
      i = close + (k - i);
      continue;
    }
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
    if (c === "\n") {
      if (/ {2,}$/.test(plain)) {
        plain = plain.replace(/ +$/, "");
        emit("<br>\n");
      } else {
        plain = plain.replace(/ +$/, "");
        plain += "\n";
      }
      i++;
      continue;
    }
    if (c === "&") {
      const m = ENTITY.exec(text.slice(i, i + 40));
      if (m) {
        emit(m[0]);
        i += m[0].length;
        continue;
      }
    }
    if (c === "$" && opts.math) {
      const m = parseInlineMath(text, i);
      if (m) {
        const html = opts.math(m.tex, { display: m.display });
        if (html == null) plain += text.slice(i, m.end);
        else emit(String(html));
        i = m.end;
        continue;
      }
    }
    if (c === "!" && text[i + 1] === "[" || c === "[" && !inLink) {
      const bracket = c === "!" ? i + 1 : i;
      const close = findBracketClose(text, bracket);
      const dest = close === -1 ? null : parseDestination(text, close + 1);
      if (dest) {
        const label = text.slice(bracket + 1, close);
        const title = dest.title == null ? "" : ` title="${escapeHtml(dest.title)}"`;
        if (c === "!") {
          if (IMAGE_URL.test(dest.url) && !/[\s\x00-\x1f]/.test(dest.url)) {
            emit(`<img src="${escapeHtml(dest.url)}" alt="${escapeHtml(label)}"${title}>`);
          } else {
            plain += label;
          }
        } else if (LINK_URL.test(dest.url) && !/[\s\x00-\x1f]/.test(dest.url)) {
          emit(`<a href="${escapeHtml(dest.url)}"${title} rel="noopener noreferrer">${renderInline(label, ctx, { inLink: true })}</a>`);
        } else {
          emit(renderInline(label, ctx, { inLink: true }));
        }
        i = dest.end;
        continue;
      }
    }
    if (c === "<") {
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
    if (c === "*" || c === "_" || c === "~") {
      let k = i;
      while (text[k] === c) k++;
      const run = k - i;
      const opens = !isSpace(text[k]) && !(c === "_" && isWord(text[i - 1]));
      const len = c === "~" ? run === 2 ? 2 : 0 : run <= 3 ? run : 0;
      if (opens && len) {
        const close = findEmphasisCloser(text, k, c, len);
        if (close !== -1) {
          const inner = renderInline(text.slice(k, close), ctx, { inLink });
          const wrapped = c === "~" ? `<del>${inner}</del>` : len === 1 ? `<em>${inner}</em>` : len === 2 ? `<strong>${inner}</strong>` : `<strong><em>${inner}</em></strong>`;
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
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = [];
  let cell = "";
  let inCode = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cell += "|";
      i++;
      continue;
    }
    if (c === "`") {
      let k = i;
      while (s[k] === "`") k++;
      const len = k - i;
      if (inCode === len) inCode = 0;
      else if (!inCode && findBacktickCloser(s, k, len) !== -1) inCode = len;
      cell += s.slice(i, k);
      i = k - 1;
      continue;
    }
    if (c === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += c;
  }
  cells.push(cell.trim());
  return cells;
}
function isTableStart(lines, i) {
  if (!lines[i].includes("|") || i + 1 >= lines.length || !lines[i + 1].includes("|") || !RE.tableDelim.test(lines[i + 1])) return false;
  return splitRow(lines[i]).length === splitRow(lines[i + 1]).length;
}
function blockRuleAt(line, ctx) {
  for (const rule of ctx.opts.blockRules) {
    const match = rule.start.exec(line);
    if (match) return { rule, match };
  }
  return null;
}
function isMathBlockStart(line, ctx) {
  if (!ctx.opts.math || !RE.mathOpen.test(line)) return false;
  const rest = line.replace(RE.mathOpen, "");
  return !rest.includes("$$") || /^[^$]*\$\$[ \t]*$/.test(rest) && !/^[ \t]*\$\$/.test(rest);
}
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
  const close = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
  let j = i + 1;
  for (; j < lines.length; j++) {
    if (close.test(lines[j])) {
      j++;
      break;
    }
    let line = lines[j];
    for (let n = 0; n < indent.length && line[0] === " "; n++) line = line.slice(1);
    body.push(line);
  }
  const code = body.length ? body.join("\n") + "\n" : "";
  const highlighted = ctx.opts.highlight ? ctx.opts.highlight(code, lang) : null;
  const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  return { html: `<pre><code${cls}>${highlighted == null ? escapeHtml(code) : String(highlighted)}</code></pre>
`, next: j };
}
function renderMathBlock(lines, i, ctx) {
  const first = lines[i].replace(/^ {0,3}\$\$/, "");
  const body = [];
  let j = i;
  let closed = false;
  if (/\$\$[ \t]*$/.test(first)) {
    body.push(first.replace(/\$\$[ \t]*$/, ""));
    closed = true;
    j = i + 1;
  } else {
    if (first.trim()) body.push(first);
    for (j = i + 1; j < lines.length; j++) {
      if (/\$\$[ \t]*$/.test(lines[j])) {
        const last = lines[j].replace(/\$\$[ \t]*$/, "");
        if (last.trim()) body.push(last);
        closed = true;
        j++;
        break;
      }
      body.push(lines[j]);
    }
  }
  const tex = body.join("\n").trim();
  const html = closed && tex ? ctx.opts.math(tex, { display: true }) : null;
  if (html != null) return { html: `<div class="twm-md-math">${String(html)}</div>
`, next: j };
  return { html: `<p>${escapeHtml(lines.slice(i, j).join("\n"))}</p>
`, next: j };
}
function renderTable(lines, i, ctx) {
  const head = splitRow(lines[i]);
  const align = splitRow(lines[i + 1]).map((d) => {
    const l = d.startsWith(":");
    const r = d.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : null;
  });
  const cell = (tag, text, n) => {
    const style = align[n] ? ` style="text-align: ${align[n]}"` : "";
    return `<${tag}${style}>${renderInline(text ?? "", ctx)}</${tag}>`;
  };
  let html = "<table>\n<thead>\n<tr>" + head.map((t, n) => cell("th", t, n)).join("") + "</tr>\n</thead>\n";
  let j = i + 2;
  const rows = [];
  for (; j < lines.length; j++) {
    if (RE.blank.test(lines[j]) || startsBlock(lines, j, ctx)) break;
    const cells = splitRow(lines[j]);
    rows.push("<tr>" + head.map((_, n) => cell("td", cells[n], n)).join("") + "</tr>\n");
  }
  if (rows.length) html += "<tbody>\n" + rows.join("") + "</tbody>\n";
  return { html: html + "</table>\n", next: j };
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
    if (!sameList(m) || items.length && m[1].length >= items.at(-1).indent) break;
    const gap = m[3].length >= 5 || !m[4] ? 1 : m[3].length;
    const indent = m[1].length + m[2].length + gap;
    const item = { indent, lines: [m[3].length >= 5 ? " ".repeat(m[3].length - 1) + m[4] : m[4]] };
    items.push(item);
    j++;
    let pendingBlank = 0;
    while (j < lines.length) {
      const line = lines[j];
      if (RE.blank.test(line)) {
        pendingBlank++;
        j++;
        continue;
      }
      const lead = line.match(/^ */)[0].length;
      if (lead >= indent) {
        for (; pendingBlank; pendingBlank--) item.lines.push("");
        item.lines.push(line.slice(indent));
        j++;
        continue;
      }
      const next = RE.item.exec(line);
      if (pendingBlank === 0 && !next && !startsBlock(lines, j, ctx) && !RE.blank.test(item.lines.at(-1) ?? "")) {
        item.lines.push(line.trim());
        j++;
        continue;
      }
      break;
    }
    if (pendingBlank) {
      const next = RE.item.exec(lines[j] ?? "");
      if (j < lines.length && sameList(next) && next[1].length < indent) loose = true;
      else {
        j -= pendingBlank;
        break;
      }
    }
    if (item.lines.slice(0, -1).some((l) => RE.blank.test(l)) && item.lines.length > 1) {
      const inner = item.lines.join("\n");
      if (!/^(`{3,}|~{3,})/m.test(inner)) loose = true;
    }
  }
  const tag = ordered ? "ol" : "ul";
  const start = ordered ? parseInt(first[2], 10) : 1;
  let html = start !== 1 ? `<${tag} start="${start}">
` : `<${tag}>
`;
  for (const item of items) {
    const body = renderBlocks(item.lines, ctx, { tight: !loose });
    html += `<li>${body.replace(/\n$/, "")}</li>
`;
  }
  return { html: html + `</${tag}>
`, next: j };
}
function renderBlocks(lines, ctx, { tight = false } = {}) {
  let out = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (RE.blank.test(line)) {
      i++;
      continue;
    }
    const ruled = blockRuleAt(line, ctx);
    if (ruled) {
      let j2 = i + 1;
      let closed = true;
      if (ruled.rule.end) {
        closed = false;
        for (; j2 < lines.length; j2++) {
          if (ruled.rule.end.test(lines[j2])) {
            closed = true;
            j2++;
            break;
          }
        }
      }
      const html = ruled.rule.render({ lines: lines.slice(i, j2), match: ruled.match, closed }, ctx.api);
      if (html != null) {
        out += String(html) + "\n";
        i = j2;
        continue;
      }
    }
    let block = null;
    if (RE.fence.test(line)) block = renderCode(lines, i, ctx);
    else if (isMathBlockStart(line, ctx)) block = renderMathBlock(lines, i, ctx);
    else if (RE.heading.test(line)) {
      const [, hashes, text = ""] = RE.heading.exec(line);
      const n = hashes.length;
      block = { html: `<h${n}>${renderInline(text.trim(), ctx)}</h${n}>
`, next: i + 1 };
    } else if (RE.hr.test(line)) block = { html: "<hr>\n", next: i + 1 };
    else if (RE.quote.test(line)) {
      const inner = [];
      let j2 = i;
      for (; j2 < lines.length && RE.quote.test(lines[j2]); j2++) inner.push(lines[j2].replace(RE.quote, ""));
      block = { html: `<blockquote>
${renderBlocks(inner, ctx)}</blockquote>
`, next: j2 };
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
    const inline = renderInline(para.map((l, n) => n === 0 ? l.replace(/^[ \t]+/, "") : l.trimStart()).join("\n").replace(/[ \t]+$/, ""), ctx);
    out += tight ? `${inline}
` : `<p>${inline}</p>
`;
    i = j;
  }
  return out;
}
function renderMarkdown(source, options = {}) {
  const ctx = { opts: compileOptions(options ?? {}) };
  ctx.api = Object.freeze({
    escape: escapeHtml,
    inline: (text2) => renderInline(String(text2 ?? ""), ctx)
  });
  const text = String(source ?? "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "\uFFFD");
  if (options?.inline) return renderInline(text, ctx);
  return renderBlocks(text.split("\n"), ctx);
}

// src/ui/components/document_outline.js
var DocumentOutline = class {
  /**
   * @param {HTMLElement|null} host  appended to, if given
   * @param {DocumentOutlineConfig} [config]
   */
  constructor(host, config = {}) {
    this.config = {
      entries: [],
      numbering: false,
      maxDepth: 3,
      onSelect: null,
      scrollOnSelect: true,
      scrollBehavior: "smooth",
      scrollContainer: null,
      resolveTarget: null,
      rootMargin: "0px 0px -70% 0px",
      scrollEndTimeout: 1e3,
      emptyState: "No headings",
      label: "Outline",
      className: null,
      IntersectionObserver: null,
      ...config
    };
    this._entries = [];
    this._rows = [];
    this._byId = /* @__PURE__ */ new Map();
    this._byTarget = /* @__PURE__ */ new Map();
    this._inView = /* @__PURE__ */ new Set();
    this._activeId = null;
    this._listeners = /* @__PURE__ */ new Set();
    this._observer = null;
    this._suppressed = false;
    this._timer = null;
    this._disposed = false;
    const root = document.createElement("nav");
    root.className = "twm-doc-outline" + (this.config.className ? ` ${this.config.className}` : "");
    if (this.config.label) root.setAttribute("aria-label", this.config.label);
    const list = document.createElement("ol");
    list.className = "twm-doc-outline__items";
    root.appendChild(list);
    this.element = root;
    this.listElement = list;
    this._onClick = (ev) => this._click(ev);
    this._onScrollEnd = () => this._resume();
    list.addEventListener("click", this._onClick);
    this.config.scrollContainer?.addEventListener?.("scrollend", this._onScrollEnd);
    this._setEntries(this.config.entries);
    if (host) host.appendChild(root);
  }
  // ── public ───────────────────────────────────────────────────────────
  /** Replace the entries. The active entry stays active if it is still
   *  listed and resolved; otherwise there is none. */
  setEntries(entries) {
    if (this._disposed) return;
    this._setEntries(entries);
  }
  /** The entries, as last given. */
  getEntries() {
    return this._entries.slice();
  }
  /** Resolve every target again and watch the new ones: the document under
   *  the outline was re-rendered. */
  refresh() {
    if (this._disposed) return;
    this._observe();
    this._keepActive();
  }
  /** Mark an entry active (`null` for none). An id that is not listed, or
   *  whose target is not resolved, is refused: returns false. */
  setActive(id) {
    if (this._disposed) return false;
    if (id == null) {
      this._activate(null);
      return true;
    }
    const row = this._byId.get(String(id));
    if (!row?.target) return false;
    this._activate(row.id);
    return true;
  }
  /** The active entry's id, or null. */
  getActive() {
    return this._activeId;
  }
  /** `fn(id, entry)` on every change of the active entry (`(null, null)` when
   *  none). Returns the function that unsubscribes. */
  onActiveChange(fn) {
    if (typeof fn !== "function" || this._disposed) return () => {
    };
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  /** The `<li>` drawn for an id, or null. */
  getItem(id) {
    return this._byId.get(String(id))?.li || null;
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._observer?.disconnect();
    this._observer = null;
    this._clearTimer();
    this._suppressed = false;
    this.config.scrollContainer?.removeEventListener?.("scrollend", this._onScrollEnd);
    this.listElement.removeEventListener("click", this._onClick);
    this._listeners.clear();
    this._byId.clear();
    this._byTarget.clear();
    this._inView.clear();
    this._rows = [];
    this.element.remove();
  }
  // ── drawing ──────────────────────────────────────────────────────────
  _setEntries(entries) {
    this._entries = Array.isArray(entries) ? entries.slice() : [];
    this._rows = numberEntries(this._entries, this.config.maxDepth);
    this._byId = new Map(this._rows.map((row) => [row.id, row]));
    this._draw();
    this._observe();
    this._keepActive();
  }
  /** The active entry survives a redraw only while it is listed and resolved. */
  _keepActive() {
    if (this._activeId !== null && !this._byId.get(this._activeId)?.target) this._activate(null);
    else this._paint();
  }
  _draw() {
    const list = this.listElement;
    list.replaceChildren();
    this.element.querySelector(":scope > .twm-doc-outline__empty")?.remove();
    this.element.classList.toggle("twm-doc-outline--empty", this._rows.length === 0);
    this.element.classList.toggle("twm-doc-outline--numbered", !!this.config.numbering);
    if (!this._rows.length) {
      this._drawEmpty();
      return;
    }
    for (const row of this._rows) {
      const li = document.createElement("li");
      li.className = `twm-doc-outline__item twm-doc-outline__item--level-${row.depth}`;
      li.style.setProperty("--twm-doc-outline-depth", String(row.depth - 1));
      const button = document.createElement("button");
      button.type = "button";
      button.className = "twm-doc-outline__link";
      if (this.config.numbering) {
        const num = document.createElement("span");
        num.className = "twm-doc-outline__number";
        num.textContent = row.number;
        button.appendChild(num);
      }
      const label = document.createElement("span");
      label.className = "twm-doc-outline__label";
      label.textContent = String(row.entry.label ?? "");
      button.appendChild(label);
      button.title = (this.config.numbering ? `${row.number} ` : "") + label.textContent;
      li.appendChild(button);
      row.li = li;
      list.appendChild(li);
    }
  }
  _drawEmpty() {
    let content = this.config.emptyState;
    if (typeof content === "function") content = content();
    if (content == null || content === false || content === "") return;
    const p = document.createElement("p");
    p.className = "twm-doc-outline__empty";
    if (typeof Node !== "undefined" && content instanceof Node) p.appendChild(content);
    else p.textContent = String(content);
    this.element.appendChild(p);
  }
  _paint() {
    for (const row of this._rows) {
      if (!row.li) continue;
      const active = row.id === this._activeId;
      row.li.classList.toggle("twm-doc-outline__item--active", active);
      row.li.classList.toggle("twm-doc-outline__item--unresolved", !row.target);
      const button = row.li.firstChild;
      if (active) button.setAttribute("aria-current", "location");
      else button.removeAttribute("aria-current");
    }
  }
  _activate(id) {
    const next = id ?? null;
    if (next === this._activeId) {
      this._paint();
      return;
    }
    this._activeId = next;
    this._paint();
    const entry = next === null ? null : this._byId.get(next)?.entry ?? null;
    for (const fn of [...this._listeners]) fn(next, entry);
  }
  // ── the scroll-spy ───────────────────────────────────────────────────
  _resolve(entry) {
    const container = this.config.scrollContainer;
    if (typeof this.config.resolveTarget === "function") {
      return this.config.resolveTarget(entry, container) || null;
    }
    if (!container) return null;
    const id = String(entry.id);
    for (const el of container.querySelectorAll("[id]")) if (el.id === id) return el;
    return null;
  }
  _observe() {
    this._observer?.disconnect();
    this._byTarget.clear();
    this._inView.clear();
    for (const row of this._rows) row.target = this._resolve(row.entry);
    for (const row of this._rows) {
      if (row.target && !this._byTarget.has(row.target)) this._byTarget.set(row.target, row);
    }
    const container = this.config.scrollContainer;
    const IO = this.config.IntersectionObserver || globalThis.IntersectionObserver;
    if (!container || typeof IO !== "function") return;
    if (!this._observer) {
      this._observer = new IO((records) => this._intersect(records), {
        root: container,
        rootMargin: this.config.rootMargin,
        threshold: 0
      });
    }
    for (const target of this._byTarget.keys()) this._observer.observe(target);
  }
  _intersect(records) {
    if (this._disposed) return;
    for (const rec of records) {
      const row = this._byTarget.get(rec.target);
      if (!row) continue;
      if (rec.isIntersecting) this._inView.add(row);
      else this._inView.delete(row);
    }
    if (this._suppressed) return;
    const top = this._rows.find((row) => this._inView.has(row));
    if (top) this._activate(top.id);
  }
  _click(ev) {
    const li = ev.target?.closest?.(".twm-doc-outline__item");
    if (!li || !this.listElement.contains(li)) return;
    const row = this._rows.find((r) => r.li === li);
    if (!row) return;
    if (row.target) {
      this._activate(row.id);
      this._suppress();
      if (this.config.scrollOnSelect && typeof row.target.scrollIntoView === "function") {
        row.target.scrollIntoView({ block: "start", behavior: this.config.scrollBehavior });
      }
    }
    this.config.onSelect?.(row.id, row.entry);
  }
  _suppress() {
    this._suppressed = true;
    this._clearTimer();
    this._timer = setTimeout(() => this._resume(), this.config.scrollEndTimeout);
  }
  _resume() {
    this._clearTimer();
    this._suppressed = false;
  }
  _clearTimer() {
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
  }
};
function createDocumentOutline(host, config = {}) {
  return new DocumentOutline(host, config);
}
function numberEntries(entries, maxDepth) {
  const cap = Math.max(1, Math.floor(Number(maxDepth) || 3));
  const open = [];
  const counters = [];
  return entries.map((entry) => {
    const level = Math.max(1, Math.floor(Number(entry?.level) || 1));
    while (open.length && open[open.length - 1] >= level) open.pop();
    const depth = Math.min(cap, open.length + 1);
    open.push(level);
    counters.length = depth;
    counters[depth - 1] = (counters[depth - 1] || 0) + 1;
    return { id: String(entry?.id), entry, depth, number: counters.join("."), li: null, target: null };
  });
}

// src/help/help_modal.js
var TOC_HEADINGS = "h1, h2, h3, h4, h5, h6";
var TOC_MIN_HEADINGS = 2;
var _activeModal = null;
var HelpModal = class _HelpModal {
  /** The application's help, resolved at use time. */
  get _service() {
    return helpProvider();
  }
  get _categories() {
    return helpCategories();
  }
  get _copy() {
    return helpCopy();
  }
  constructor() {
    this._overlay = null;
    this._modal = null;
    this._currentTopic = null;
    this._searchQuery = "";
    this._fallback = null;
    this._toc = null;
    this._boundKeyHandler = this._handleKeyDown.bind(this);
  }
  /**
   * Open the help modal.
   * @param {string} [topicId] - Initial topic to display
   * @param {Object} [options]
   * @param {{title: string, html: string}} [options.fallback] - Shown for
   *   `topicId` when the provider has no such topic (its `loadTopic` answers
   *   null). A library-owned topic, such as the palette's keyboard shortcuts,
   *   uses it so that an application's own topic of that id still wins.
   */
  async open(topicId = null, { fallback = null } = {}) {
    this._fallback = topicId && fallback ? { id: topicId, topic: fallback } : null;
    if (_activeModal && _activeModal !== this) {
      _activeModal.close();
    }
    _activeModal = this;
    this._createModal();
    document.body.appendChild(this._overlay);
    document.addEventListener("keydown", this._boundKeyHandler);
    const searchInput = this._modal.querySelector(".help-search-input");
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }
    if (topicId) {
      await this._loadTopic(topicId);
    } else {
      this._showIndex();
    }
  }
  /**
   * Close the help modal.
   */
  close() {
    this._disposeToc();
    if (this._overlay) {
      document.removeEventListener("keydown", this._boundKeyHandler);
      this._overlay.remove();
      this._overlay = null;
      this._modal = null;
    }
    if (_activeModal === this) {
      _activeModal = null;
    }
  }
  /**
   * Create the modal DOM structure.
   * @private
   */
  _createModal() {
    this._overlay = document.createElement("div");
    this._overlay.className = "help-modal-overlay";
    this._overlay.addEventListener("click", (e) => {
      if (e.target === this._overlay) this.close();
    });
    this._modal = document.createElement("div");
    this._modal.className = "help-modal";
    this._modal.innerHTML = `
            <div class="help-modal__header">
                <div class="help-modal__title">
                    <span class="material-symbols-outlined">help</span>
                    <span>Help</span>
                </div>
                <button class="help-modal__close" title="Close (Esc)">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="help-modal__search">
                <span class="material-symbols-outlined">search</span>
                <input type="text" class="help-search-input" placeholder="Search help topics..." autocomplete="off">
            </div>
            <div class="help-modal__body">
                <nav class="help-modal__sidebar">
                    <div class="help-sidebar__categories"></div>
                </nav>
                <main class="help-modal__content">
                    <div class="help-content__loading">Loading...</div>
                </main>
            </div>
        `;
    const closeBtn = this._modal.querySelector(".help-modal__close");
    closeBtn.addEventListener("click", () => this.close());
    const searchInput = this._modal.querySelector(".help-search-input");
    searchInput.addEventListener("input", (e) => this._handleSearch(e.target.value));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (e.target.value) {
          e.target.value = "";
          this._handleSearch("");
          e.stopPropagation();
        }
      }
    });
    this._buildSidebar();
    this._overlay.appendChild(this._modal);
  }
  /**
   * Build the sidebar navigation.
   * @private
   */
  _buildSidebar() {
    const container = this._modal.querySelector(".help-sidebar__categories");
    const categories = this._service.getCategories();
    const categoryOrder = Object.keys(this._categories);
    categories.sort((a, b) => {
      const orderA = categoryOrder.indexOf(a);
      const orderB = categoryOrder.indexOf(b);
      return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
    });
    container.innerHTML = categories.map((category) => {
      const topics = this._service.getTopicsByCategory(category);
      const label = this._categories[category]?.label || category;
      const icon = this._categories[category]?.icon || "folder";
      return `
                <div class="help-category" data-category="${escapeHtml2(category)}">
                    <div class="help-category__header">
                        <span class="material-symbols-outlined">${escapeHtml2(icon)}</span>
                        <span>${escapeHtml2(label)}</span>
                    </div>
                    <ul class="help-category__topics">
                        ${topics.map((topic) => `
                            <li class="help-topic-item" data-topic="${escapeHtml2(topic.id)}">
                                ${escapeHtml2(topic.title)}
                            </li>
                        `).join("")}
                    </ul>
                </div>
            `;
    }).join("");
    container.querySelectorAll(".help-topic-item").forEach((item) => {
      item.addEventListener("click", () => {
        this._loadTopic(item.dataset.topic);
      });
    });
    container.querySelectorAll(".help-category__header").forEach((header) => {
      header.addEventListener("click", () => {
        header.parentElement.classList.toggle("collapsed");
      });
    });
  }
  /**
   * Show the help index page.
   * @private
   */
  _showIndex() {
    this._disposeToc();
    const content = this._modal.querySelector(".help-modal__content");
    const categories = this._service.getCategories();
    const categoryOrder = Object.keys(this._categories);
    categories.sort((a, b) => {
      const orderA = categoryOrder.indexOf(a);
      const orderB = categoryOrder.indexOf(b);
      return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
    });
    content.innerHTML = `
            <div class="help-index">
                <h1>${this._copy.title}</h1>
                <p>${this._copy.welcome}</p>

                <div class="help-index__grid">
                    ${categories.map((category) => {
      const topics = this._service.getTopicsByCategory(category);
      const label = this._categories[category]?.label || category;
      const icon = this._categories[category]?.icon || "folder";
      return `
                            <div class="help-index__category" data-category="${escapeHtml2(category)}">
                                <div class="help-index__category-header">
                                    <span class="material-symbols-outlined">${escapeHtml2(icon)}</span>
                                    <span>${escapeHtml2(label)}</span>
                                </div>
                                <ul class="help-index__topics">
                                    ${topics.slice(0, 3).map((topic) => `
                                        <li class="help-index__topic" data-topic="${escapeHtml2(topic.id)}">
                                            ${escapeHtml2(topic.title)}
                                        </li>
                                    `).join("")}
                                    ${topics.length > 3 ? `<li class="help-index__more">+${topics.length - 3} more</li>` : ""}
                                </ul>
                            </div>
                        `;
    }).join("")}
                </div>
            </div>
        `;
    content.querySelectorAll(".help-index__topic").forEach((item) => {
      item.addEventListener("click", () => {
        this._loadTopic(item.dataset.topic);
      });
    });
  }
  /**
   * Load and display a topic.
   * @param {string} topicId - Topic ID
   * @private
   */
  async _loadTopic(topicId) {
    this._disposeToc();
    const content = this._modal.querySelector(".help-modal__content");
    content.innerHTML = '<div class="help-content__loading">Loading...</div>';
    this._modal.querySelectorAll(".help-topic-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.topic === topicId);
    });
    try {
      const topic = await this._service.loadTopic(topicId) ?? (this._fallback?.id === topicId ? this._fallback.topic : null);
      if (!this._modal?.contains(content)) return;
      this._currentTopic = topicId;
      if (!topic) {
        content.innerHTML = `
                    <div class="help-content__error help-content__error--not-found">
                        <span class="material-symbols-outlined">search_off</span>
                        <p>Help topic not found.</p>
                    </div>
                `;
        return;
      }
      content.innerHTML = `
                <div class="help-content__article">
                    <div class="help-content__breadcrumb">
                        <a href="#" class="help-breadcrumb__home" title="Help Index">
                            <span class="material-symbols-outlined">home</span>
                        </a>
                        <span class="help-breadcrumb__separator">/</span>
                        <span class="help-breadcrumb__title">${escapeHtml2(topic.title)}</span>
                    </div>
                    <div class="help-content__toc" hidden></div>
                    <article class="help-article">
                        ${this._articleHtml(topic)}
                    </article>
                </div>
            `;
      content.querySelector(".help-breadcrumb__home").addEventListener("click", (e) => {
        e.preventDefault();
        this._showIndex();
      });
      this._buildToc(content);
    } catch (error) {
      content.innerHTML = `
                <div class="help-content__error">
                    <span class="material-symbols-outlined">error</span>
                    <p>Failed to load help topic.</p>
                </div>
            `;
    }
  }
  /**
   * The article body: a markdown topic rendered safe, else the provider's
   * own HTML, which is trusted by contract.
   * @private
   */
  _articleHtml(topic) {
    if (typeof topic.markdown === "string") {
      return renderMarkdown(topic.markdown, this._service.markdownOptions ?? {});
    }
    return topic.html ?? "";
  }
  /**
   * The topic's table of contents: one entry per heading in the article, in
   * document order, its level the heading's. Built only when the article
   * has `TOC_MIN_HEADINGS` or more; the outline resolves each entry to its
   * heading ELEMENT, so the provider's markup needs no ids and the modal
   * adds none.
   * @param {HTMLElement} content - The scrolling content pane.
   * @private
   */
  _buildToc(content) {
    this._disposeToc();
    const host = content.querySelector(".help-content__toc");
    const headings = [...content.querySelectorAll(`.help-article :is(${TOC_HEADINGS})`)];
    if (!host || headings.length < TOC_MIN_HEADINGS) return;
    const byId = new Map(headings.map((heading, index) => [`heading-${index}`, heading]));
    const entries = [...byId].map(([id, heading]) => ({
      id,
      level: Number(heading.tagName.slice(1)),
      label: heading.textContent.trim()
    }));
    host.hidden = false;
    this._toc = createDocumentOutline(host, {
      entries,
      numbering: true,
      scrollContainer: content,
      resolveTarget: (entry) => byId.get(entry.id) ?? null,
      label: "Contents"
    });
  }
  /** @private */
  _disposeToc() {
    this._toc?.dispose();
    this._toc = null;
  }
  /**
   * Handle search input.
   * @param {string} query - Search query
   * @private
   */
  _handleSearch(query) {
    this._searchQuery = query;
    const content = this._modal.querySelector(".help-modal__content");
    if (!query.trim()) {
      this._showIndex();
      return;
    }
    this._disposeToc();
    const results = this._service.searchTopics(query);
    if (results.length === 0) {
      content.innerHTML = `
                <div class="help-search-results">
                    <h2>Search Results</h2>
                    <p class="help-search-empty">No results found for "${escapeHtml2(query)}"</p>
                </div>
            `;
      return;
    }
    content.innerHTML = `
            <div class="help-search-results">
                <h2>Search Results</h2>
                <p class="help-search-count">${results.length} result${results.length !== 1 ? "s" : ""} for "${escapeHtml2(query)}"</p>
                <ul class="help-search-list">
                    ${results.map((topic) => `
                        <li class="help-search-item" data-topic="${escapeHtml2(topic.id)}">
                            <span class="help-search-item__title">${escapeHtml2(topic.title)}</span>
                            <span class="help-search-item__category">${escapeHtml2(this._categories[topic.category]?.label || topic.category)}</span>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
    content.querySelectorAll(".help-search-item").forEach((item) => {
      item.addEventListener("click", () => {
        this._loadTopic(item.dataset.topic);
      });
    });
  }
  /**
   * Handle keyboard events.
   * @param {KeyboardEvent} event
   * @private
   */
  _handleKeyDown(event) {
    if (event.key === "Escape") {
      this.close();
    }
  }
  /**
   * Static method to open help modal.
   * @param {string} [topicId] - Initial topic
   * @param {Object} [options] - As for the instance `open`.
   * @returns {HelpModal}
   */
  static open(topicId = null, options = {}) {
    const modal = new _HelpModal();
    modal.open(topicId, options);
    return modal;
  }
  /**
   * Close the open help modal, or open the index when none is open — what
   * the `?` shortcut does.
   * @returns {HelpModal|null} the modal opened, or null when one was closed
   */
  static toggle() {
    if (_activeModal) {
      _activeModal.close();
      return null;
    }
    return _HelpModal.open();
  }
  /**
   * Get the currently active modal.
   * @returns {HelpModal|null}
   */
  static getActive() {
    return _activeModal;
  }
};
function escapeHtml2(value) {
  if (value === null || value === void 0) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function installHelpShortcut({ target = document } = {}) {
  const onKeyDown = (event) => {
    if (event.defaultPrevented || event.key !== "?") return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    HelpModal.toggle();
  };
  target.addEventListener("keydown", onKeyDown);
  return () => target.removeEventListener("keydown", onKeyDown);
}

// src/ui/components/menu_bar.js
var SEL_TITLE = ".twm-menubar__title";
var SEL_ITEM = ".twm-menubar__item";
var SEL_MENU = ".twm-menubar__menu";
function createMenuBar(el, opts) {
  return new MenuBar(el, opts);
}
var MenuBar = class {
  /**
   * @param {Element} el                the element that becomes the bar
   * @param {object}  opts
   * @param {Array}   opts.menus        `[{ id, label, items }]`
   * @param {Function} [opts.onAction]  `(id, { item, checked }) => void`
   * @param {string}  [opts.label]      the bar's accessible name ('Menu')
   * @param {string}  [opts.emptyLabel] the disabled row an empty submenu shows ('Empty')
   */
  constructor(el, { menus, onAction = null, label = "Menu", emptyLabel = "Empty" } = {}) {
    if (!el || typeof el.appendChild !== "function") {
      throw new TypeError("createMenuBar: `el` must be an element");
    }
    _validateMenus(menus);
    this.el = el;
    this.menus = menus;
    this._onAction = typeof onAction === "function" ? onAction : null;
    this._emptyLabel = emptyLabel;
    this._doc = el.ownerDocument;
    this._disabled = /* @__PURE__ */ new Map();
    this._checked = /* @__PURE__ */ new Map();
    this._radio = /* @__PURE__ */ new Map();
    this._models = /* @__PURE__ */ new WeakMap();
    this._stack = [];
    this._openIdx = -1;
    this._active = false;
    this._returnTo = null;
    this._altArmed = false;
    el.innerHTML = "";
    el.classList.add("twm-menubar");
    el.setAttribute("role", "menubar");
    el.setAttribute("aria-label", label);
    this._titles = menus.map((m, i) => {
      const entry = this._doc.createElement("div");
      entry.className = "twm-menubar__entry";
      entry.setAttribute("role", "none");
      const btn = this._doc.createElement("button");
      btn.type = "button";
      btn.className = "twm-menubar__title";
      btn.setAttribute("role", "menuitem");
      btn.setAttribute("aria-haspopup", "menu");
      btn.setAttribute("aria-expanded", "false");
      btn.tabIndex = i === 0 ? 0 : -1;
      btn.textContent = m.label;
      entry.appendChild(btn);
      el.appendChild(entry);
      return btn;
    });
    this._h = {
      mousedown: (e) => this._onMouseDown(e),
      click: (e) => this._onClick(e),
      mouseover: (e) => this._onMouseOver(e),
      keydown: (e) => this._onKey(e),
      keyup: (e) => {
        if (e.key === " " && this.el.contains(e.target)) e.preventDefault();
      },
      focusin: (e) => this._onFocusIn(e),
      focusout: (e) => this._onFocusOut(e),
      docKeydown: (e) => this._onDocKeyDown(e),
      docKeyup: (e) => this._onDocKeyUp(e),
      docMousedown: (e) => this._onDocMouseDown(e),
      // Alt+Tab, Alt+F4, Alt+Space: the second key goes to the OS, so no
      // keydown reaches the page to disarm Alt. The window losing focus
      // does, or the Alt keyup on return would take focus to the bar.
      winBlur: () => {
        this._altArmed = false;
      }
    };
    for (const k of ["mousedown", "click", "mouseover", "keydown", "keyup", "focusin", "focusout"]) {
      el.addEventListener(k, this._h[k]);
    }
    this._doc.addEventListener("keydown", this._h.docKeydown, true);
    this._doc.addEventListener("keyup", this._h.docKeyup, true);
    this._doc.addEventListener("mousedown", this._h.docMousedown, true);
    this._doc.defaultView?.addEventListener("blur", this._h.winBlur);
  }
  // ── public ────────────────────────────────────────────────────────
  /** Whether a menu is open. */
  isOpen() {
    return this._openIdx >= 0;
  }
  /** Open the menu with this id (focus on its title, or on its first item). */
  open(menuId, { focusItem = false } = {}) {
    const i = this.menus.findIndex((m) => m.id === menuId);
    if (i < 0) return;
    this._enter();
    this._open(i, focusItem ? "first" : null);
  }
  /** Close every open menu. Focus stays in the bar if it was there. */
  close() {
    this._closeAll();
  }
  /** Focus the bar's first title, as Alt or F10 does. */
  focus() {
    this._enter();
    this._focusTitle(0);
  }
  isEnabled(id) {
    const item = this._findModel(id);
    return item ? !this._isDisabled(item) : !this._disabled.get(id);
  }
  isChecked(id) {
    const item = this._findModel(id);
    return item ? this._isChecked(item) : !!this._checked.get(id);
  }
  /** Enable or disable every item with this id; an open menu is patched in place. */
  setEnabled(id, enabled) {
    this._disabled.set(id, !enabled);
    this._patch(id);
  }
  /** Check or uncheck every item with this id; checking a radio item
   *  unchecks the rest of its group. An open menu is patched in place. */
  setChecked(id, checked) {
    this._check(this._findModel(id), id, checked);
  }
  /**
   * The model as command-palette rows: one per enabled leaf item, labelled
   * as in the menu, with its `shortcut`, and its menu path as `context`
   * ('File › Open recent'). A function submenu is called now, so the rows
   * are as current as the menu would be. `action` runs the item exactly as
   * a click would, including flipping a check or radio item.
   */
  commands() {
    const rows = [];
    const walk = (items, path) => {
      for (const it of _resolve(items)) {
        if (!it || it.separator || this._isDisabled(it)) continue;
        if (it.submenu != null) {
          walk(it.submenu, [...path, it.label]);
          continue;
        }
        rows.push({
          id: `menubar:${it.id}`,
          label: it.label,
          ...it.shortcut ? { shortcut: it.shortcut } : {},
          context: path.join(" \u203A "),
          verb: "run",
          action: () => this._fire(it)
        });
      }
    };
    for (const m of this.menus) walk(m.items, [m.label]);
    return rows;
  }
  dispose() {
    this._closeAll();
    for (const k of ["mousedown", "click", "mouseover", "keydown", "keyup", "focusin", "focusout"]) {
      this.el.removeEventListener(k, this._h[k]);
    }
    this._doc.removeEventListener("keydown", this._h.docKeydown, true);
    this._doc.removeEventListener("keyup", this._h.docKeyup, true);
    this._doc.removeEventListener("mousedown", this._h.docMousedown, true);
    this._doc.defaultView?.removeEventListener("blur", this._h.winBlur);
    this.el.innerHTML = "";
    this.el.classList.remove("twm-menubar");
    this.el.removeAttribute("role");
    this.el.removeAttribute("aria-label");
  }
  // ── state ─────────────────────────────────────────────────────────
  _isDisabled(item) {
    return this._disabled.has(item.id) ? this._disabled.get(item.id) : !!item.disabled;
  }
  _isChecked(item) {
    if (item.radio != null && this._radio.has(item.radio)) return this._radio.get(item.radio) === item.id;
    return this._checked.has(item.id) ? this._checked.get(item.id) : !!item.checked;
  }
  /** Record a check. `item` is the model item when the bar knows it (a
   *  radio item then records its group's selection); `id` alone is kept as
   *  an override for an item the model does not hold yet. */
  _check(item, id, checked) {
    if (item?.radio != null) {
      const group = item.radio;
      if (checked) this._radio.set(group, id);
      else if (this._isChecked(item)) this._radio.set(group, null);
      this._patchGroup(group);
      return;
    }
    this._checked.set(id, !!checked);
    this._patch(id);
  }
  /** Every model item the bar knows of: the model, with every function
   *  submenu called now (as `commands()` does), and whatever is on screen. */
  _knownItems() {
    const out = [];
    const walk = (items) => {
      for (const it of _resolve(items)) {
        if (!it || it.separator) continue;
        out.push(it);
        if (it.submenu != null) walk(it.submenu);
      }
    };
    for (const m of this.menus) walk(m.items);
    for (const b of this.el.querySelectorAll(SEL_ITEM)) {
      const it = this._models.get(b);
      if (it && !out.includes(it)) out.push(it);
    }
    return out;
  }
  _findModel(id) {
    return this._knownItems().find((it) => it.id === id) || null;
  }
  /** Re-apply the state of every rendered item with this id. */
  _patch(id) {
    for (const b of this.el.querySelectorAll(SEL_ITEM)) {
      const it = this._models.get(b);
      if (it && it.id === id) this._apply(b, it);
    }
  }
  /** Re-apply the state of every rendered item of this radio group. */
  _patchGroup(group) {
    for (const b of this.el.querySelectorAll(SEL_ITEM)) {
      const it = this._models.get(b);
      if (it && it.radio === group) this._apply(b, it);
    }
  }
  _apply(btn, item) {
    const off = this._isDisabled(item);
    btn.classList.toggle("twm-menubar__item--disabled", off);
    if (off) btn.setAttribute("aria-disabled", "true");
    else btn.removeAttribute("aria-disabled");
    if (_kind(item) !== "menuitem") {
      btn.setAttribute("aria-checked", this._isChecked(item) ? "true" : "false");
    }
  }
  // ── open / close ──────────────────────────────────────────────────
  _setRoving(i) {
    this._titles.forEach((t, j) => {
      t.tabIndex = j === i ? 0 : -1;
    });
  }
  _focusTitle(i) {
    this._setRoving(i);
    this._titles[i]?.focus({ preventScroll: true });
  }
  /** The bar becomes active; remember what to give focus back to. */
  _enter(from = this._doc.activeElement) {
    if (this._active) return;
    this._active = true;
    this._returnTo = from && from !== this._doc.body && !this.el.contains(from) ? from : null;
  }
  /** Leave the bar and give focus back. */
  _exit() {
    const back = this._returnTo;
    this._closeAll();
    this._active = false;
    this._returnTo = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
    else if (this.el.contains(this._doc.activeElement)) this._doc.activeElement.blur();
  }
  /** Focus went elsewhere on purpose: close, give nothing back. */
  _deactivate() {
    this._closeAll();
    this._active = false;
    this._returnTo = null;
  }
  _open(i, focus) {
    const n = this._titles.length;
    i = (i % n + n) % n;
    this._focusTitle(i);
    this._closeAll();
    const m = this.menus[i];
    const title = this._titles[i];
    const menu = this._buildMenu(m.items, m.label);
    title.parentElement.appendChild(menu);
    title.setAttribute("aria-expanded", "true");
    this._stack = [{ menu, parent: title }];
    this._openIdx = i;
    _place(menu, title, "below");
    this._focusIn(menu, focus);
  }
  _openSub(btn, focus) {
    const item = this._models.get(btn);
    if (!item || item.submenu == null || this._isDisabled(item)) return;
    const level = this._levelOf(btn);
    if (level < 0) return;
    const open = this._stack[level + 1];
    if (open && open.parent === btn) {
      this._focusIn(open.menu, focus);
      return;
    }
    this._closeFrom(level + 1);
    const menu = this._buildMenu(item.submenu, item.label);
    btn.parentElement.appendChild(menu);
    btn.setAttribute("aria-expanded", "true");
    this._stack.push({ menu, parent: btn });
    _place(menu, btn, "right");
    this._focusIn(menu, focus);
  }
  _focusIn(menu, focus) {
    if (!focus) return;
    const items = this._enabledIn(menu);
    (focus === "last" ? items[items.length - 1] : items[0])?.focus({ preventScroll: true });
  }
  /** Close the menus at `level` and deeper. Focus inside them goes to the
   *  item (or title) they hang from. */
  _closeFrom(level) {
    if (level >= this._stack.length) return;
    const first = this._stack[level];
    if (this._stack.slice(level).some((s) => s.menu.contains(this._doc.activeElement))) {
      first.parent.focus({ preventScroll: true });
    }
    for (const s of this._stack.splice(level)) {
      s.menu.remove();
      s.parent.setAttribute("aria-expanded", "false");
    }
    if (level === 0) this._openIdx = -1;
  }
  _closeAll() {
    this._closeFrom(0);
  }
  _levelOf(el) {
    const menu = el.closest(SEL_MENU);
    return this._stack.findIndex((s) => s.menu === menu);
  }
  /** The items the keyboard can land on: no separators, nothing disabled. */
  _enabledIn(menu) {
    return this._itemsIn(menu).filter((b) => !this._isDisabled(this._models.get(b)));
  }
  /** Every item cell of `menu` in DOM order, disabled ones included. */
  _itemsIn(menu) {
    return [...menu.children].map((w) => w.firstElementChild).filter((b) => b?.matches?.(SEL_ITEM));
  }
  /** The next (`dir` 1) or previous (-1) enabled item from `btn`'s place
   *  among all the cells, wrapping. `btn` itself may be disabled: one
   *  setEnabled(id, false) leaves focus on it. */
  _stepFrom(menu, btn, dir) {
    const all = this._itemsIn(menu);
    const n = all.length;
    const at = all.indexOf(btn);
    for (let k = 1; k <= n; k++) {
      const b = all[((at + dir * k) % n + n) % n];
      if (!this._isDisabled(this._models.get(b))) return b;
    }
    return null;
  }
  _buildMenu(items, label) {
    const d = this._doc;
    const menu = d.createElement("div");
    menu.className = "twm-menubar__menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label);
    const list = _resolve(items).filter((it) => {
      if (it && (it.separator || it.id != null && it.label != null)) return true;
      console.warn("[menubar] an item needs an id and a label", it);
      return false;
    });
    const shown = list.length ? list : [{ id: null, label: this._emptyLabel, disabled: true, _empty: true }];
    for (const it of shown) {
      if (it.separator) {
        const sep = d.createElement("div");
        sep.className = "twm-menubar__separator";
        sep.setAttribute("role", "separator");
        menu.appendChild(sep);
        continue;
      }
      const wrap = d.createElement("div");
      wrap.className = "twm-menubar__cell";
      wrap.setAttribute("role", "none");
      const btn = d.createElement("button");
      btn.type = "button";
      btn.tabIndex = -1;
      const kind = _kind(it);
      btn.className = "twm-menubar__item";
      if (kind !== "menuitem") btn.classList.add(kind === "menuitemradio" ? "twm-menubar__item--radio" : "twm-menubar__item--check");
      btn.setAttribute("role", kind);
      if (it.id != null) btn.dataset.itemId = it.id;
      const check = d.createElement("span");
      check.className = "twm-menubar__check";
      check.setAttribute("aria-hidden", "true");
      const text = d.createElement("span");
      text.className = "twm-menubar__label";
      text.textContent = it.label;
      btn.append(check, text);
      if (it.shortcut) {
        const sc = d.createElement("span");
        sc.className = "twm-menubar__shortcut";
        sc.textContent = it.shortcut;
        btn.appendChild(sc);
      }
      if (it.submenu != null) {
        btn.setAttribute("aria-haspopup", "menu");
        btn.setAttribute("aria-expanded", "false");
        btn.classList.add("twm-menubar__item--submenu");
        const arrow = d.createElement("span");
        arrow.className = "twm-menubar__arrow";
        arrow.setAttribute("aria-hidden", "true");
        btn.appendChild(arrow);
      }
      this._models.set(btn, it);
      this._apply(btn, it);
      wrap.appendChild(btn);
      menu.appendChild(wrap);
    }
    return menu;
  }
  // ── activation ────────────────────────────────────────────────────
  _activate(btn) {
    const item = this._models.get(btn);
    if (!item || this._isDisabled(item)) return;
    if (item.submenu != null) {
      this._openSub(btn, "first");
      return;
    }
    this._exit();
    this._fire(item);
  }
  /** Flip a check/radio item and tell the embedder. The ONE door to
   *  `onAction`, for clicks, keys and palette rows alike. */
  _fire(item) {
    if (!item || item.separator || item._empty || this._isDisabled(item) || item.submenu != null) return;
    let checked;
    if (_kind(item) === "menuitemradio") {
      this._check(item, item.id, true);
      checked = true;
    } else if (_kind(item) === "menuitemcheckbox") {
      checked = !this._isChecked(item);
      this._check(item, item.id, checked);
    }
    this._onAction?.(item.id, { item, checked });
  }
  // ── events ────────────────────────────────────────────────────────
  _onMouseDown(e) {
    if (e.target.closest?.(SEL_TITLE)) this._enter();
    e.preventDefault();
  }
  _onClick(e) {
    const title = e.target.closest?.(SEL_TITLE);
    if (title) {
      const i = this._titles.indexOf(title);
      this._enter();
      if (this._openIdx === i) this._closeAll();
      else this._open(i, null);
      return;
    }
    const btn = e.target.closest?.(SEL_ITEM);
    if (btn) {
      e.stopPropagation();
      this._activate(btn);
    }
  }
  _onMouseOver(e) {
    const title = e.target.closest?.(SEL_TITLE);
    if (title) {
      const i = this._titles.indexOf(title);
      if (this._openIdx >= 0 && this._openIdx !== i) this._open(i, null);
      return;
    }
    const btn = e.target.closest?.(SEL_ITEM);
    if (!btn) return;
    const item = this._models.get(btn);
    if (!item || this._isDisabled(item)) return;
    btn.focus({ preventScroll: true });
    const level = this._levelOf(btn);
    if (item.submenu != null) this._openSub(btn, null);
    else if (level >= 0) this._closeFrom(level + 1);
  }
  /** Tabbed into: what had focus is the event's `relatedTarget`. */
  _onFocusIn(e) {
    if (!this._active) this._enter(e.relatedTarget);
  }
  /** Focus left the bar: to an element outside it, or to nothing (a press
   *  on a non-focusable area, the window losing focus). Either way the
   *  activation ends, so the next Alt/F10 remembers what has focus THEN. */
  _onFocusOut(e) {
    const to = e.relatedTarget;
    if (!to || !this.el.contains(to)) this._deactivate();
  }
  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const title = e.target.closest?.(SEL_TITLE);
    const btn = title ? null : e.target.closest?.(SEL_ITEM);
    if (!title && !btn) return;
    if (e.key === "Tab") {
      this._deactivate();
      return;
    }
    const handled = title ? this._titleKey(e.key, this._titles.indexOf(title)) : this._itemKey(e.key, btn);
    if (handled) e.preventDefault();
    if (handled || !/^F\d+$/.test(e.key)) e.stopPropagation();
  }
  _titleKey(key, i) {
    const n = this._titles.length;
    const open = this._openIdx >= 0;
    switch (key) {
      case "ArrowRight":
        open ? this._open(i + 1, null) : this._focusTitle((i + 1) % n);
        return true;
      case "ArrowLeft":
        open ? this._open(i - 1, null) : this._focusTitle((i - 1 + n) % n);
        return true;
      case "Home":
        open ? this._open(0, null) : this._focusTitle(0);
        return true;
      case "End":
        open ? this._open(n - 1, null) : this._focusTitle(n - 1);
        return true;
      case "ArrowDown":
      case "Enter":
      case " ":
        if (open && this._openIdx === i) this._focusIn(this._stack[0].menu, "first");
        else this._open(i, "first");
        return true;
      case "ArrowUp":
        if (open && this._openIdx === i) this._focusIn(this._stack[0].menu, "last");
        else this._open(i, "last");
        return true;
      case "Escape":
        if (open) this._closeAll();
        else this._exit();
        return true;
      default:
        return false;
    }
  }
  _itemKey(key, btn) {
    const level = this._levelOf(btn);
    if (level < 0) return false;
    const menu = this._stack[level].menu;
    const item = this._models.get(btn);
    const go = (b) => b?.focus({ preventScroll: true });
    if ((key === "ArrowLeft" || key === "Escape") && this._stack[level + 1]?.parent === btn) {
      this._closeFrom(level + 1);
      return true;
    }
    if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
      this._closeFrom(level + 1);
    }
    switch (key) {
      case "ArrowDown":
        go(this._stepFrom(menu, btn, 1));
        return true;
      case "ArrowUp":
        go(this._stepFrom(menu, btn, -1));
        return true;
      case "Home":
        this._focusIn(menu, "first");
        return true;
      case "End":
        this._focusIn(menu, "last");
        return true;
      case "ArrowRight":
        if (item?.submenu != null && !this._isDisabled(item)) this._openSub(btn, "first");
        else this._open(this._openIdx + 1, "first");
        return true;
      case "ArrowLeft":
        if (level > 0) this._closeFrom(level);
        else this._open(this._openIdx - 1, "first");
        return true;
      case "Enter":
      case " ":
        this._activate(btn);
        return true;
      case "Escape":
        if (level > 0) this._closeFrom(level);
        else this._closeAll();
        return true;
      default:
        return false;
    }
  }
  /** Alt on its own, and F10: armed on keydown, acted on here or on keyup. */
  _onDocKeyDown(e) {
    if (e.key === "Alt") {
      this._altArmed = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat;
      return;
    }
    this._altArmed = false;
    if (e.key === "F10" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      this._toggle();
    }
  }
  _onDocKeyUp(e) {
    if (e.key !== "Alt") return;
    const armed = this._altArmed;
    this._altArmed = false;
    if (!armed) return;
    e.preventDefault();
    this._toggle();
  }
  _onDocMouseDown(e) {
    this._altArmed = false;
    if (this._openIdx >= 0 && !this.el.contains(e.target)) this._deactivate();
  }
  _toggle() {
    if (this._active && (this._openIdx >= 0 || this.el.contains(this._doc.activeElement))) this._exit();
    else this.focus();
  }
};
function _resolve(items) {
  const v = typeof items === "function" ? items() : items;
  return Array.isArray(v) ? v : [];
}
function _kind(item) {
  if (item.radio != null) return "menuitemradio";
  if (typeof item.checked === "boolean") return "menuitemcheckbox";
  return "menuitem";
}
function _validateMenus(menus) {
  if (!Array.isArray(menus) || !menus.length) {
    throw new TypeError("createMenuBar: `menus` must be a non-empty array");
  }
  const walk = (items, where) => {
    if (typeof items === "function") return;
    if (!Array.isArray(items)) throw new TypeError(`createMenuBar: ${where} needs \`items\` (an array or a function)`);
    for (const it of items) {
      if (it?.separator) continue;
      if (it?.id == null || it?.label == null) {
        throw new TypeError(`createMenuBar: an item in ${where} needs an id and a label`);
      }
      if (it.submenu != null) walk(it.submenu, `"${it.label}"`);
    }
  };
  for (const m of menus) {
    if (m?.id == null || m?.label == null) throw new TypeError("createMenuBar: a menu needs an id and a label");
    walk(m.items, `menu "${m.label}"`);
  }
}
function _place(menu, anchor, side) {
  const view = menu.ownerDocument.defaultView;
  const a = anchor.getBoundingClientRect();
  const r = menu.getBoundingClientRect();
  const vw = view?.innerWidth || 0;
  const vh = view?.innerHeight || 0;
  let left = side === "below" ? a.left : a.right;
  let top = side === "below" ? a.bottom : a.top;
  if (vw && left + r.width > vw) left = side === "below" ? vw - r.width - 4 : a.left - r.width;
  if (vh && top + r.height > vh) top = Math.max(0, vh - r.height - 4);
  menu.style.left = `${Math.max(0, left)}px`;
  menu.style.top = `${Math.max(0, top)}px`;
}

export {
  setHelpProvider,
  helpProvider,
  helpCategories,
  helpCopy,
  renderMarkdown,
  DocumentOutline,
  createDocumentOutline,
  HelpModal,
  installHelpShortcut,
  createMenuBar,
  MenuBar
};
//# sourceMappingURL=chunk-JKZLNKG6.js.map
