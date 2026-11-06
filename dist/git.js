import {
  reportBridgeError,
  showConfirmDialog,
  showSelectDialog,
  toastInfo
} from "./chunk-3BLIVOFD.js";
import {
  ActionDropdown
} from "./chunk-PAI2ZUWV.js";
import {
  openForm,
  openModal,
  showContextMenu
} from "./chunk-NFZJ6P42.js";
import "./chunk-HL3IIHU3.js";
import "./chunk-Q7BALEPX.js";
import "./chunk-HNU6MM2B.js";
import "./chunk-WVFGV5FT.js";
import "./chunk-QXAOTGCC.js";
import "./chunk-JYWURG5T.js";

// src/git/line_diff.js
var LINE_DIFF_LIMIT = 1500;
function splitLines(text) {
  const s = String(text ?? "");
  if (s === "") return [];
  const lines = s.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function editScript(a, b) {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i2 = n - 1; i2 >= 0; i2--) {
    for (let j2 = m - 1; j2 >= 0; j2--) {
      lcs[i2][j2] = a[i2] === b[j2] ? lcs[i2 + 1][j2 + 1] + 1 : Math.max(lcs[i2 + 1][j2], lcs[i2][j2 + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push(["context", i, j]);
      i++;
      j++;
    } else if (i < n && (j >= m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      ops.push(["del", i, -1]);
      i++;
    } else {
      ops.push(["add", -1, j]);
      j++;
    }
  }
  return ops;
}
function computeLineDiff(before, after, {
  context = 3,
  maxLines = LINE_DIFF_LIMIT,
  beforeStart = 1,
  afterStart = 1
} = {}) {
  const a = splitLines(before);
  const b = splitLines(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  if (midA.length === 0 && midB.length === 0) return [];
  if (midA.length > maxLines || midB.length > maxLines) return null;
  const ops = [];
  for (let k = 0; k < head; k++) ops.push(["context", k, k]);
  for (const [kind, i, j] of editScript(midA, midB)) {
    ops.push([kind, i < 0 ? -1 : i + head, j < 0 ? -1 : j + head]);
  }
  for (let k = tail; k > 0; k--) ops.push(["context", a.length - k, b.length - k]);
  const keep = new Uint8Array(ops.length);
  let reach = -1;
  for (let k = 0; k < ops.length; k++) {
    if (ops[k][0] !== "context") reach = k + context;
    if (k <= reach) keep[k] = 1;
  }
  reach = ops.length;
  for (let k = ops.length - 1; k >= 0; k--) {
    if (ops[k][0] !== "context") reach = k - context;
    if (k >= reach) keep[k] = 1;
  }
  const out = [];
  let skipped = 0;
  ops.forEach(([kind, i, j], k) => {
    if (!keep[k]) {
      skipped++;
      return;
    }
    if (skipped > 0 && out.length > 0) {
      out.push({ kind: "gap", oldLine: null, newLine: null, text: "", hidden: skipped });
    }
    skipped = 0;
    out.push({
      kind,
      oldLine: i < 0 ? null : beforeStart + i,
      newLine: j < 0 ? null : afterStart + j,
      text: j < 0 ? a[i] : b[j]
    });
  });
  return out;
}
var HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
function parseUnifiedDiff(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const fileHeaders = lines.filter((l) => l.startsWith("diff --git ")).length;
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
      if (sign === "-") {
        out.push({ kind: "del", oldLine: oldNo++, newLine: null, text: body });
        oldLeft--;
      } else if (sign === "+") {
        out.push({ kind: "add", oldLine: null, newLine: newNo++, text: body });
        newLeft--;
      } else if (sign === "\\") {
        header("meta", line);
      } else {
        out.push({ kind: "context", oldLine: oldNo++, newLine: newNo++, text: body });
        oldLeft--;
        newLeft--;
      }
      continue;
    }
    const hunk = HUNK_RE.exec(line);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[3]);
      oldLeft = hunk[2] === void 0 ? 1 : Number(hunk[2]);
      newLeft = hunk[4] === void 0 ? 1 : Number(hunk[4]);
      header("hunk", line);
    } else if (line.startsWith("\\") || /^Binary files .* differ$/.test(line) || /^rename (from|to) /.test(line)) {
      header("meta", line);
    } else if (line.startsWith("diff --git ") && fileHeaders > 1) {
      header("file", / b\/(.*)$/.exec(line)?.[1] ?? line.slice("diff --git ".length));
    }
  }
  return out;
}
function diffStats(lines) {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
  }
  return { added, removed };
}

// src/git/diff_viewer.js
var DEFAULT_LABELS = Object.freeze({
  fields: "Fields",
  text: "Text",
  raw: "Raw",
  noChanges: "No differences.",
  noFields: "No field changes.",
  tooLong: "Too long to compare here.",
  gap: (hidden) => `${hidden} unchanged line${hidden === 1 ? "" : "s"}`
});
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== void 0) n.textContent = text;
  return n;
}
var shownField = (v) => {
  const s = v === null || v === void 0 ? "" : String(v);
  return s === "" ? "\u2014" : s;
};
function lineRow(line, labels) {
  const row = el("div", `twm-diff__line twm-diff__line--${line.kind}`);
  if (line.kind === "gap" || line.kind === "hunk" || line.kind === "meta" || line.kind === "file") {
    row.textContent = line.kind === "gap" ? labels.gap(line.hidden) : line.text;
    return row;
  }
  row.append(
    el("span", "twm-diff__n", line.oldLine === null ? "" : String(line.oldLine)),
    el("span", "twm-diff__n", line.newLine === null ? "" : String(line.newLine)),
    el("span", "twm-diff__sign", line.kind === "add" ? "+" : line.kind === "del" ? "-" : ""),
    el("span", "twm-diff__text", line.text)
  );
  return row;
}
function createDiffViewer(host, options = {}) {
  const { context = 3, maxLines, onViewChange = null } = options;
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const root = el("div", "twm-diff");
  const switcher = el("div", "twm-diff__views");
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", "Diff view");
  const body = el("div", "twm-diff__body");
  root.append(switcher, body);
  host.appendChild(root);
  let data = {};
  let chosen = options.view ?? null;
  let textLines;
  let current = null;
  const hasPair = () => typeof data.before === "string" || typeof data.after === "string";
  const linesOfText = () => {
    if (textLines !== void 0) return textLines;
    textLines = hasPair() ? computeLineDiff(data.before, data.after, {
      context,
      ...maxLines === void 0 ? {} : { maxLines },
      beforeStart: data.beforeStart ?? 1,
      afterStart: data.afterStart ?? 1
    }) : parseUnifiedDiff(data.diff);
    return textLines;
  };
  const offered = () => {
    const out = [];
    if (Array.isArray(data.fields)) out.push("fields");
    if (hasPair() || typeof data.diff === "string" && linesOfText().length > 0) out.push("text");
    if (typeof data.diff === "string") out.push("raw");
    return out;
  };
  const pick = (views) => {
    if (chosen && views.includes(chosen)) return chosen;
    if (views.includes("fields") && data.fields.length > 0) return "fields";
    if (views.includes("text")) return "text";
    return views[0] ?? null;
  };
  const message = (text) => {
    body.replaceChildren(el("div", "twm-diff__message", text));
  };
  const drawFields = () => {
    if (data.fields.length === 0) {
      message(labels.noFields);
      return;
    }
    const grid = el("div", "twm-diff__fields");
    for (const field of data.fields) {
      const values = el("span", "twm-diff__field-values");
      const arrow = el("span", "material-symbols-outlined twm-diff__field-arrow", "arrow_forward");
      arrow.setAttribute("aria-hidden", "true");
      values.append(
        el("span", "twm-diff__field-from", shownField(field.from)),
        arrow,
        el("span", "twm-diff__field-to", shownField(field.to))
      );
      grid.append(el("span", "twm-diff__field-name", String(field.name)), values);
    }
    body.replaceChildren(grid);
  };
  const drawText = () => {
    const lines = linesOfText();
    if (lines === null) {
      message(typeof data.diff === "string" ? `${labels.tooLong} See ${labels.raw}.` : labels.tooLong);
      return;
    }
    if (lines.length === 0) {
      message(labels.noChanges);
      return;
    }
    const list = el("div", "twm-diff__lines");
    list.append(...lines.map((line) => lineRow(line, labels)));
    body.replaceChildren(list);
  };
  const drawRaw = () => {
    if (data.diff === "") {
      message(labels.noChanges);
      return;
    }
    body.replaceChildren(el("pre", "twm-diff__raw", data.diff));
  };
  const draw = () => {
    const views = offered();
    current = pick(views);
    switcher.replaceChildren(...views.length > 1 ? views.map((v) => {
      const b = el("button", "twm-diff__view", labels[v]);
      b.type = "button";
      b.setAttribute("aria-pressed", String(v === current));
      b.addEventListener("click", () => {
        chosen = v;
        draw();
        onViewChange?.(v);
      });
      return b;
    }) : []);
    switcher.hidden = views.length <= 1;
    if (current === "fields") drawFields();
    else if (current === "text") drawText();
    else if (current === "raw") drawRaw();
    else message(labels.noChanges);
  };
  const update = (next) => {
    data = next ?? {};
    textLines = void 0;
    draw();
  };
  update(options);
  return {
    el: root,
    update,
    setView(view) {
      chosen = view;
      draw();
    },
    view: () => current,
    /** Words in place of the diff, while it loads or when it could not be read. The next update replaces them. */
    showMessage(text) {
      switcher.replaceChildren();
      switcher.hidden = true;
      current = null;
      message(text);
    },
    destroy() {
      root.remove();
    }
  };
}

// src/git/diff_window.js
function openDiffWindow({ title, load, icon: icon2 = "difference", width = 880, height = 600, labels } = {}) {
  const content = document.createElement("div");
  content.className = "twm-diff-window";
  const viewer = createDiffViewer(content, { labels });
  viewer.showMessage("Loading\u2026");
  const closed = openModal({ title, icon: icon2, content, width, height, maximizable: true });
  Promise.resolve().then(load).then((data) => {
    if (data?.ok === false) viewer.showMessage(data.error || "The diff could not be read.");
    else viewer.update(data);
  }).catch((e) => viewer.showMessage(e?.message || String(e)));
  return closed;
}
function openGitDiffWindow({ adapter, path, status, renamedFrom, ref }) {
  return openDiffWindow({
    title: renamedFrom ? `${renamedFrom} \u2192 ${path}` : path,
    load: () => adapter.diffFile({ path, status, ...renamedFrom ? { renamedFrom } : {}, ...ref ? { ref } : {} })
  });
}

// src/git/git_ops.js
async function callGit(opName, fn) {
  let result;
  try {
    result = await fn();
  } catch (e) {
    reportBridgeError(`${opName} failed`, e instanceof Error ? e : new Error(String(e)));
    return null;
  }
  const title = result?.conflicts ? `${opName} stopped on conflicts` : `${opName} failed`;
  return reportBridgeError(title, result) ? result ?? { ok: true } : null;
}
async function askFor(title, submitLabel, fields) {
  const values = await openForm({
    title,
    submitLabel,
    fields: fields.map(([name, label]) => ({ name, label, type: "text", required: true }))
  });
  if (!values) return null;
  const trimmed = Object.fromEntries(fields.map(([name]) => [name, String(values[name] ?? "").trim()]));
  return Object.values(trimmed).every(Boolean) ? trimmed : null;
}
function openDiffHandler(getAdapter, onOpenDiff) {
  if (onOpenDiff) return onOpenDiff;
  return ({ path, status, renamedFrom, ref }) => {
    const adapter = getAdapter();
    if (adapter?.diffFile) openGitDiffWindow({ adapter, path, status, renamedFrom, ref });
  };
}

// src/git/git_graph.js
var SVG_NS = "http://www.w3.org/2000/svg";
var LANE_COLOURS = 8;
var LANE_WIDTH = 11;
var ROW_HEIGHT = 22;
var NODE_RADIUS = 4;
var DEFAULT_PAGE_SIZE = 50;
function computeGraphLanes(commits) {
  const active = [];
  const allocate = () => {
    const free = active.indexOf(null);
    if (free !== -1) return free;
    active.push(null);
    return active.length - 1;
  };
  const rows = commits.map((commit) => {
    const waiting = active.indexOf(commit.hash);
    const hasChild = waiting !== -1;
    const lane = hasChild ? waiting : allocate();
    active[lane] = null;
    const passLanes = [];
    active.forEach((hash, l) => {
      if (hash !== null) passLanes.push(l);
    });
    const outputLanes = (commit.parentHashes ?? []).map((parentHash, i) => {
      let parentLane = active.indexOf(parentHash);
      if (parentLane === -1) parentLane = i === 0 ? lane : allocate();
      active[parentLane] = parentHash;
      return { lane: parentLane, parentHash };
    });
    return { lane, hasChild, outputLanes, passLanes };
  });
  return { rows, laneCount: Math.max(active.length, 1) };
}
var REF_KINDS = [
  ["HEAD -> refs/heads/", "head"],
  ["tag: refs/tags/", "tag"],
  ["refs/heads/", "branch"],
  ["refs/remotes/", "remote"]
];
function parseGitRefs(refs) {
  if (!refs) return [];
  return String(refs).split(",").map((s) => s.trim()).flatMap((part) => {
    if (part === "HEAD") return [{ name: "HEAD", type: "head" }];
    const kind = REF_KINDS.find(([prefix]) => part.startsWith(prefix));
    return kind ? [{ name: part.slice(kind[0].length), type: kind[1] }] : [];
  });
}
var laneX = (lane) => lane * LANE_WIDTH + LANE_WIDTH / 2;
function edge(d, lane) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", `twm-git-graph__edge twm-git-lane--${lane % LANE_COLOURS}`);
  path.setAttribute("d", d);
  return path;
}
function sizeGutter(svg, laneCount) {
  const width = Math.max(laneCount * LANE_WIDTH, LANE_WIDTH * 2);
  svg.setAttribute("width", String(width));
  svg.setAttribute("viewBox", `0 0 ${width} ${ROW_HEIGHT}`);
}
function createGutter(row, laneCount) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "twm-git-graph__svg");
  svg.setAttribute("height", String(ROW_HEIGHT));
  svg.setAttribute("aria-hidden", "true");
  sizeGutter(svg, laneCount);
  const h = ROW_HEIGHT;
  const cx = laneX(row.lane);
  const cy = h / 2;
  for (const lane of row.passLanes) {
    const x = laneX(lane);
    svg.appendChild(edge(`M${x},0 L${x},${h}`, lane));
  }
  if (row.hasChild) svg.appendChild(edge(`M${cx},0 L${cx},${cy}`, row.lane));
  for (const { lane } of row.outputLanes) {
    const x = laneX(lane);
    svg.appendChild(edge(x === cx ? `M${cx},${cy} L${cx},${h}` : `M${cx},${cy} C${cx},${h * 0.8} ${x},${h * 0.6} ${x},${h}`, lane));
  }
  const node = document.createElementNS(SVG_NS, "circle");
  node.setAttribute("class", `twm-git-graph__node twm-git-lane--${row.lane % LANE_COLOURS}`);
  node.setAttribute("cx", String(cx));
  node.setAttribute("cy", String(cy));
  node.setAttribute("r", String(NODE_RADIUS));
  svg.appendChild(node);
  return svg;
}
function commitTitle(commit) {
  const date = new Date(commit.timestamp * 1e3).toLocaleDateString();
  return `${commit.shortHash} \u2014 ${commit.author}
${date}

${commit.subject}`;
}
function createGitGraph(host, options = {}) {
  const { onChanged = null, pageSize = DEFAULT_PAGE_SIZE, showRemoteRefs = false } = options;
  let adapter = options.adapter ?? null;
  const openDiff = openDiffHandler(() => adapter, options.onOpenDiff);
  const root = document.createElement("div");
  root.className = "twm-git-graph";
  host.appendChild(root);
  let commits = [];
  let drawnJson = "";
  let allLoaded = false;
  let generation = 0;
  let observer = null;
  let sentinel = null;
  let destroyed = false;
  const say = (text) => {
    const m = document.createElement("div");
    m.className = "twm-git-graph__message";
    m.textContent = text;
    root.replaceChildren(m);
  };
  const stopObserving = () => {
    observer?.disconnect();
    observer = null;
    sentinel?.remove();
    sentinel = null;
  };
  const openFiles = async (git, commit, x, y) => {
    const result = await callGit("Git changes", () => git.commitFiles({ hash: commit.hash }));
    if (!result || git !== adapter) return;
    const files = result.files ?? [];
    if (files.length === 0) {
      toastInfo("No files changed", commit.shortHash);
    } else if (files.length === 1) {
      openDiff({ ...files[0], ref: commit.hash });
    } else {
      const items = files.map((f, i) => ({ label: f.path, icon: "difference", action: String(i) }));
      showContextMenu(x, y, items, (action) => {
        if (git === adapter) openDiff({ ...files[Number(action)], ref: commit.hash });
      });
    }
  };
  const menuItems = (git) => {
    const groups = [
      [
        git.checkout && { label: "Checkout (detached)", icon: "logout", action: "checkout" },
        git.createBranch && { label: "Create Branch\u2026", icon: "commit", action: "create-branch" },
        { label: "Copy Commit Hash", icon: "content_copy", action: "copy-hash" }
      ],
      [
        git.cherryPick && { label: "Cherry-pick", icon: "content_copy", action: "cherry-pick" },
        git.createTag && { label: "Create Tag\u2026", icon: "sell", action: "create-tag" },
        git.commitFiles && { label: "View Changes", icon: "difference", action: "view-changes" }
      ]
    ].map((group) => group.filter(Boolean)).filter((group) => group.length > 0);
    return groups.flatMap((group, i) => i === 0 ? group : [{ separator: true }, ...group]);
  };
  const onMenuAction = async (git, action, commit, x, y) => {
    const { hash } = commit;
    const change = async (opName, fn) => {
      await callGit(opName, fn);
      await refresh();
      onChanged?.();
    };
    switch (action) {
      case "checkout":
        await change("Git checkout", () => git.checkout({ ref: hash }));
        break;
      case "create-branch": {
        const values = await askFor("Create Branch", "Create", [["name", "Branch name"]]);
        if (values) await change("Git create branch", () => git.createBranch({ name: values.name, from: hash }));
        break;
      }
      case "copy-hash":
        try {
          await navigator.clipboard.writeText(hash);
          toastInfo("Commit hash copied", commit.shortHash);
        } catch (e) {
          reportBridgeError("Copy commit hash failed", e);
        }
        break;
      case "cherry-pick":
        await change("Git cherry-pick", () => git.cherryPick({ hash }));
        break;
      case "create-tag": {
        const values = await askFor("Create Tag", "Create", [["name", "Tag name"]]);
        if (values) await change("Git create tag", () => git.createTag({ name: values.name, hash }));
        break;
      }
      case "view-changes":
        await openFiles(git, commit, x, y);
        break;
    }
  };
  const createRow = (commit, laneRow, laneCount) => {
    const row = document.createElement("div");
    row.className = "twm-git-graph__row";
    row.title = commitTitle(commit);
    row.tabIndex = 0;
    row.appendChild(createGutter(laneRow, laneCount));
    const info = document.createElement("div");
    info.className = "twm-git-graph__info";
    for (const pill of parseGitRefs(commit.refs)) {
      if (pill.type === "remote" && !showRemoteRefs) continue;
      const span = document.createElement("span");
      span.className = `twm-git-ref twm-git-ref--${pill.type}`;
      span.textContent = pill.name;
      span.title = pill.name;
      info.appendChild(span);
    }
    const subject = document.createElement("span");
    subject.className = "twm-git-graph__subject";
    subject.textContent = commit.subject;
    info.appendChild(subject);
    row.appendChild(info);
    const openMenu = (x, y) => {
      const git = adapter;
      showContextMenu(x, y, menuItems(git), (action) => onMenuAction(git, action, commit, x, y));
    };
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY);
    });
    row.addEventListener("keydown", (e) => {
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      openMenu(r.left, r.bottom);
    });
    return row;
  };
  const observeSentinel = () => {
    stopObserving();
    if (allLoaded || commits.length === 0) return;
    sentinel = document.createElement("div");
    sentinel.className = "twm-git-graph__sentinel";
    root.appendChild(sentinel);
    observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { root });
    observer.observe(sentinel);
  };
  const drawRows = (from) => {
    stopObserving();
    const { rows, laneCount } = computeGraphLanes(commits);
    for (const svg of root.querySelectorAll(".twm-git-graph__svg")) sizeGutter(svg, laneCount);
    const fragment = document.createDocumentFragment();
    for (let i = from; i < commits.length; i++) fragment.appendChild(createRow(commits[i], rows[i], laneCount));
    root.appendChild(fragment);
    observeSentinel();
  };
  const clear = () => {
    stopObserving();
    commits = [];
    drawnJson = "";
    allLoaded = false;
    root.replaceChildren();
  };
  const refresh = async () => {
    const gen = ++generation;
    if (!adapter?.log) {
      clear();
      return;
    }
    const count = Math.max(commits.length, pageSize);
    let result;
    try {
      result = await adapter.log({ count, skip: 0 });
    } catch (e) {
      result = { ok: false, error: e?.message || String(e) };
    }
    if (destroyed || gen !== generation) return;
    if (!result?.ok) {
      clear();
      say(result?.error || "The history could not be read.");
      return;
    }
    const next = result.commits ?? [];
    const json = JSON.stringify(next);
    if (json === drawnJson) {
      if (!observer) observeSentinel();
      return;
    }
    const top = root.scrollTop;
    clear();
    drawnJson = json;
    commits = next;
    allLoaded = next.length < count;
    if (commits.length === 0) {
      say("No commits yet");
      return;
    }
    drawRows(0);
    root.scrollTop = top;
  };
  const loadMore = async () => {
    const gen = ++generation;
    stopObserving();
    const skip = commits.length;
    const result = await callGit("Git log", () => adapter.log({ count: pageSize, skip }));
    if (destroyed || gen !== generation || !result) return;
    const page = result.commits ?? [];
    allLoaded = page.length < pageSize;
    commits = commits.concat(page);
    drawnJson = JSON.stringify(commits);
    drawRows(skip);
  };
  refresh();
  return {
    el: root,
    refresh,
    setAdapter(next) {
      adapter = next ?? null;
      clear();
      refresh();
    },
    destroy() {
      destroyed = true;
      stopObserving();
      root.remove();
    }
  };
}

// src/git/git_panel.js
var DEFAULT_POLL_MS = 3e3;
var COMMIT_BOX_MAX_PX = 80;
function el2(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== void 0) n.textContent = text;
  return n;
}
function icon(name) {
  const span = el2("span", "material-symbols-outlined", name);
  span.setAttribute("aria-hidden", "true");
  return span;
}
function iconButton(className, iconName, label, onClick) {
  const b = el2("button", className);
  b.type = "button";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.appendChild(icon(iconName));
  b.addEventListener("click", onClick);
  return b;
}
var escapeLabel = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function splitPath(path) {
  const parts = String(path).replace(/\\/g, "/").split("/").filter(Boolean);
  return { name: parts[parts.length - 1] ?? String(path), dir: parts.slice(0, -1).join("/") };
}
function requireMethods(adapter) {
  const missing = ["isRepo", "status"].filter((m) => typeof adapter[m] !== "function");
  if (missing.length > 0) throw new TypeError(`createGitPanel: the adapter has no ${missing.join(" or ")} method`);
}
function createGitPanel(host, options = {}) {
  const {
    onCountChange = null,
    pollInterval = DEFAULT_POLL_MS,
    emptyLabel = "No repository",
    showRemoteRefs = false
  } = options;
  let adapter = options.adapter ?? null;
  if (adapter) requireMethods(adapter);
  const openDiff = openDiffHandler(() => adapter, options.onOpenDiff);
  let isRepo = false;
  let status = null;
  let statusJson = "";
  let branches = [];
  let busy = false;
  let pollTimer = null;
  let generation = 0;
  let reading = false;
  let destroyed = false;
  let changesExpanded = options.changesExpanded ?? true;
  let graphExpanded = options.graphExpanded ?? false;
  let graph = null;
  const root = el2("div", "twm-git-panel");
  const messageView = el2("div", "twm-git-panel__empty");
  const mainView = el2("div", "twm-git-panel__main");
  const busyBar = el2("div", "twm-git-panel__busy-bar");
  root.append(messageView, mainView);
  const branchButton = el2("button", "twm-git-panel__branch");
  branchButton.type = "button";
  const branchLabel = el2("span", "twm-git-panel__branch-label");
  branchButton.append(icon("commit"), branchLabel);
  const badges = el2("div", "twm-git-panel__badges");
  const barActions = el2("div", "twm-git-panel__bar-actions");
  const bar = el2("div", "twm-git-panel__bar");
  bar.append(branchButton, badges, barActions);
  const fetchButton = iconButton(
    "twm-git-panel__bar-btn",
    "sync",
    "Fetch",
    () => runOp("fetch", () => adapter.fetch())
  );
  const pullButton = iconButton(
    "twm-git-panel__bar-btn",
    "arrow_downward",
    "Pull",
    () => runOp("pull", () => adapter.pull())
  );
  const pushButton = iconButton(
    "twm-git-panel__bar-btn",
    "arrow_upward",
    "Push",
    () => runOp("push", () => adapter.push({ setUpstream: !status?.hasUpstream }))
  );
  const overflowButton = iconButton("twm-git-panel__bar-btn", "more_horiz", "More actions", () => {
  });
  barActions.append(fetchButton, pullButton, pushButton, overflowButton);
  const commitArea = el2("div", "twm-git-panel__commit");
  const commitBox = el2("textarea", "twm-git-panel__commit-box");
  commitBox.rows = 1;
  commitBox.placeholder = "Commit message (Ctrl+Enter to commit)";
  commitBox.setAttribute("aria-label", "Commit message");
  const commitButton = el2("button", "twm-git-panel__commit-btn", "Commit");
  commitButton.type = "button";
  const commitMenuButton = iconButton("twm-git-panel__commit-menu", "expand_more", "Commit options", () => {
  });
  const commitActions = el2("div", "twm-git-panel__commit-actions");
  commitActions.append(commitButton, commitMenuButton);
  commitArea.append(commitBox, commitActions);
  const section = (title, expanded, onToggle) => {
    const arrow = el2("span", "material-symbols-outlined twm-collapsible-arrow twm-git-panel__arrow", "expand_more");
    arrow.setAttribute("aria-hidden", "true");
    const count = el2("span", "twm-git-panel__count");
    const head = el2("button", "twm-collapsible-header twm-git-panel__section-head");
    head.type = "button";
    head.append(arrow, title, count);
    const body = el2("div", "twm-git-panel__section-body");
    const setExpanded = (on) => {
      arrow.classList.toggle("twm-git-panel__arrow--collapsed", !on);
      head.setAttribute("aria-expanded", String(on));
      body.hidden = !on;
    };
    setExpanded(expanded);
    head.addEventListener("click", () => onToggle(setExpanded));
    const wrap = el2("div", "twm-git-panel__section");
    wrap.append(head, body);
    return { wrap, body, count };
  };
  const changes = section("Changes", changesExpanded, (setExpanded) => {
    changesExpanded = !changesExpanded;
    setExpanded(changesExpanded);
  });
  const history = section("Graph", graphExpanded, (setExpanded) => {
    graphExpanded = !graphExpanded;
    setExpanded(graphExpanded);
    if (graphExpanded) ensureGraph();
  });
  mainView.append(busyBar, bar, commitArea, changes.wrap, history.wrap);
  host.appendChild(root);
  const showMessage = (iconName, text, action = null) => {
    const parts = [icon(iconName), el2("span", null, text)];
    if (action) parts.push(action);
    messageView.replaceChildren(...parts);
    messageView.hidden = false;
    mainView.hidden = true;
  };
  const showNotRepo = () => {
    let action = null;
    if (adapter.init) {
      action = el2("button", "twm-btn twm-btn--primary twm-git-panel__init", "Initialize Repository");
      action.type = "button";
      action.addEventListener("click", initRepo);
    }
    showMessage("source", "Not a git repository", action);
  };
  const fileRow = (file) => {
    const { name, dir } = splitPath(file.path);
    const row = el2("div", "twm-git-panel__file");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.title = file.renamedFrom ? `${file.renamedFrom} \u2192 ${file.path}` : file.path;
    row.append(
      el2("span", `twm-git-panel__status twm-git-panel__status--${file.status}`, file.status),
      el2("span", "twm-git-panel__file-name", name)
    );
    if (dir) row.appendChild(el2("span", "twm-git-panel__file-dir", dir));
    const open = () => openDiff({
      path: file.path,
      status: file.status,
      staged: file.staged,
      ...file.renamedFrom ? { renamedFrom: file.renamedFrom } : {}
    });
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.target === row && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        open();
      }
    });
    const actions = el2("div", "twm-git-panel__file-actions");
    const action = (iconName, label, fn) => {
      actions.appendChild(iconButton("twm-git-panel__file-btn", iconName, label, (e) => {
        e.stopPropagation();
        fn();
      }));
    };
    if (!file.staged && adapter.stage) {
      action("add", "Stage", () => runOp("stage", () => adapter.stage({ paths: [file.path] })));
    }
    if (file.staged && adapter.unstage) {
      const paths = file.renamedFrom ? [file.renamedFrom, file.path] : [file.path];
      action("remove", "Unstage", () => runOp("unstage", () => adapter.unstage({ paths })));
    }
    if (adapter.discard && file.status !== "C") action("undo", "Discard changes", () => discard(file));
    row.appendChild(actions);
    return row;
  };
  const drawStatus = () => {
    branchLabel.textContent = status.branch ?? "";
    const marks = [];
    if (status.hasUpstream && status.ahead > 0) marks.push(el2("span", "twm-git-panel__badge", `\u2191${status.ahead}`));
    if (status.hasUpstream && status.behind > 0) marks.push(el2("span", "twm-git-panel__badge", `\u2193${status.behind}`));
    badges.replaceChildren(...marks);
    const files = status.files ?? [];
    changes.count.textContent = String(files.length);
    changes.body.replaceChildren(...files.length > 0 ? files.map(fileRow) : [el2("div", "twm-git-panel__no-changes", "No changes")]);
    overflowDropdown.setOptions(overflowOptions());
  };
  const drawBusy = () => {
    busyBar.hidden = !busy;
    for (const b of [branchButton, fetchButton, pullButton, pushButton, overflowButton, commitButton, commitMenuButton]) {
      b.disabled = busy;
    }
  };
  const drawCapabilities = () => {
    if (!adapter) return;
    fetchButton.hidden = !adapter.fetch;
    pullButton.hidden = !adapter.pull;
    pushButton.hidden = !adapter.push;
    commitArea.hidden = !adapter.commit;
    const overflow = overflowOptions();
    overflowButton.hidden = overflow.every((o) => o.separator);
    overflowDropdown.setOptions(overflow);
    commitDropdown.setOptions(commitOptions());
    branchDropdown.setOptions(branchOptions());
  };
  const commitOptions = () => [
    { type: "commit", label: "Commit", icon: "check" },
    { type: "amend", label: "Commit (Amend)", icon: "edit" },
    { separator: true },
    ...adapter?.push ? [{ type: "commitPush", label: "Commit &amp; Push", icon: "arrow_upward" }] : [],
    ...adapter?.pull && adapter?.push ? [{ type: "commitSync", label: "Commit &amp; Sync", icon: "sync" }] : []
  ];
  const overflowOptions = () => {
    if (!adapter) return [];
    return [
      ...adapter.stash ? [{ type: "stash", label: "Stash", icon: "archive" }] : [],
      ...adapter.stashPop ? [{ type: "stashPop", label: "Pop Stash", icon: "unarchive" }] : [],
      { separator: true },
      ...adapter.merge ? [{ type: "merge", label: "Merge\u2026", icon: "merge" }] : [],
      ...adapter.rebase ? [{ type: "rebase", label: "Rebase\u2026", icon: "rebase_edit" }] : [],
      ...adapter.rebase && status?.rebasing ? [
        { type: "rebaseContinue", label: "Continue Rebase", icon: "play_arrow" },
        { type: "rebaseAbort", label: "Abort Rebase", icon: "cancel" }
      ] : [],
      { separator: true },
      ...adapter.remotes ? [{ type: "remotes", label: "Remotes\u2026", icon: "cloud" }] : [],
      ...adapter.tags ? [{ type: "tags", label: "Tags\u2026", icon: "sell" }] : adapter.createTag ? [{ type: "createTag", label: "Create Tag\u2026", icon: "sell" }] : []
    ];
  };
  const branchOptions = () => {
    if (!adapter) return [];
    const ref = (b, iconName) => ({ type: "checkout", ref: b.name, label: escapeLabel(b.name), icon: iconName });
    return [
      ...adapter.checkout ? [
        ...branches.filter((b) => !b.isRemote).map((b) => ref(b, b.isCurrent ? "check" : "commit")),
        { separator: true },
        ...branches.filter((b) => b.isRemote).map((b) => ref(b, "cloud"))
      ] : [],
      { separator: true },
      ...adapter.createBranch ? [{ type: "createBranch", label: "Create Branch\u2026", icon: "add" }] : [],
      ...adapter.deleteBranch ? [{ type: "deleteBranch", label: "Delete Branch\u2026", icon: "delete" }] : []
    ];
  };
  const branchDropdown = new ActionDropdown({
    trigger: branchButton,
    options: [],
    onSelect: (option) => onBranchOption(option)
  });
  const commitDropdown = new ActionDropdown({
    trigger: commitMenuButton,
    options: [],
    onSelect: (option) => commit(option.type)
  });
  const overflowDropdown = new ActionDropdown({
    trigger: overflowButton,
    options: [],
    onSelect: (option) => onOverflowOption(option)
  });
  const readBranches = async (gen) => {
    if (!adapter?.branches) return;
    let result;
    try {
      result = await adapter.branches();
    } catch {
      return;
    }
    if (gen !== generation || destroyed || !result?.ok) return;
    branches = result.branches ?? [];
    branchDropdown.setOptions(branchOptions());
  };
  const refresh = async () => {
    const gen = ++generation;
    if (!adapter) {
      showMessage("folder_off", emptyLabel);
      onCountChange?.(0);
      return;
    }
    reading = true;
    try {
      if (!isRepo) {
        const check = await adapter.isRepo();
        if (gen !== generation || destroyed) return;
        if (!check?.ok) {
          showMessage("error", check?.error || "The repository could not be read.");
          onCountChange?.(0);
          return;
        }
        if (!check.isRepo) {
          showNotRepo();
          onCountChange?.(0);
          return;
        }
        isRepo = true;
      }
      const result = await adapter.status();
      if (gen !== generation || destroyed) return;
      if (!result?.ok) {
        isRepo = false;
        statusJson = "";
        showMessage("error", result?.error || "The repository could not be read.");
        onCountChange?.(0);
        return;
      }
      messageView.hidden = true;
      mainView.hidden = false;
      const json = JSON.stringify(result);
      if (json === statusJson) return;
      statusJson = json;
      status = result;
      drawStatus();
      onCountChange?.((result.files ?? []).length);
      readBranches(gen);
      graph?.refresh();
    } catch (e) {
      if (gen !== generation || destroyed) return;
      isRepo = false;
      statusJson = "";
      showMessage("error", e?.message || String(e));
      onCountChange?.(0);
    } finally {
      if (gen === generation) reading = false;
    }
  };
  const poll = () => {
    if (!reading && !busy) refresh();
  };
  const startPolling = () => {
    if (pollTimer !== null || destroyed) return;
    refresh();
    if (pollInterval > 0) pollTimer = setInterval(poll, pollInterval);
  };
  const stopPolling = () => {
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = null;
  };
  async function runOp(opName, fn) {
    if (busy) {
      toastInfo("Git is busy", `The ${opName} did not run: another operation is still going.`);
      return;
    }
    busy = true;
    drawBusy();
    await callGit(`Git ${opName}`, fn);
    busy = false;
    drawBusy();
    statusJson = "";
    await refresh();
  }
  async function initRepo() {
    const result = await callGit("Git init", () => adapter.init());
    if (result) await refresh();
  }
  async function inSteps(steps) {
    let result;
    for (const step of steps) {
      result = await step();
      if (result && result.ok === false) return result;
    }
    return result;
  }
  async function commit(mode) {
    const message = commitBox.value.trim();
    const amend = mode === "amend";
    if (!message && !amend) {
      commitBox.focus();
      return;
    }
    const files = status?.files ?? [];
    if (!amend && files.length === 0) {
      toastInfo("Nothing to commit", "There are no changes.");
      return;
    }
    const git = adapter;
    const setUpstream = !status?.hasUpstream;
    const stageAll = !amend && git.stage && !files.some((f) => f.staged);
    await runOp("commit", () => inSteps([
      ...stageAll ? [() => git.stage({ paths: "all" })] : [],
      async () => {
        const result = await git.commit({ message: message || null, amend });
        if (git === adapter && (!result || result.ok !== false)) {
          commitBox.value = "";
          commitBox.style.height = "";
        }
        return result;
      },
      ...mode === "commitSync" ? [() => git.pull()] : [],
      ...mode === "commitPush" || mode === "commitSync" ? [() => git.push({ setUpstream })] : []
    ]));
  }
  const discardWords = ({ path, status: letter, renamedFrom }) => {
    const { name } = splitPath(path);
    if (letter === "U") {
      return { title: "Delete File", okLabel: "Delete", message: `Delete the untracked file "${name}"? This cannot be undone.` };
    }
    if (letter === "A") {
      return { title: "Delete File", okLabel: "Delete", message: `Delete the new file "${name}"? It was never committed, so this cannot be undone.` };
    }
    if (renamedFrom) {
      return { title: "Discard Changes", okLabel: "Discard", message: `Put "${splitPath(renamedFrom).name}" back and discard all changes to "${name}"?` };
    }
    return { title: "Discard Changes", okLabel: "Discard", message: `Discard all changes to "${name}"?` };
  };
  async function discard(file) {
    const git = adapter;
    const confirmed = await showConfirmDialog({ ...discardWords(file), icon: "warning", okVariant: "danger" });
    if (!confirmed) return;
    await runOp("discard", () => git.discard({
      path: file.path,
      status: file.status,
      ...file.renamedFrom ? { renamedFrom: file.renamedFrom } : {}
    }));
  }
  async function onBranchOption(option) {
    if (option.type === "checkout") {
      await runOp("checkout", () => adapter.checkout({ ref: option.ref }));
    } else if (option.type === "createBranch") {
      const git = adapter;
      const values = await askFor("Create Branch", "Create", [["name", "Branch name"]]);
      if (values) await runOp("create branch", () => git.createBranch({ name: values.name }));
    } else if (option.type === "deleteBranch") {
      await deleteBranch();
    }
  }
  const otherLocalBranches = () => branches.filter((b) => !b.isCurrent && !b.isRemote);
  async function deleteBranch() {
    const git = adapter;
    const others = otherLocalBranches();
    if (others.length === 0) {
      toastInfo("Nothing to delete", "There is no other local branch.");
      return;
    }
    const name = await showSelectDialog({
      title: "Delete Branch",
      okLabel: "Delete",
      items: others.map((b) => ({ value: b.name, label: b.name }))
    });
    if (!name) return;
    let notMerged = false;
    await runOp("delete branch", async () => {
      const result = await git.deleteBranch({ name, force: false });
      notMerged = result?.notMerged === true;
      return notMerged ? { ok: true } : result;
    });
    if (!notMerged) return;
    const force = await showConfirmDialog({
      title: "Force Delete Branch",
      message: `"${name}" is not fully merged. Delete it anyway? Commits only on it may be lost.`,
      icon: "warning",
      okLabel: "Force Delete",
      okVariant: "danger"
    });
    if (force) await runOp("delete branch", () => git.deleteBranch({ name, force: true }));
  }
  async function onOverflowOption(option) {
    switch (option.type) {
      case "stash":
        await runOp("stash", () => adapter.stash({}));
        break;
      case "stashPop":
        await runOp("stash pop", () => adapter.stashPop());
        break;
      case "merge":
      case "rebase":
        await mergeOrRebase(option.type);
        break;
      case "rebaseContinue":
        await runOp("rebase", () => adapter.rebase({ continue: true }));
        break;
      case "rebaseAbort":
        await runOp("rebase", () => adapter.rebase({ abort: true }));
        break;
      case "remotes":
        await showRemotesMenu();
        break;
      case "tags":
        await showTagsMenu();
        break;
      case "createTag":
        await createTag(adapter);
        break;
    }
  }
  async function mergeOrRebase(op) {
    const git = adapter;
    const others = otherLocalBranches();
    if (others.length === 0) {
      toastInfo(`Nothing to ${op}`, "There is no other local branch.");
      return;
    }
    const branch = await showSelectDialog({
      title: op === "merge" ? "Merge Branch" : "Rebase onto Branch",
      okLabel: op === "merge" ? "Merge" : "Rebase",
      items: others.map((b) => ({ value: b.name, label: b.name }))
    });
    if (!branch) return;
    await runOp(op, () => op === "merge" ? git.merge({ branch }) : git.rebase({ onto: branch }));
  }
  const barMenu = (items, emptyTitle, onAction) => {
    if (items.length === 0) {
      toastInfo(emptyTitle, "There are none in this repository.");
      return;
    }
    const anchor = barActions.getBoundingClientRect();
    showContextMenu(anchor.left, anchor.bottom + 4, items, onAction);
  };
  async function showRemotesMenu() {
    const git = adapter;
    const result = await callGit("Git remotes", () => git.remotes());
    if (!result || git !== adapter) return;
    const remotes = result.remotes ?? [];
    const items = git.removeRemote ? remotes.map((r, i) => ({
      label: `Remove ${r.name}`,
      title: r.url,
      icon: "cloud_off",
      action: String(i),
      danger: true
    })) : remotes.map((r) => ({ label: r.name, title: r.url, icon: "cloud", disabled: true }));
    if (git.addRemote) {
      if (items.length > 0) items.push({ separator: true });
      items.push({ label: "Add Remote\u2026", icon: "add", action: "add" });
    }
    barMenu(items, "No remotes", async (action) => {
      if (action === "add") {
        const values = await askFor("Add Remote", "Add", [["name", "Name"], ["url", "URL"]]);
        if (values) await runOp("add remote", () => git.addRemote(values));
        return;
      }
      const { name } = remotes[Number(action)];
      const confirmed = await showConfirmDialog({
        title: "Remove Remote",
        message: `Remove remote "${name}"?`,
        icon: "warning",
        okLabel: "Remove",
        okVariant: "danger"
      });
      if (confirmed) await runOp("remove remote", () => git.removeRemote({ name }));
    });
  }
  async function createTag(git) {
    const values = await askFor("Create Tag", "Create", [["name", "Tag name"]]);
    if (values) await runOp("create tag", () => git.createTag({ name: values.name }));
  }
  async function showTagsMenu() {
    const git = adapter;
    const result = await callGit("Git tags", () => git.tags());
    if (!result || git !== adapter) return;
    const tags = result.tags ?? [];
    const items = git.deleteTag ? tags.map((t, i) => ({
      label: `Delete ${t.name}`,
      title: t.hash,
      icon: "delete",
      action: String(i),
      danger: true
    })) : tags.map((t) => ({ label: t.name, title: t.hash, icon: "sell", disabled: true }));
    if (git.createTag) {
      if (items.length > 0) items.push({ separator: true });
      items.push({ label: "Create Tag\u2026", icon: "add", action: "add" });
    }
    barMenu(items, "No tags", async (action) => {
      if (action === "add") {
        await createTag(git);
        return;
      }
      const { name } = tags[Number(action)];
      const confirmed = await showConfirmDialog({
        title: "Delete Tag",
        message: `Delete tag "${name}"?`,
        icon: "warning",
        okLabel: "Delete",
        okVariant: "danger"
      });
      if (confirmed) await runOp("delete tag", () => git.deleteTag({ name }));
    });
  }
  function ensureGraph() {
    if (graph || !adapter?.log) return;
    graph = createGitGraph(history.body, {
      adapter,
      onOpenDiff: openDiff,
      showRemoteRefs,
      onChanged: () => {
        statusJson = "";
        refresh();
      }
    });
  }
  commitButton.addEventListener("click", () => commit("commit"));
  commitBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit("commit");
    }
  });
  commitBox.addEventListener("input", () => {
    commitBox.style.height = "auto";
    commitBox.style.height = `${Math.min(commitBox.scrollHeight, COMMIT_BOX_MAX_PX)}px`;
  });
  branchButton.addEventListener("click", () => readBranches(generation));
  drawBusy();
  drawCapabilities();
  if (graphExpanded) ensureGraph();
  showMessage("hourglass_empty", "Checking repository\u2026");
  startPolling();
  return {
    el: root,
    refresh,
    startPolling,
    stopPolling,
    setAdapter(next) {
      if (next) requireMethods(next);
      adapter = next ?? null;
      isRepo = false;
      status = null;
      statusJson = "";
      branches = [];
      reading = false;
      commitBox.value = "";
      commitBox.style.height = "";
      changes.body.replaceChildren();
      drawCapabilities();
      graph?.setAdapter(adapter);
      if (graphExpanded) ensureGraph();
      if (adapter) showMessage("hourglass_empty", "Checking repository\u2026");
      refresh();
    },
    destroy() {
      destroyed = true;
      generation++;
      stopPolling();
      branchDropdown.destroy();
      commitDropdown.destroy();
      overflowDropdown.destroy();
      graph?.destroy();
      root.remove();
    }
  };
}
export {
  LINE_DIFF_LIMIT,
  computeGraphLanes,
  computeLineDiff,
  createDiffViewer,
  createGitGraph,
  createGitPanel,
  diffStats,
  openDiffWindow,
  openGitDiffWindow,
  parseGitRefs,
  parseUnifiedDiff,
  splitLines
};
//# sourceMappingURL=git.js.map
