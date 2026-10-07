import {
  modalHost
} from "./chunk-6NG7YVBG.js";
import {
  DataTable
} from "./chunk-KH2GJTKR.js";
import "./chunk-6JSOVNID.js";
import "./chunk-FL5KFNQH.js";
import {
  CanvasAdapter,
  arrange,
  returnEdge,
  routeEdge
} from "./chunk-SN4LSOAR.js";
import {
  __export
} from "./chunk-JYWURG5T.js";

// src/flow/kit/strings.js
var plural = (n, one, many) => n === 1 ? one : many.replace("{n}", String(n));
var FLOW_STRINGS = Object.freeze({
  // ── the words every editor shares ──────────────────────────────────
  step: "step",
  steps: "steps",
  addStep: "Add a step",
  removeStep: "Remove step",
  duplicate: "Duplicate",
  rename: "Rename",
  undo: "Undo",
  redo: "Redo",
  undoTitle: "Undo (Ctrl+Z)",
  redoTitle: "Redo (Ctrl+Y)",
  foldAll: "Fold all",
  unfoldAll: "Unfold all",
  stepsInside: (n) => plural(n, "1 step inside", "{n} steps inside"),
  stepsShow: "Steps show",
  thePreview: "The preview",
  theLastRun: "The last run",
  addSource: "Add a source \u2014 starts a new lane",
  settings: "Settings",
  readOnly: "Read only",
  // ── the settings panel and its fields ──────────────────────────────
  required: " *",
  requiredLabel: "required",
  choose: "Choose\u2026",
  defaultOption: (v) => `Default (${v})`,
  notFound: (v) => `${v} (not found)`,
  noControl: "This setting has no control in this editor; its value is kept as it is.",
  unknownWidget: (name) => `This setting needs the "${name}" control, which this editor does not have. Its value is kept as it is.`,
  foldDefaults: "Defaults",
  add: "Add",
  remove: "Remove",
  removeNamed: (what) => `Remove ${what}`,
  addAssignment: "Add assignment",
  name: "Name",
  value: "Value",
  formula: "Formula",
  textOrValue: "Text, or insert a value",
  noColumns: "There are no columns to choose from yet: connect a step before this one.",
  noColumnsChosen: "None chosen",
  fieldFinding: "Fix this before publishing",
  // ── reference chips and Insert a value ─────────────────────────────
  insertValue: "Insert a value",
  insertValueGlyph: "{ }",
  searchValues: "Search values",
  wholeValue: (label) => `All of ${label}`,
  back: "Back",
  insertsLine: (ref) => `Inserts ${ref} \u2014 shown as a chip, kept as text.`,
  noValues: "Nothing to insert here yet.",
  valueKeys: "\u2191 \u2193 choose \xB7 Enter inserts \xB7 Esc closes",
  // ── the step picker ────────────────────────────────────────────────
  searchSteps: "Search steps",
  pickerKeys: "\u2191 \u2193 choose \xB7 Enter adds \xB7 Esc closes",
  pasteStep: "Paste a copied step \xB7 Ctrl+V",
  nothingMatches: (q) => `Nothing matches \u201C${q}\u201D.`,
  // ── findings ───────────────────────────────────────────────────────
  toFix: (n) => plural(
    n,
    "1 thing to fix before this can be published.",
    "{n} things to fix before this can be published."
  ),
  toLookAt: (n) => plural(n, "1 thing to look at.", "{n} things to look at."),
  goToIt: "Go to it",
  theFlow: "The flow",
  findingLine: (where, message) => where ? `${where} \u2014 ${message}` : message
});
function createStrings(...layers) {
  return Object.freeze(Object.assign({}, FLOW_STRINGS, ...layers.filter((l) => l && typeof l === "object")));
}
function say(strings, key, ...args) {
  const s = strings?.[key] ?? FLOW_STRINGS[key];
  if (typeof s === "function") return s(...args);
  return s === void 0 || s === null ? String(key) : String(s);
}

// src/flow/kit/dom.js
var TONES = Object.freeze(["violet", "teal", "amber", "grey", "blue", "indigo"]);
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== void 0 && text !== null) n.textContent = String(text);
  return n;
}
function icon(name, className = "") {
  const g = el("span", `material-symbols-outlined${className ? ` ${className}` : ""}`, name || "");
  g.setAttribute("aria-hidden", "true");
  return g;
}
function toneClass(block, tone) {
  return `${block}--${TONES.includes(tone) ? tone : "grey"}`;
}
function toneOf(tone) {
  return TONES.includes(tone) ? tone : "grey";
}
function button({
  label,
  icon: glyph = null,
  primary = false,
  danger = false,
  iconOnly = false,
  title = null,
  className = "",
  onClick = null,
  type = "button"
} = {}) {
  const b = el("button", [
    "twm-btn",
    primary ? "twm-btn--primary" : "",
    danger ? "twm-btn--danger" : "",
    className
  ].filter(Boolean).join(" "));
  b.type = type;
  if (glyph) b.appendChild(icon(glyph, "twm-btn__glyph"));
  if (iconOnly) {
    b.setAttribute("aria-label", label);
    b.title = title || label;
  } else {
    b.appendChild(el("span", "twm-btn__label", label));
    if (title) b.title = title;
  }
  if (onClick) b.addEventListener("click", onClick);
  return b;
}
var SEQ = 0;
function uid(stem = "flow") {
  SEQ += 1;
  return `twm-uid-${stem}-${SEQ}`;
}
var EDGE = 8;
var GAP = 4;
var ACTIVE = null;
function closeFlowPopovers() {
  ACTIVE?.close("closed");
}
function openFlowPopover() {
  return ACTIVE ? ACTIVE.el : null;
}
function openPopover({ anchor, content, label, className = "", onClose = null, focus = null }) {
  if (ACTIVE && anchor && ACTIVE.anchor === anchor) {
    ACTIVE.close("toggle");
    return { el: null, close() {
    }, reposition() {
    }, toggled: true };
  }
  ACTIVE?.close("replaced");
  const pop = el("div", `twm-flow-popover${className ? ` ${className}` : ""}`);
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", label || "");
  pop.tabIndex = -1;
  pop.appendChild(content);
  (modalHost() || document.body).appendChild(pop);
  let closed = false;
  const place = () => {
    if (closed) return;
    const view = {
      w: document.documentElement.clientWidth || window.innerWidth || 1024,
      h: document.documentElement.clientHeight || window.innerHeight || 768
    };
    const a = anchor?.getBoundingClientRect?.() || { left: 0, top: 0, bottom: 0, right: 0 };
    const box = pop.getBoundingClientRect();
    let left = a.left;
    if (left + box.width > view.w - EDGE && a.right - box.width >= EDGE) left = a.right - box.width;
    let top = a.bottom + GAP;
    if (top + box.height > view.h - EDGE && a.top - GAP - box.height >= EDGE) top = a.top - GAP - box.height;
    left = Math.max(EDGE, Math.min(left, view.w - box.width - EDGE));
    top = Math.max(EDGE, Math.min(top, view.h - box.height - EDGE));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  };
  const onPress = (ev) => {
    if (pop.contains(ev.target)) return;
    if (anchor && anchor.contains?.(ev.target)) return;
    handle.close("outside");
  };
  const onKey = (ev) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    handle.close("escape");
  };
  const onResize = () => place();
  const handle = {
    el: pop,
    anchor,
    toggled: false,
    reposition: place,
    close(reason = "closed") {
      if (closed) return;
      closed = true;
      const held = pop.contains(document.activeElement) || document.activeElement === document.body;
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("mousedown", onPress, true);
      pop.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      pop.remove();
      if (ACTIVE === handle) ACTIVE = null;
      if (held && reason !== "blur" && anchor?.isConnected) anchor.focus?.({ preventScroll: true });
      onClose?.(reason);
    }
  };
  ACTIVE = handle;
  setTimeout(() => {
    if (closed) return;
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("mousedown", onPress, true);
  }, 0);
  pop.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  place();
  (focus || pop).focus?.({ preventScroll: true });
  return handle;
}
function nextOption(listbox, current, step) {
  const options = [...listbox.querySelectorAll('[role="option"]')].filter((o) => o.getAttribute("aria-disabled") !== "true" && !o.hidden && !o.closest("[hidden]"));
  if (!options.length) return null;
  const at = options.indexOf(current);
  if (at < 0) return step > 0 ? options[0] : options[options.length - 1];
  return options[Math.max(0, Math.min(options.length - 1, at + step))];
}

// src/flow/kit/settings_schema.js
var SETTINGS_SCHEMA_ANNOTATIONS = Object.freeze(["title", "description", "default", "examples"]);
var SETTINGS_SCHEMA_KEYWORDS = Object.freeze([
  "type",
  "enum",
  "const",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "format"
]);
var SETTINGS_SCHEMA_TYPES = Object.freeze([
  "object",
  "array",
  "string",
  "integer",
  "number",
  "boolean",
  "null"
]);
var UI_HINTS = Object.freeze([
  "x-ui-widget",
  "x-ui-references",
  "x-ui-when",
  "x-ui-placeholder",
  "x-ui-enum-labels",
  "x-ui-multiline",
  "x-ui-fold"
]);
var isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function pyRepr(value) {
  if (value === null || value === void 0) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const q = value.includes("'") && !value.includes('"') ? '"' : "'";
    let out = "";
    for (const ch of value) {
      const code = ch.codePointAt(0);
      if (ch === "\\") out += "\\\\";
      else if (ch === q) out += `\\${q}`;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "	") out += "\\t";
      else if (code < 32 || code === 127) out += `\\x${code.toString(16).padStart(2, "0")}`;
      else out += ch;
    }
    return q + out + q;
  }
  return JSON.stringify(value);
}
function checkSettingsSchema(schema, path = "") {
  const where = path || "<root>";
  if (!isPlainObject(schema)) return `${where}: a schema must be an object.`;
  for (const [key, value] of Object.entries(schema)) {
    if (SETTINGS_SCHEMA_ANNOTATIONS.includes(key) || key.startsWith("x-")) continue;
    if (!SETTINGS_SCHEMA_KEYWORDS.includes(key)) return `${where}: the keyword ${pyRepr(key)} is not supported.`;
    if (key === "type") {
      for (const n of Array.isArray(value) ? value : [value]) {
        if (!SETTINGS_SCHEMA_TYPES.includes(n)) return `${where}: unknown type ${pyRepr(n)}.`;
      }
    } else if (key === "properties") {
      if (!isPlainObject(value)) return `${path}: properties must be an object.`;
      for (const [name, sub] of Object.entries(value)) {
        const refused = checkSettingsSchema(sub, path ? `${path}.${name}` : name);
        if (refused) return refused;
      }
    } else if (key === "items") {
      const refused = checkSettingsSchema(value, `${path}[]`);
      if (refused) return refused;
    } else if (key === "additionalProperties" && typeof value !== "boolean") {
      return `${path}: additionalProperties must be true or false.`;
    } else if (key === "format" && value !== "uuid") {
      return `${path}: only format 'uuid' is supported.`;
    } else if (key === "required" && !(Array.isArray(value) && value.every((v) => typeof v === "string"))) {
      return `${path}: required must be a list of names.`;
    }
  }
  return null;
}
function fieldsFromSchema(schema) {
  const props = isPlainObject(schema?.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  return Object.entries(props).map(([key, spec]) => ({
    key,
    spec: isPlainObject(spec) ? spec : {},
    required: required.has(key)
  }));
}
function titleOf(key, spec = {}) {
  if (spec?.title) return String(spec.title);
  const words3 = String(key).replace(/_/g, " ");
  return words3.charAt(0).toUpperCase() + words3.slice(1);
}
function primaryType(spec) {
  return Array.isArray(spec?.type) ? spec.type[0] : spec?.type;
}
function admittedTypes(spec) {
  return [].concat(spec?.type ?? []);
}
function fieldVisible(field, value, fields = []) {
  const when = field?.spec?.["x-ui-when"];
  if (!isPlainObject(when) || typeof when.field !== "string" || !Array.isArray(when.in)) return true;
  const sibling = fields.find((f) => f.key === when.field);
  const stored = value && typeof value === "object" ? value[when.field] : void 0;
  const current = stored !== void 0 ? stored : sibling?.spec?.default;
  return when.in.some((v) => v === current);
}
function visibleFields(fields, value) {
  return fields.filter((f) => fieldVisible(f, value, fields));
}
function whenKeys(fields) {
  const keys = /* @__PURE__ */ new Set();
  for (const f of fields) {
    const when = f?.spec?.["x-ui-when"];
    if (isPlainObject(when) && typeof when.field === "string") keys.add(when.field);
  }
  return keys;
}
function enumLabel(spec, v) {
  const words3 = spec?.["x-ui-enum-labels"];
  return isPlainObject(words3) && words3[v] !== void 0 ? String(words3[v]) : String(v);
}

// src/flow/kit/catalogue.js
var isPlainObject2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function defaultIdBase(type) {
  return String(type?.type_id ?? type ?? "step");
}
function cleanStem(stem) {
  return String(stem ?? "").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40) || "step";
}
function normalisePort(p) {
  return {
    ...p,
    name: String(p.name),
    direction: p.direction === "output" ? "output" : "input",
    port_type: p.port_type ? String(p.port_type) : "FLOW",
    label: p.label ?? String(p.name),
    required: Boolean(p.required),
    multiple: Boolean(p.multiple)
  };
}
function createStepCatalogue(types, { categories = [], idBase = defaultIdBase } = {}) {
  const problems = [];
  const byId = /* @__PURE__ */ new Map();
  const order = [];
  for (const raw of Array.isArray(types) ? types : []) {
    if (!isPlainObject2(raw)) {
      problems.push({ type_id: null, message: "A step type must be an object." });
      continue;
    }
    const id = raw.type_id;
    if (typeof id !== "string" || !id) {
      problems.push({ type_id: null, message: `A step type has no type_id (label: ${raw.label ?? "\u2014"}).` });
      continue;
    }
    if (byId.has(id)) {
      problems.push({ type_id: id, message: `A second step type is called "${id}"; the first is kept.` });
      continue;
    }
    const ports = [];
    for (const p of Array.isArray(raw.ports) ? raw.ports : []) {
      if (!isPlainObject2(p) || typeof p.name !== "string" || !p.name) {
        problems.push({ type_id: id, message: `"${id}" declares a port without a name; it is left out.` });
        continue;
      }
      ports.push(normalisePort(p));
    }
    const schema = isPlainObject2(raw.config_schema) ? raw.config_schema : {};
    const refused = raw.config_schema === void 0 ? null : checkSettingsSchema(raw.config_schema);
    if (refused) problems.push({ type_id: id, message: `"${id}"'s settings schema: ${refused}` });
    const type = Object.freeze({
      ...raw,
      label: raw.label ?? id,
      category: raw.category ?? null,
      role: raw.role || "step",
      description: raw.description ?? "",
      icon: raw.icon ?? "",
      ports: Object.freeze(ports.map((p) => Object.freeze(p))),
      config_schema: schema,
      unavailable: raw.unavailable ?? null
    });
    byId.set(id, type);
    order.push(type);
  }
  const cats = (Array.isArray(categories) ? categories : []).filter(isPlainObject2).map((c) => Object.freeze({
    id: String(c.id),
    label: c.label ?? String(c.id),
    tone: TONES.includes(c.tone) ? c.tone : "grey",
    layout: c.layout === "grid" ? "grid" : "list"
  }));
  const catIndex = new Map(cats.map((c, i) => [c.id, i]));
  const extra = [];
  for (const t of order) {
    if (t.category !== null && !catIndex.has(t.category) && !extra.some((c) => c.id === t.category)) {
      extra.push(Object.freeze({ id: String(t.category), label: String(t.category), tone: "grey", layout: "list" }));
    }
  }
  if (order.some((t) => t.category === null)) {
    extra.push(Object.freeze({ id: "", label: "", tone: "grey", layout: "list" }));
  }
  const allCats = Object.freeze([...cats, ...extra]);
  const rank = (t) => {
    const id = t.category === null ? "" : t.category;
    return allCats.findIndex((c) => c.id === id);
  };
  const sorted2 = [...order].sort((a, b) => rank(a) - rank(b) || String(a.label).localeCompare(String(b.label)));
  const portsOf2 = (typeId, direction, flow) => {
    const t = byId.get(typeId);
    if (!t) return [];
    return t.ports.filter((p) => p.direction === direction && (!flow || p.port_type === "FLOW"));
  };
  return Object.freeze({
    problems: Object.freeze(problems.map((p) => Object.freeze(p))),
    categories: allCats,
    get: (typeId) => byId.get(typeId) ?? null,
    has: (typeId) => byId.has(typeId),
    list: () => [...sorted2],
    byCategory: () => allCats.map((category) => ({ category, types: sorted2.filter((t) => (t.category ?? "") === category.id) })).filter((g) => g.types.length > 0),
    role: (typeId) => byId.get(typeId)?.role || "step",
    category: (typeId) => {
      const t = byId.get(typeId);
      return t ? allCats.find((c) => c.id === (t.category ?? "")) ?? null : null;
    },
    tone: (typeId) => {
      const t = byId.get(typeId);
      return t && allCats.find((c) => c.id === (t.category ?? ""))?.tone || "grey";
    },
    inputs: (typeId, { flow = false } = {}) => portsOf2(typeId, "input", flow),
    outputs: (typeId, { flow = false } = {}) => portsOf2(typeId, "output", flow),
    port: (typeId, name, direction) => byId.get(typeId)?.ports.find((p) => p.name === name && (!direction || p.direction === direction)) ?? null,
    /** A new step's id stem for `typeId`, safe to put in an id. */
    idBase: (typeId) => cleanStem(idBase(byId.get(typeId) ?? { type_id: typeId }))
  });
}

// src/flow/kit/references.js
var TEMPLATE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+|\[\d+\]|\["[^"\\]*"\])*)\}/g;
var FORMULA_PATTERN = /\[([^[\]\n]+)\]/g;
var PARAMETER_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
function pathSegments(path) {
  const out = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  const s = String(path);
  const push = (end) => {
    if (end > start) out.push({ text: s.slice(start, end), start, end });
  };
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === '"') quote = false;
      continue;
    }
    if (ch === '"' && depth > 0) {
      quote = true;
      continue;
    }
    if (ch === "[") {
      if (depth === 0) {
        push(i);
        start = i;
      }
      depth += 1;
    } else if (ch === "]" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        push(i + 1);
        start = i + 1;
      }
    } else if (ch === "." && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(s.length);
  return out;
}
function createReferenceSyntax({
  name,
  pattern,
  format,
  describe = null,
  stepScope = null,
  stepSegment = null,
  tone = "blue"
}) {
  if (!(pattern instanceof RegExp)) throw new Error(`Reference syntax "${name}" needs a RegExp pattern.`);
  if (typeof format !== "function") throw new Error(`Reference syntax "${name}" needs a format(path) function.`);
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const syntax = {
    name: String(name),
    pattern: new RegExp(pattern.source, flags),
    format,
    describe,
    tone,
    stepScope,
    stepSegment,
    find(text) {
      const out = [];
      if (typeof text !== "string" || !text) return out;
      const re = new RegExp(syntax.pattern.source, syntax.pattern.flags);
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0] === "") {
          re.lastIndex += 1;
          continue;
        }
        out.push({ start: m.index, end: m.index + m[0].length, text: m[0], path: m[1] ?? m[0] });
      }
      return out;
    },
    /** The index of the segment of `path` that names a step, or -1. */
    stepIndex(path) {
      const segs = pathSegments(path).map((s) => s.text);
      if (typeof syntax.stepSegment === "function") {
        const i = syntax.stepSegment(segs);
        return Number.isInteger(i) && i >= 0 && i < segs.length ? i : -1;
      }
      const scopes = [].concat(syntax.stepScope ?? []);
      if (!scopes.length) return -1;
      return scopes.includes(segs[0]) && segs.length > 1 ? 1 : -1;
    },
    rename(text, map) {
      if (typeof text !== "string" || !map) return text;
      const lookup = map instanceof Map ? map : new Map(Object.entries(map));
      if (!lookup.size) return text;
      const matches = syntax.find(text);
      if (!matches.length) return text;
      let out = "";
      let at = 0;
      for (const m of matches) {
        const i = syntax.stepIndex(m.path);
        if (i < 0) continue;
        const seg = pathSegments(m.path)[i];
        if (!lookup.has(seg.text)) continue;
        const path = m.path.slice(0, seg.start) + lookup.get(seg.text) + m.path.slice(seg.end);
        out += text.slice(at, m.start) + syntax.format(path);
        at = m.end;
      }
      return out + text.slice(at);
    }
  };
  return syntax;
}
var TEMPLATE_REFERENCES = createReferenceSyntax({
  name: "template",
  pattern: TEMPLATE_PATTERN,
  format: (path) => `\${${path}}`
});
var FORMULA_REFERENCES = createReferenceSyntax({
  name: "formula",
  pattern: FORMULA_PATTERN,
  format: (path) => `[${path}]`
});
var PARAMETER_REFERENCES = createReferenceSyntax({
  name: "parameter",
  pattern: PARAMETER_PATTERN,
  format: (name) => `{{${name}}}`,
  tone: "violet"
});
function findReferences(text, syntaxes = []) {
  const all = [];
  syntaxes.forEach((syntax, rank) => {
    for (const m of syntax?.find?.(text) || []) all.push({ ...m, syntax, rank });
  });
  all.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || a.rank - b.rank);
  const out = [];
  let end = -1;
  for (const m of all) {
    if (m.start < end) continue;
    out.push({ start: m.start, end: m.end, text: m.text, path: m.path, syntax: m.syntax });
    end = m.end;
  }
  return out;
}
function tokenize(text, syntaxes = []) {
  const parts = [];
  let at = 0;
  for (const m of findReferences(text, syntaxes)) {
    if (m.start > at) parts.push({ kind: "text", text: text.slice(at, m.start) });
    parts.push({ kind: "ref", text: m.text, match: m });
    at = m.end;
  }
  if (at < String(text ?? "").length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}
function describeReference(match, ctx = {}) {
  const d = typeof match?.syntax?.describe === "function" ? match.syntax.describe(match, ctx) : null;
  return {
    label: d?.label ?? match?.path ?? match?.text ?? "",
    tone: d?.tone ?? match?.syntax?.tone ?? null,
    known: d?.known !== false
  };
}
function resolveSyntaxes(names, references) {
  const map = references instanceof Map ? references : new Map(Object.entries(references || {}));
  return [].concat(names ?? []).map((n) => map.get(n)).filter(Boolean);
}

// src/flow/kit/chip_input.js
var MERGE_MS = 1e3;
var TAIL = "data-twm-tail";
function createChipInput({
  value = "",
  syntaxes = [],
  readOnly = false,
  onInput = null,
  multiline = false,
  placeholder = "",
  label = "",
  mono = false,
  describeContext = null
} = {}) {
  const host = el("div", `twm-flow-chipinput${mono ? " twm-flow-chipinput--mono" : ""}${multiline ? " twm-flow-chipinput--multiline" : ""}`);
  host.setAttribute("role", "textbox");
  host.setAttribute("aria-multiline", multiline ? "true" : "false");
  if (label) host.setAttribute("aria-label", label);
  if (placeholder) {
    host.dataset.placeholder = placeholder;
    host.setAttribute("aria-placeholder", placeholder);
  }
  host.spellcheck = false;
  let text = String(value ?? "");
  let ro = Boolean(readOnly);
  let composing = false;
  let lastCaret = null;
  let destroyed = false;
  let states = [{ text, caret: { start: text.length, end: text.length }, kind: "load", at: 0 }];
  let index = 0;
  let travelled = true;
  function chipFor(part) {
    const d = describeReference(part.match, describeContext || {});
    const chip = el("span", [
      "twm-flow-chip",
      toneClass("twm-flow-chip", d.tone || "blue"),
      d.known ? "" : "twm-flow-chip--unknown"
    ].filter(Boolean).join(" "), d.label);
    chip.contentEditable = "false";
    chip.setAttribute("contenteditable", "false");
    chip.setAttribute("draggable", "false");
    chip.dataset.ref = part.text;
    chip.title = part.text;
    if (part.match?.syntax?.name) chip.dataset.syntax = part.match.syntax.name;
    return chip;
  }
  function render() {
    const parts = tokenize(text, syntaxes);
    const nodes = parts.map((p) => p.kind === "ref" ? chipFor(p) : document.createTextNode(p.text));
    if (text.endsWith("\n")) {
      const br = document.createElement("br");
      br.setAttribute(TAIL, "");
      nodes.push(br);
    }
    host.replaceChildren(...nodes);
    paintEmpty();
  }
  function paintEmpty() {
    host.classList.toggle("twm-flow-chipinput--empty", text === "");
  }
  function setEditable() {
    host.setAttribute("contenteditable", ro ? "false" : "true");
    host.setAttribute("aria-readonly", ro ? "true" : "false");
    host.tabIndex = 0;
  }
  const chipOf = (node) => {
    const e = node?.nodeType === 1 ? node : node?.parentElement;
    const c = e?.closest?.("[data-ref]");
    return c && host.contains(c) ? c : null;
  };
  const isLine = (node) => node?.nodeType === 1 && (node.tagName === "DIV" || node.tagName === "P") && Boolean(node.previousSibling);
  function measure(node) {
    if (node.nodeType === 3) return node.data.length;
    if (node.nodeType !== 1) return 0;
    if (node.dataset?.ref !== void 0) return node.dataset.ref.length;
    if (node.tagName === "BR") return node.hasAttribute(TAIL) ? 0 : 1;
    let n = isLine(node) ? 1 : 0;
    for (const c of node.childNodes) n += measure(c);
    return n;
  }
  function serialiseNode(node) {
    if (node.nodeType === 3) return node.data;
    if (node.nodeType !== 1) return "";
    if (node.dataset?.ref !== void 0) return node.dataset.ref;
    if (node.tagName === "BR") return node.hasAttribute(TAIL) ? "" : "\n";
    let s = isLine(node) ? "\n" : "";
    for (const c of node.childNodes) s += serialiseNode(c);
    return s;
  }
  const read = () => [...host.childNodes].map(serialiseNode).join("");
  function offsetOf(container, offset, edge = "end") {
    if (!host.contains(container)) return null;
    const chip = chipOf(container);
    let node;
    let total = 0;
    if (chip) {
      node = chip;
      if (edge === "end") total += measure(chip);
    } else if (container.nodeType === 3) {
      total += offset;
      node = container;
    } else {
      const kids = container.childNodes;
      for (let i = 0; i < Math.min(offset, kids.length); i += 1) total += measure(kids[i]);
      if (container === host) return total;
      if (isLine(container)) total += 1;
      node = container;
    }
    while (node && node !== host) {
      for (let s = node.previousSibling; s; s = s.previousSibling) total += measure(s);
      const parent = node.parentNode;
      if (parent && parent !== host && isLine(parent)) total += 1;
      node = parent;
    }
    return total;
  }
  function locate(at) {
    let acc = 0;
    const kids = [...host.childNodes];
    for (let i = 0; i < kids.length; i += 1) {
      const k = kids[i];
      if (k.nodeType === 1 && k.hasAttribute(TAIL)) return { node: host, offset: i };
      const len = measure(k);
      if (k.nodeType === 3) {
        if (at <= acc + len) return { node: k, offset: Math.max(0, at - acc) };
      } else if (k.dataset?.ref !== void 0) {
        if (at <= acc) return { node: host, offset: i };
        if (at < acc + len) return { node: host, offset: i + 1 };
      } else if (at <= acc) {
        return { node: host, offset: i };
      }
      acc += len;
    }
    return { node: host, offset: kids.length };
  }
  function selectionOffsets() {
    const sel = host.ownerDocument.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (!host.contains(r.startContainer) || !host.contains(r.endContainer)) return null;
    const a = offsetOf(r.startContainer, r.startOffset, r.collapsed ? "end" : "start");
    const b = r.collapsed ? a : offsetOf(r.endContainer, r.endOffset, "end");
    if (a === null || b === null) return null;
    return { start: Math.min(a, b), end: Math.max(a, b) };
  }
  function placeCaret(start, end = start) {
    const len = text.length;
    const s = Math.max(0, Math.min(start, len));
    const e = Math.max(0, Math.min(end, len));
    const sel = host.ownerDocument.getSelection?.();
    if (!sel) return;
    const a = locate(s);
    const b = e === s ? a : locate(e);
    const range = host.ownerDocument.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    sel.removeAllRanges();
    sel.addRange(range);
    lastCaret = { start: s, end: e };
  }
  function drawnAsTokens() {
    const want = tokenize(text, syntaxes).map((p) => p.kind === "ref" ? `r${p.text}` : `t${p.text}`);
    const have = [];
    for (const k of host.childNodes) {
      if (k.nodeType === 3) {
        if (!k.data) continue;
        if (have.length && have[have.length - 1].startsWith("t")) have[have.length - 1] += k.data;
        else have.push(`t${k.data}`);
      } else if (k.nodeType === 1 && k.dataset?.ref !== void 0) {
        have.push(`r${k.dataset.ref}`);
      } else if (k.nodeType === 1 && k.hasAttribute(TAIL) && k === host.lastChild) {
        continue;
      } else {
        return false;
      }
    }
    const tail = host.lastChild?.nodeType === 1 && host.lastChild.hasAttribute(TAIL);
    if (text.endsWith("\n") !== Boolean(tail)) return false;
    return want.length === have.length && want.every((w, i) => w === have[i]);
  }
  function record(kind, caret) {
    const now = Date.now();
    const top = states[index];
    if (kind === "type" && top.kind === "type" && !travelled && now - top.at < MERGE_MS && index === states.length - 1) {
      states[index] = { text, caret, kind, at: now };
    } else {
      states = states.slice(0, index + 1);
      states.push({ text, caret, kind, at: now });
      index = states.length - 1;
    }
    travelled = false;
  }
  function changed(kind, caret) {
    record(kind, caret);
    onInput?.(text);
  }
  function replaceRange(start, end, insert, kind = "edit") {
    text = text.slice(0, start) + insert + text.slice(end);
    render();
    const at = start + insert.length;
    placeCaret(at);
    changed(kind, { start: at, end: at });
  }
  function travel(to) {
    if (to < 0 || to >= states.length) return false;
    index = to;
    travelled = true;
    text = states[index].text;
    render();
    const c = states[index].caret || { start: text.length, end: text.length };
    placeCaret(c.start, c.end);
    onInput?.(text);
    return true;
  }
  function handleInput() {
    if (destroyed || composing) return;
    const caret = selectionOffsets();
    const next = read();
    if (next === text) {
      if (!drawnAsTokens()) {
        render();
        if (caret) placeCaret(caret.start, caret.end);
      }
      return;
    }
    text = next;
    if (!drawnAsTokens()) {
      render();
      if (caret) placeCaret(caret.start, caret.end);
    } else {
      paintEmpty();
    }
    changed("type", caret || { start: text.length, end: text.length });
  }
  const chipEndingAt = (at) => findReferences(text, syntaxes).find((r) => r.end === at) || null;
  const chipStartingAt = (at) => findReferences(text, syntaxes).find((r) => r.start === at) || null;
  function onKeyDown(ev) {
    if (destroyed || ev.isComposing || composing || ev.keyCode === 229) return;
    const mod = (ev.ctrlKey || ev.metaKey) && !ev.altKey;
    const k = String(ev.key || "");
    if (mod && (k.toLowerCase() === "z" || k.toLowerCase() === "y")) {
      ev.preventDefault();
      if (ro) return;
      if (k.toLowerCase() === "y" || ev.shiftKey) travel(index + 1);
      else travel(index - 1);
      return;
    }
    if (mod && ["b", "i", "u"].includes(k.toLowerCase())) {
      ev.preventDefault();
      return;
    }
    if (ro) return;
    const sel = selectionOffsets();
    if (!sel) return;
    const collapsed = sel.start === sel.end;
    if (k === "Enter") {
      ev.preventDefault();
      if (multiline && !mod) replaceRange(sel.start, sel.end, "\n");
      return;
    }
    if (k === "Backspace" || k === "Delete") {
      if (!collapsed) {
        ev.preventDefault();
        replaceRange(sel.start, sel.end, "");
        return;
      }
      const chip = k === "Backspace" ? chipEndingAt(sel.start) : chipStartingAt(sel.start);
      if (chip) {
        ev.preventDefault();
        replaceRange(chip.start, chip.end, "");
      }
      return;
    }
    if ((k === "ArrowLeft" || k === "ArrowRight") && !ev.shiftKey && !mod && !ev.altKey && collapsed) {
      const chip = k === "ArrowLeft" ? chipEndingAt(sel.start) : chipStartingAt(sel.start);
      if (chip) {
        ev.preventDefault();
        placeCaret(k === "ArrowLeft" ? chip.start : chip.end);
      }
    }
  }
  function onBeforeInput(ev) {
    if (destroyed) return;
    const t = String(ev.inputType || "");
    if (t === "historyUndo" || t === "historyRedo") {
      ev.preventDefault();
      if (!ro) travel(t === "historyUndo" ? index - 1 : index + 1);
      return;
    }
    if (t.startsWith("format") || t === "insertFromDrop" || t === "deleteByDrag") {
      ev.preventDefault();
      return;
    }
    if ((t === "insertParagraph" || t === "insertLineBreak") && !composing) {
      ev.preventDefault();
      const sel = selectionOffsets();
      if (multiline && sel && !ro) replaceRange(sel.start, sel.end, "\n");
    }
  }
  function onPaste(ev) {
    if (destroyed) return;
    ev.preventDefault();
    if (ro) return;
    let pasted = ev.clipboardData?.getData?.("text/plain") ?? "";
    pasted = pasted.replace(/\r\n?/g, "\n");
    if (!multiline) pasted = pasted.replace(/\n+/g, " ");
    const sel = selectionOffsets() || { start: text.length, end: text.length };
    replaceRange(sel.start, sel.end, pasted, "paste");
  }
  function onCopy(ev, cut = false) {
    const sel = selectionOffsets();
    if (!sel || sel.start === sel.end) return;
    ev.preventDefault();
    ev.clipboardData?.setData?.("text/plain", text.slice(sel.start, sel.end));
    if (cut && !ro) replaceRange(sel.start, sel.end, "", "cut");
  }
  const onSelection = () => {
    const s = selectionOffsets();
    if (s) lastCaret = s;
  };
  host.addEventListener("keydown", onKeyDown);
  host.addEventListener("beforeinput", onBeforeInput);
  host.addEventListener("input", handleInput);
  host.addEventListener("paste", onPaste);
  host.addEventListener("copy", (ev) => onCopy(ev, false));
  host.addEventListener("cut", (ev) => onCopy(ev, true));
  host.addEventListener("drop", (ev) => ev.preventDefault());
  host.addEventListener("compositionstart", () => {
    composing = true;
  });
  host.addEventListener("compositionend", () => {
    composing = false;
    queueMicrotask(handleInput);
  });
  host.addEventListener("keyup", onSelection);
  host.addEventListener("mouseup", onSelection);
  host.addEventListener("blur", onSelection);
  const doc = host.ownerDocument;
  doc.addEventListener("selectionchange", onSelection);
  setEditable();
  render();
  return {
    el: host,
    getValue: () => text,
    /** Replace the text from outside (not an edit the reader made: no `onInput`). */
    setValue(next) {
      text = String(next ?? "");
      render();
      states = [{ text, caret: { start: text.length, end: text.length }, kind: "load", at: 0 }];
      index = 0;
      travelled = true;
    },
    /** Insert `snippet` where the caret is, or was when the field lost focus; else at the end. */
    insert(snippet) {
      if (ro) return;
      const sel = selectionOffsets() || lastCaret || { start: text.length, end: text.length };
      host.focus({ preventScroll: true });
      replaceRange(Math.min(sel.start, text.length), Math.min(sel.end, text.length), String(snippet), "insert");
    },
    focus() {
      host.focus({ preventScroll: true });
    },
    caret: () => selectionOffsets() || lastCaret,
    restoreCaret(c) {
      if (!c) return;
      host.focus({ preventScroll: true });
      placeCaret(c.start ?? 0, c.end ?? c.start ?? 0);
    },
    setReadOnly(next) {
      ro = Boolean(next);
      setEditable();
    },
    /** Redraw the chips (a consumer's `describe` learned something). */
    refresh() {
      const c = selectionOffsets();
      render();
      if (c) placeCaret(c.start, c.end);
    },
    get canUndo() {
      return index > 0;
    },
    get canRedo() {
      return index < states.length - 1;
    },
    destroy() {
      destroyed = true;
      doc.removeEventListener("selectionchange", onSelection);
    }
  };
}

// src/flow/kit/widgets.js
var shownValue = (v) => v === void 0 ? "" : typeof v === "string" ? v : JSON.stringify(v);
function typedValue(text, stored) {
  if (text === shownValue(stored) && stored !== void 0) return stored;
  if (stored === void 0 || typeof stored === "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
var clean = (v) => typeof v === "string" && v.trim() === "" ? void 0 : v;
function textBox(value, { type = "text", placeholder = "", label = "" } = {}) {
  const input = el("input", "twm-flow-input");
  input.type = type;
  input.value = value ?? "";
  if (placeholder) input.placeholder = placeholder;
  if (label) input.setAttribute("aria-label", label);
  return input;
}
function selectBox(options, value, { empty = null, label = "", notFound = (v) => `${v} (not found)` } = {}) {
  const box = el("select", "twm-flow-input twm-flow-input--select");
  if (label) box.setAttribute("aria-label", label);
  const values = [];
  if (empty !== null) {
    box.appendChild(new Option(empty, ""));
    values.push(void 0);
  }
  options.forEach((opt) => {
    const o = new Option(opt.label, String(values.length));
    if (opt.disabled) o.disabled = true;
    box.appendChild(o);
    values.push(opt.value);
  });
  const at = values.findIndex((v, i) => i >= (empty !== null ? 1 : 0) && v === value);
  if (value !== void 0 && value !== null && value !== "" && at < 0) {
    box.appendChild(new Option(notFound(shownValue(value)), String(values.length)));
    values.push(value);
    box.value = String(values.length - 1);
  } else {
    box.value = at >= 0 ? String(at) : empty !== null ? "" : "0";
  }
  return { box, valueOf: () => box.value === "" ? void 0 : values[Number(box.value)] };
}
function fitToText(area, maxLines = 12) {
  let width = -1;
  const fit = () => {
    if (!area.isConnected || !area.clientWidth) return;
    const style = getComputedStyle(area);
    const line = parseFloat(style.lineHeight) || 16;
    const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    area.style.height = "auto";
    const want = Math.min(area.scrollHeight, Math.ceil(line * maxLines + pad));
    area.style.height = `${want + border}px`;
  };
  area.addEventListener("input", fit);
  if (typeof ResizeObserver !== "function") return () => area.removeEventListener("input", fit);
  const watch = new ResizeObserver(() => {
    if (area.clientWidth === width) return;
    width = area.clientWidth;
    fit();
  });
  watch.observe(area);
  return () => {
    watch.disconnect();
    area.removeEventListener("input", fit);
  };
}
function rowList({ items, draw, blank, onChange, addLabel, removeLabel, readOnly }) {
  const root = el("div", "twm-flow-field__rows");
  root.setAttribute("role", "group");
  const list = items.map((it) => ({ ...it }));
  const cleanups = [];
  const paint = () => {
    cleanups.splice(0).forEach((f) => f());
    root.replaceChildren();
    list.forEach((item, idx) => {
      const row = el("div", "twm-flow-field__row");
      const drawn = draw(item, (next) => {
        list[idx] = next;
        onChange(list);
      });
      const parts = Array.isArray(drawn) ? drawn : drawn.parts;
      if (!Array.isArray(drawn) && drawn.destroy) cleanups.push(drawn.destroy);
      row.append(...parts);
      if (!readOnly) {
        row.appendChild(button({
          label: removeLabel(item, idx),
          icon: "close",
          iconOnly: true,
          className: "twm-flow-field__remove",
          onClick: () => {
            list.splice(idx, 1);
            onChange(list);
            paint();
          }
        }));
      }
      root.appendChild(row);
    });
    if (!readOnly) {
      root.appendChild(button({
        label: addLabel,
        icon: "add",
        className: "twm-flow-field__add",
        onClick: () => {
          list.push(blank());
          onChange(list);
          paint();
        }
      }));
    }
  };
  paint();
  return { el: root, destroy: () => cleanups.splice(0).forEach((f) => f()) };
}
function refBox(ctx, { value, multiline, mono, placeholder, label, onInput }) {
  const S = ctx.strings;
  const chip = createChipInput({
    value,
    syntaxes: ctx.references,
    readOnly: ctx.readOnly,
    multiline,
    mono,
    placeholder,
    label,
    describeContext: ctx.describeContext,
    onInput
  });
  const box = el("div", `twm-flow-refbox${mono ? " twm-flow-refbox--mono" : ""}`);
  box.appendChild(chip.el);
  if (ctx.openValuePicker && !ctx.readOnly) {
    const insert = el("button", "twm-flow-refbox__insert", say(S, "insertValueGlyph"));
    insert.type = "button";
    insert.setAttribute("aria-label", say(S, "insertValue"));
    insert.title = say(S, "insertValue");
    insert.setAttribute("aria-haspopup", "dialog");
    insert.addEventListener("click", () => ctx.openValuePicker({ anchor: insert, insert: (t) => chip.insert(t) }));
    box.appendChild(insert);
  }
  return { box, chip };
}
var placeholderOf = (spec, S) => spec["x-ui-placeholder"] ?? say(S, "textOrValue");
function templateWidget(spec, value, ctx) {
  const admits = admittedTypes(spec);
  const shown = value && typeof value === "object" ? JSON.stringify(value, null, 2) : value ?? "";
  const { box, chip } = refBox(ctx, {
    value: String(shown),
    multiline: true,
    placeholder: placeholderOf(spec, ctx.strings),
    label: ctx.label,
    onInput: (text) => {
      if (/^\s*[[{]/.test(text) && (admits.includes("array") || admits.includes("object"))) {
        try {
          const parsed = JSON.parse(text);
          const kind = Array.isArray(parsed) ? "array" : "object";
          if (parsed && typeof parsed === "object" && admits.includes(kind)) {
            ctx.set(parsed);
            return;
          }
        } catch {
        }
      }
      ctx.set(clean(text));
    }
  });
  return {
    el: box,
    focus: () => chip.focus(),
    caret: chip.caret,
    restoreCaret: chip.restoreCaret,
    destroy: chip.destroy
  };
}
function expressionWidget(spec, value, ctx) {
  const { box, chip } = refBox(ctx, {
    value: String(value ?? ""),
    multiline: true,
    mono: true,
    placeholder: spec["x-ui-placeholder"] ?? "",
    label: ctx.label,
    onInput: (text) => ctx.set(clean(text))
  });
  return {
    el: box,
    focus: () => chip.focus(),
    caret: chip.caret,
    restoreCaret: chip.restoreCaret,
    destroy: chip.destroy
  };
}
function jsonBodyWidget(spec, value, ctx) {
  const shown = value && typeof value === "object" ? JSON.stringify(value, null, 2) : value ?? "";
  const { box, chip } = refBox(ctx, {
    value: String(shown),
    multiline: true,
    mono: true,
    placeholder: spec["x-ui-placeholder"] ?? "",
    label: ctx.label,
    onInput: (text) => {
      if (/^\s*[[{]/.test(text)) {
        try {
          ctx.set(JSON.parse(text));
          return;
        } catch {
        }
      }
      ctx.set(clean(text));
    }
  });
  return {
    el: box,
    focus: () => chip.focus(),
    caret: chip.caret,
    restoreCaret: chip.restoreCaret,
    destroy: chip.destroy
  };
}
function keyValueMapWidget(spec, value, ctx) {
  const S = ctx.strings;
  const entries = Object.entries(value && typeof value === "object" && !Array.isArray(value) ? value : {}).map(([k, v]) => ({ k, v: shownValue(v), stored: v }));
  const emit = (list) => {
    const out = {};
    for (const { k, v, stored } of list) if (k) out[k] = typedValue(v ?? "", stored);
    ctx.set(Object.keys(out).length ? out : void 0);
  };
  const rows = rowList({
    items: entries,
    onChange: emit,
    readOnly: ctx.readOnly,
    addLabel: spec["x-ui-add-label"] ?? say(S, "add"),
    removeLabel: (item) => say(S, "removeNamed", item.k || say(S, "name").toLowerCase()),
    blank: () => ({ k: "", v: "" }),
    draw: (item, put) => {
      const key = textBox(item.k, { placeholder: say(S, "name"), label: say(S, "name") });
      key.disabled = Boolean(ctx.readOnly);
      key.addEventListener("input", () => put({ ...item, k: item.k = key.value }));
      const { box, chip } = refBox(ctx, {
        value: item.v,
        multiline: false,
        placeholder: say(S, "value"),
        label: say(S, "value"),
        onInput: (text) => put({ ...item, v: item.v = text })
      });
      return { parts: [key, box], destroy: chip.destroy };
    }
  });
  return { el: rows.el, destroy: rows.destroy };
}
function keyValueListWidget(spec, value, ctx) {
  const S = ctx.strings;
  const formulaSyntaxes = resolveSyntaxes(spec["x-ui-formula-references"] ?? ["formula"], ctx.referenceMap);
  const items = (Array.isArray(value) ? value : []).map((a) => ({
    variable: a?.variable ?? "",
    mode: a?.expression !== void 0 ? "expression" : "value",
    text: a?.expression ?? shownValue(a?.value),
    stored: a?.expression !== void 0 ? void 0 : a?.value
  }));
  const emit = (list) => {
    const out = list.filter((a) => a.variable).map((a) => a.mode === "expression" ? { variable: a.variable, expression: a.text } : { variable: a.variable, value: typedValue(a.text, a.stored) });
    ctx.set(out.length ? out : void 0);
  };
  const rows = rowList({
    items,
    onChange: emit,
    readOnly: ctx.readOnly,
    addLabel: spec["x-ui-add-label"] ?? say(S, "addAssignment"),
    removeLabel: (item) => say(S, "removeNamed", item.variable || say(S, "value").toLowerCase()),
    blank: () => ({ variable: "", mode: "value", text: "" }),
    draw: (item, put) => {
      const name = textBox(item.variable, { placeholder: say(S, "name"), label: say(S, "name") });
      name.disabled = Boolean(ctx.readOnly);
      name.addEventListener("input", () => put({ ...item, variable: item.variable = name.value }));
      const { box: mode, valueOf } = selectBox(
        [
          { value: "value", label: say(S, "value") },
          { value: "expression", label: say(S, "formula") }
        ],
        item.mode,
        { label: say(S, "value") }
      );
      mode.disabled = Boolean(ctx.readOnly);
      const slot = el("span", "twm-flow-field__slot");
      let chip = null;
      const drawText = () => {
        chip?.destroy();
        const sub = item.mode === "expression" ? { ...ctx, references: formulaSyntaxes } : ctx;
        const made = refBox(sub, {
          value: item.text,
          multiline: false,
          mono: item.mode === "expression",
          placeholder: item.mode === "expression" ? "" : say(S, "textOrValue"),
          label: say(S, "value"),
          onInput: (text) => put({ ...item, text: item.text = text })
        });
        chip = made.chip;
        slot.replaceChildren(made.box);
      };
      drawText();
      mode.addEventListener("change", () => {
        item.mode = valueOf();
        put({ ...item });
        drawText();
      });
      return { parts: [name, mode, slot], destroy: () => chip?.destroy() };
    }
  });
  return { el: rows.el, destroy: rows.destroy };
}
function stringListWidget(spec, value, ctx) {
  const S = ctx.strings;
  const items = (Array.isArray(value) ? value : []).map((s) => ({ s: String(s) }));
  const emit = (list) => {
    const out = list.map((x) => x.s).filter(Boolean);
    ctx.set(out.length ? out : void 0);
  };
  const rows = rowList({
    items,
    onChange: emit,
    readOnly: ctx.readOnly,
    addLabel: spec["x-ui-add-label"] ?? say(S, "add"),
    removeLabel: (item) => say(S, "removeNamed", item.s || say(S, "value").toLowerCase()),
    blank: () => ({ s: "" }),
    draw: (item, put) => {
      const box = textBox(item.s, { label: ctx.label, placeholder: spec["x-ui-placeholder"] ?? "" });
      box.disabled = Boolean(ctx.readOnly);
      box.addEventListener("input", () => put({ s: item.s = box.value }));
      return [box];
    }
  });
  return { el: rows.el, destroy: rows.destroy };
}
function toggleChips({ options, value, label, readOnly, onChange, notFound }) {
  const root = el("div", "twm-flow-togglechips");
  root.setAttribute("role", "group");
  if (label) root.setAttribute("aria-label", label);
  const known = options.map((o) => o.value);
  const chosen = new Set((Array.isArray(value) ? value : []).filter((v) => known.includes(v)));
  const strays = (Array.isArray(value) ? value : []).filter((v) => !known.includes(v));
  const emit = () => {
    const out = [...known.filter((v) => chosen.has(v)), ...strays];
    onChange(out.length ? out : void 0);
  };
  const chipFor = (text, pressed, toggle, stray = false) => {
    const b = el("button", `twm-flow-togglechip${stray ? " twm-flow-togglechip--missing" : ""}`, text);
    b.type = "button";
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.disabled = Boolean(readOnly);
    b.addEventListener("click", () => {
      const on = toggle();
      b.setAttribute("aria-pressed", on ? "true" : "false");
      emit();
    });
    return b;
  };
  for (const o of options) {
    root.appendChild(chipFor(o.label, chosen.has(o.value), () => {
      if (chosen.has(o.value)) chosen.delete(o.value);
      else chosen.add(o.value);
      return chosen.has(o.value);
    }));
  }
  for (const v of [...strays]) {
    const b = chipFor(notFound(shownValue(v)), true, () => {
      const i = strays.indexOf(v);
      if (i >= 0) {
        strays.splice(i, 1);
        return false;
      }
      strays.push(v);
      return true;
    }, true);
    root.appendChild(b);
  }
  return root;
}
function enumChipsWidget(spec, value, ctx) {
  const S = ctx.strings;
  const itemSpec = spec.items && typeof spec.items === "object" ? spec.items : {};
  const values = Array.isArray(itemSpec.enum) ? itemSpec.enum : Array.isArray(spec.enum) ? spec.enum : [];
  const words3 = (v) => itemSpec["x-ui-enum-labels"] ? enumLabel(itemSpec, v) : enumLabel(spec, v);
  return {
    el: toggleChips({
      options: values.map((v) => ({ value: v, label: words3(v) })),
      value,
      label: ctx.label,
      readOnly: ctx.readOnly,
      onChange: (v) => ctx.set(v),
      notFound: (v) => say(S, "notFound", v)
    })
  };
}
function choiceCardsWidget(spec, value, ctx) {
  const values = Array.isArray(spec.enum) ? spec.enum : [];
  const descriptions = spec["x-ui-enum-descriptions"] && typeof spec["x-ui-enum-descriptions"] === "object" ? spec["x-ui-enum-descriptions"] : {};
  const root = el("div", "twm-flow-choices");
  root.setAttribute("role", "radiogroup");
  if (ctx.label) root.setAttribute("aria-label", ctx.label);
  const name = uid("choice");
  const current = value !== void 0 ? value : spec.default;
  const radios = [];
  for (const v of values) {
    const row = el("label", "twm-flow-choice");
    const radio = el("input", "twm-flow-choice__radio");
    radio.type = "radio";
    radio.name = name;
    radio.checked = v === current;
    radio.disabled = Boolean(ctx.readOnly);
    radio.addEventListener("change", () => {
      if (radio.checked) ctx.set(v);
    });
    radios.push(radio);
    const words3 = el("span", "twm-flow-choice__words");
    words3.appendChild(el("span", "twm-flow-choice__label", enumLabel(spec, v)));
    if (descriptions[v] !== void 0) words3.appendChild(el("span", "twm-flow-choice__sub", descriptions[v]));
    row.append(radio, words3);
    root.appendChild(row);
  }
  if (current !== void 0 && !values.includes(current)) {
    root.appendChild(el("p", "twm-flow-field__note", say(ctx.strings, "notFound", shownValue(current))));
  }
  return { el: root, focus: () => (radios.find((r) => r.checked) || radios[0])?.focus({ preventScroll: true }) };
}
var columnWords = (c) => c.type ? `${c.name} \xB7 ${c.type}` : String(c.name);
function upstreamColumnWidget(spec, value, ctx) {
  const S = ctx.strings;
  const columns = ctx.columns?.();
  if (!Array.isArray(columns)) {
    const note = el("p", "twm-flow-field__note", say(S, "noColumns"));
    if (value !== void 0) note.appendChild(el("span", "twm-flow-field__kept", ` ${shownValue(value)}`));
    return { el: note };
  }
  const { box, valueOf } = selectBox(
    columns.map((c) => ({ value: String(c.name), label: columnWords(c) })),
    value,
    {
      empty: say(S, "choose"),
      label: ctx.label,
      notFound: (v) => say(S, "notFound", v)
    }
  );
  box.disabled = Boolean(ctx.readOnly);
  box.addEventListener("change", () => ctx.set(clean(valueOf())));
  return { el: box };
}
function upstreamColumnsWidget(spec, value, ctx) {
  const S = ctx.strings;
  const columns = ctx.columns?.();
  if (!Array.isArray(columns)) {
    const note = el("p", "twm-flow-field__note", say(S, "noColumns"));
    if (Array.isArray(value) && value.length) {
      note.appendChild(el("span", "twm-flow-field__kept", ` ${value.map(shownValue).join(", ")}`));
    }
    return { el: note };
  }
  return {
    el: toggleChips({
      options: columns.map((c) => ({ value: String(c.name), label: String(c.name) })),
      value,
      label: ctx.label,
      readOnly: ctx.readOnly,
      onChange: (v) => ctx.set(v),
      notFound: (v) => say(S, "notFound", v)
    })
  };
}
var GENERIC_WIDGETS = Object.freeze({
  template: templateWidget,
  expression: expressionWidget,
  "json-body": jsonBodyWidget,
  "key-value-map": keyValueMapWidget,
  "key-value-list": keyValueListWidget,
  "string-list": stringListWidget,
  "enum-chips": enumChipsWidget,
  "choice-cards": choiceCardsWidget,
  "upstream-column": upstreamColumnWidget,
  "upstream-columns": upstreamColumnsWidget
});
var DEFAULT_WIDGET_REFERENCES = Object.freeze({
  template: ["template"],
  expression: ["formula"],
  "json-body": ["template"],
  "key-value-map": ["template"],
  "key-value-list": ["template"]
});
function createWidgetRegistry() {
  const table = new Map(Object.entries(GENERIC_WIDGETS));
  return Object.freeze({
    register(name, widget, { replace = false } = {}) {
      if (typeof name !== "string" || !name) throw new Error("A widget needs a name.");
      if (typeof widget !== "function") throw new Error(`Widget "${name}" must be a function (spec, value, ctx).`);
      if (table.has(name) && !replace) {
        throw new Error(`A widget called "${name}" is already registered; pass {replace: true} to replace it.`);
      }
      table.set(name, widget);
    },
    has: (name) => table.has(name),
    get: (name) => table.get(name) ?? null,
    names: () => [...table.keys()]
  });
}
function plainControl(spec, value, ctx) {
  const S = ctx.strings;
  const type = primaryType(spec);
  if (Array.isArray(spec.enum)) {
    const { box, valueOf } = selectBox(spec.enum.map((v) => ({ value: v, label: enumLabel(spec, v) })), value, {
      empty: spec.default !== void 0 ? spec["x-ui-enum-labels"]?.[spec.default] ?? say(S, "defaultOption", shownValue(spec.default)) : say(S, "choose"),
      label: ctx.label,
      notFound: (v) => say(S, "notFound", v)
    });
    box.disabled = Boolean(ctx.readOnly);
    box.addEventListener("change", () => ctx.set(valueOf()));
    return { el: box };
  }
  if (type === "boolean") {
    const box = el("input", "twm-flow-checkbox");
    box.type = "checkbox";
    box.checked = value === void 0 ? Boolean(spec.default) : Boolean(value);
    box.disabled = Boolean(ctx.readOnly);
    if (ctx.label) box.setAttribute("aria-label", ctx.label);
    box.addEventListener("change", () => ctx.set(box.checked === Boolean(spec.default) ? void 0 : box.checked));
    return { el: box };
  }
  if (type === "integer" || type === "number") {
    const box = textBox(value ?? "", {
      type: "number",
      label: ctx.label,
      placeholder: spec["x-ui-placeholder"] ?? (spec.default !== void 0 ? String(spec.default) : "")
    });
    if (spec.minimum !== void 0) box.min = String(spec.minimum);
    if (spec.maximum !== void 0) box.max = String(spec.maximum);
    if (type === "integer") box.step = "1";
    box.disabled = Boolean(ctx.readOnly);
    box.addEventListener("input", () => {
      const n = box.value === "" ? void 0 : Number(box.value);
      ctx.set(Number.isFinite(n) ? n : void 0);
    });
    return { el: box };
  }
  if ((type === "string" || type === void 0) && spec["x-ui-multiline"]) {
    const area = el("textarea", "twm-flow-input twm-flow-input--area");
    area.value = value ?? "";
    area.rows = 3;
    area.placeholder = spec["x-ui-placeholder"] ?? "";
    if (ctx.label) area.setAttribute("aria-label", ctx.label);
    area.readOnly = Boolean(ctx.readOnly);
    const unfit = fitToText(area, 12);
    area.addEventListener("input", () => ctx.set(clean(area.value)));
    return { el: area, destroy: unfit };
  }
  if (type === "string" || type === void 0) {
    const box = textBox(value ?? "", { label: ctx.label, placeholder: spec["x-ui-placeholder"] ?? "" });
    box.readOnly = Boolean(ctx.readOnly);
    box.addEventListener("input", () => ctx.set(clean(box.value)));
    return { el: box };
  }
  return null;
}
function foldSummary(spec, value, S) {
  const parts = [];
  for (const f of fieldsFromSchema(spec)) {
    const v = value?.[f.key];
    if (v === void 0) continue;
    parts.push(`${titleOf(f.key, f.spec)} ${Array.isArray(f.spec.enum) ? enumLabel(f.spec, v) : shownValue(v)}`);
  }
  return parts.length ? parts.join(" \xB7 ") : say(S, "foldDefaults");
}
var focusable = (root) => root?.querySelector?.('select, input, textarea, button, [contenteditable="true"]') || null;
function renderField({ key, spec = {}, required = false }, value, ctx) {
  const S = ctx.strings || createStrings();
  const path = ctx.path ? `${ctx.path}.${key}` : String(key);
  const title = titleOf(key, spec);
  const root = el("div", "twm-flow-field");
  root.dataset.field = path;
  const labelId = uid("label");
  const errorId = uid("error");
  const helpId = uid("help");
  const labelCol = el("div", "twm-flow-field__label");
  const label = el("label", "twm-flow-field__name", title);
  label.id = labelId;
  labelCol.appendChild(label);
  if (required) {
    const mark = el("span", "twm-flow-field__required", say(S, "required"));
    mark.setAttribute("aria-label", say(S, "requiredLabel"));
    labelCol.appendChild(mark);
  }
  const body = el("div", "twm-flow-field__body");
  const error = el("p", "twm-flow-field__error");
  error.id = errorId;
  error.hidden = true;
  const children = [];
  let control = null;
  const widgetName = spec["x-ui-widget"];
  const syntaxNames = spec["x-ui-references"] ?? DEFAULT_WIDGET_REFERENCES[widgetName] ?? [];
  const sub = {
    key,
    path,
    step: ctx.step ?? null,
    type: ctx.type ?? null,
    readOnly: Boolean(ctx.readOnly),
    label: title,
    references: resolveSyntaxes(syntaxNames, ctx.referenceMap),
    referenceMap: ctx.referenceMap,
    openValuePicker: ctx.openValuePicker ? ({ anchor, insert }) => ctx.openValuePicker({ anchor, insert, path, key }) : null,
    columns: ctx.columns || (() => null),
    services: ctx.services,
    strings: S,
    describeContext: { ...ctx.describeContext || {}, field: path },
    set: (v, opts) => ctx.set(key, v, opts)
  };
  if (widgetName !== void 0) {
    const make = ctx.widgets?.get?.(widgetName);
    if (make) {
      try {
        control = make(spec, value, sub);
      } catch (err) {
        control = { el: el("p", "twm-flow-field__refusal", `${say(S, "noControl")} (${err?.message || err})`) };
      }
    } else {
      control = { el: el("p", "twm-flow-field__refusal", say(S, "unknownWidget", widgetName)) };
      root.dataset.refusal = widgetName;
    }
  } else if (primaryType(spec) === "object" && spec.properties && typeof spec.properties === "object") {
    const group = el("details", "twm-flow-field__group");
    group.open = !spec["x-ui-fold"];
    const summary = el("summary", "twm-flow-field__summary");
    summary.appendChild(el("span", "twm-flow-field__summary-text", foldSummary(spec, value, S)));
    group.appendChild(summary);
    const inner = { ...value && typeof value === "object" && !Array.isArray(value) ? value : {} };
    const innerFields = fieldsFromSchema(spec);
    const repaintSummary = () => {
      summary.firstChild.textContent = foldSummary(spec, inner, S);
    };
    for (const f of visibleFields(innerFields, inner)) {
      const child = renderField(f, inner[f.key], {
        ...ctx,
        path,
        set: (k, v, opts) => {
          if (v === void 0) delete inner[k];
          else inner[k] = v;
          repaintSummary();
          ctx.set(
            key,
            Object.keys(inner).length ? { ...inner } : void 0,
            { ...opts, reshape: opts?.reshape || whenKeys(innerFields).has(k) }
          );
        }
      });
      children.push(child);
      group.appendChild(child.el);
    }
    control = { el: group };
    root.classList.add("twm-flow-field--group");
  } else {
    control = plainControl(spec, value, sub) || { el: el("p", "twm-flow-field__refusal", say(S, "noControl")) };
  }
  const target = control.el.matches?.("input, select, textarea") ? control.el : null;
  const labelled = target ? null : control.el.matches?.('[role="textbox"], [role="group"], [role="radiogroup"]') ? control.el : control.el.classList?.contains("twm-flow-refbox") ? control.el.querySelector('[role="textbox"]') : null;
  if (target) {
    target.id ||= uid("control");
    label.htmlFor = target.id;
    target.removeAttribute("aria-label");
  } else if (labelled) {
    labelled.setAttribute("aria-labelledby", labelId);
    labelled.removeAttribute("aria-label");
  }
  const describedBy = [errorId];
  body.appendChild(control.el);
  body.appendChild(error);
  if (spec.description) {
    const help = el("p", "twm-flow-field__help", spec.description);
    help.id = helpId;
    body.appendChild(help);
    describedBy.push(helpId);
  }
  const described = target || labelled || control.el;
  described.setAttribute?.("aria-describedby", describedBy.join(" "));
  root.append(labelCol, body);
  return {
    el: root,
    key,
    path,
    control,
    setError(message, severity = "error") {
      error.replaceChildren();
      if (message) {
        const glyph = el(
          "span",
          "material-symbols-outlined twm-flow-field__error-icon",
          severity === "warning" ? "warning" : "error"
        );
        glyph.setAttribute("aria-hidden", "true");
        error.append(glyph, el("span", "twm-flow-field__error-text", message));
      }
      error.hidden = !message;
      root.classList.toggle("twm-flow-field--error", Boolean(message) && severity !== "warning");
      root.classList.toggle("twm-flow-field--warning", Boolean(message) && severity === "warning");
      described.setAttribute?.("aria-invalid", message && severity !== "warning" ? "true" : "false");
    },
    focus() {
      for (let d = root.parentElement?.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
      if (control.el.tagName === "DETAILS") control.el.open = true;
      if (typeof control.focus === "function") {
        control.focus();
        return true;
      }
      const f = target || focusable(control.el);
      if (f) {
        f.focus({ preventScroll: true });
        return true;
      }
      return false;
    },
    caret: () => typeof control.caret === "function" ? control.caret() : null,
    restoreCaret: (c) => control.restoreCaret?.(c),
    /** Every field path this field draws, its own and its children's. */
    paths: () => [path, ...children.flatMap((c) => c.paths())],
    /** The field (this one or a child) drawn for exactly `p`. */
    fieldAt(p) {
      if (p === path) return this;
      for (const c of children) {
        const hit = c.fieldAt(p);
        if (hit) return hit;
      }
      return null;
    },
    destroy() {
      control.destroy?.();
      children.forEach((c) => c.destroy());
    }
  };
}

// src/flow/kit/findings.js
function findingsList(input) {
  if (Array.isArray(input)) return input.filter((f) => f && typeof f === "object");
  if (input && typeof input === "object") {
    return [...input.errors || [], ...input.warnings || []].filter((f) => f && typeof f === "object");
  }
  return [];
}
function groupFindings(input, { graph = null } = {}) {
  const ids = graph ? new Set((graph.nodes || []).map((n) => n.id)) : null;
  const out = /* @__PURE__ */ new Map();
  for (const f of findingsList(input)) {
    let key = f.node_id ?? null;
    if (key !== null && ids && !ids.has(key)) key = null;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(f);
  }
  return out;
}
function isPathPrefix(prefix, path) {
  if (!prefix || !path) return false;
  if (path === prefix) return true;
  if (!path.startsWith(prefix)) return false;
  const next = path[prefix.length];
  return next === "." || next === "[";
}
function matchFindingField(paths, field) {
  if (!field) return null;
  let best = null;
  for (const p of paths) {
    if (isPathPrefix(p, field) && (best === null || p.length > best.length)) best = p;
  }
  return best;
}
function bySeverity(list) {
  return list.map((f, i) => ({ f, i })).sort((a, b) => (a.f.severity === "warning") - (b.f.severity === "warning") || a.i - b.i).map((x) => x.f);
}
function createFindingsStrip({ onGoTo = null, nameOf: nameOf2 = null, strings = null } = {}) {
  const S = createStrings(strings);
  const root = el("div", "twm-flow-strip");
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.hidden = true;
  let list = [];
  const paint = () => {
    root.replaceChildren();
    root.hidden = list.length === 0;
    if (!list.length) return;
    const errors = list.filter((f) => f.severity !== "warning").length;
    root.classList.toggle("twm-flow-strip--warning", errors === 0);
    const head = el("div", "twm-flow-strip__head");
    head.append(
      el("span", "twm-flow-strip__icon material-symbols-outlined", errors ? "error" : "warning"),
      el("span", "twm-flow-strip__title", errors ? say(S, "toFix", errors) : say(S, "toLookAt", list.length))
    );
    head.firstChild.setAttribute("aria-hidden", "true");
    root.appendChild(head);
    const lines = el("ul", "twm-flow-strip__list");
    for (const f of bySeverity(list)) {
      const li = el("li", `twm-flow-strip__line${f.severity === "warning" ? " twm-flow-strip__line--warning" : ""}`);
      li.dataset.code = String(f.code ?? "");
      if (f.node_id !== void 0 && f.node_id !== null) li.dataset.node = String(f.node_id);
      const where = f.node_id ? nameOf2?.(f.node_id) || String(f.node_id) : nameOf2?.(null) || "";
      li.appendChild(el("span", "twm-flow-strip__text", say(S, "findingLine", where, String(f.message ?? ""))));
      if (onGoTo) {
        li.appendChild(button({
          label: say(S, "goToIt"),
          className: "twm-flow-strip__go",
          onClick: () => onGoTo(f)
        }));
      }
      lines.appendChild(li);
    }
    root.appendChild(lines);
  };
  return {
    el: root,
    /** Draw `input` (a list or `{errors, warnings}`). */
    set(input) {
      list = findingsList(input);
      paint();
    },
    get findings() {
      return [...list];
    },
    destroy() {
      root.remove();
    }
  };
}

// src/flow/kit/value_picker.js
var words = (s) => String(s ?? "").toLowerCase();
function openValuePicker({
  anchor,
  groups = [],
  note = null,
  onPick = null,
  strings = null,
  title = null
} = {}) {
  const S = createStrings(strings);
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  let result = null;
  const trail = [];
  const root = el("div", "twm-flow-values");
  const headingId = uid("values-title");
  const heading = el("span", "twm-flow-values__title", title ?? say(S, "insertValue"));
  heading.id = headingId;
  const head = el("div", "twm-flow-values__head");
  head.appendChild(heading);
  const listId = uid("values-list");
  const searchRow = el("div", "twm-flow-values__search");
  searchRow.appendChild(icon("search", "twm-flow-values__search-icon"));
  const search = el("input", "twm-flow-values__input");
  search.type = "search";
  search.placeholder = say(S, "searchValues");
  search.setAttribute("aria-label", say(S, "searchValues"));
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-controls", listId);
  search.setAttribute("aria-expanded", "true");
  search.setAttribute("aria-autocomplete", "list");
  search.autocomplete = "off";
  searchRow.appendChild(search);
  head.appendChild(searchRow);
  root.appendChild(head);
  const crumb = el("div", "twm-flow-values__crumb");
  crumb.hidden = true;
  root.appendChild(crumb);
  const list = el("div", "twm-flow-values__list");
  list.id = listId;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-labelledby", headingId);
  root.appendChild(list);
  const foot = el("div", "twm-flow-values__foot");
  const inserts = el("span", "twm-flow-values__inserts");
  inserts.setAttribute("aria-live", "polite");
  if (note) foot.appendChild(el("span", "twm-flow-values__note", note));
  foot.appendChild(inserts);
  root.appendChild(foot);
  let active = null;
  let shown = [];
  function activate(opt) {
    active?.setAttribute("aria-selected", "false");
    active?.classList.remove("twm-flow-values__option--active");
    active = opt;
    const hit = shown.find((s) => s.opt === opt);
    if (opt) {
      opt.setAttribute("aria-selected", "true");
      opt.classList.add("twm-flow-values__option--active");
      search.setAttribute("aria-activedescendant", opt.id);
      opt.scrollIntoView?.({ block: "nearest" });
    } else {
      search.removeAttribute("aria-activedescendant");
    }
    inserts.textContent = hit && hit.item?.ref !== void 0 && !(hit.item.children?.length && !hit.whole && !search.value) ? say(S, "insertsLine", hit.item.ref) : "";
  }
  function option(item, { grid = false, whole = false, label = null } = {}) {
    const opens = !whole && Array.isArray(item.children) && item.children.length > 0;
    const opt = el("div", `twm-flow-values__option${grid ? " twm-flow-values__option--row" : " twm-flow-values__option--chip"}`);
    opt.id = uid("values-option");
    opt.setAttribute("role", "option");
    opt.setAttribute("aria-selected", "false");
    const text = label ?? (whole ? say(S, "wholeValue", item.label) : item.label);
    opt.appendChild(el("span", "twm-flow-values__label", opens && !search.value ? `${text} \u203A` : text));
    if (grid && item.type) opt.appendChild(el("span", "twm-flow-values__type", item.type));
    if (opens) opt.setAttribute("aria-haspopup", "listbox");
    opt.addEventListener("mousedown", (ev) => ev.preventDefault());
    opt.addEventListener("click", () => take(item, { whole }));
    opt.addEventListener("mousemove", () => {
      if (active !== opt) activate(opt);
    });
    shown.push({ opt, item, whole });
    return opt;
  }
  function matches(item, terms) {
    const hay = [item.label, item.type, item.ref].map(words).join(" ");
    return terms.every((t) => hay.includes(t));
  }
  function flatten(items, prefix = "") {
    const out = [];
    for (const it of items || []) {
      const label = prefix ? `${prefix} \u203A ${it.label}` : it.label;
      out.push({ item: it, label });
      if (Array.isArray(it.children)) out.push(...flatten(it.children, label));
    }
    return out;
  }
  function paint() {
    list.replaceChildren();
    shown = [];
    active = null;
    const terms = words(search.value).split(/\s+/).filter(Boolean);
    const level = trail[trail.length - 1] ?? null;
    crumb.hidden = !level;
    crumb.replaceChildren();
    if (level) {
      const back = el("button", "twm-flow-values__back");
      back.type = "button";
      back.appendChild(icon("chevron_left"));
      back.appendChild(el("span", "", say(S, "back")));
      back.addEventListener("mousedown", (ev) => ev.preventDefault());
      back.addEventListener("click", climb);
      crumb.append(back, el("span", "twm-flow-values__path", trail.map((t) => t.label).join(" \u203A ")));
      const box = el("div", "twm-flow-values__chips");
      if (!terms.length || matches(level, terms)) box.appendChild(option(level, { whole: true }));
      for (const it of level.children || []) {
        if (terms.length && !matches(it, terms)) continue;
        box.appendChild(option(it));
      }
      list.appendChild(box);
    } else {
      for (const g of groups) {
        const group = el("div", "twm-flow-values__group");
        group.setAttribute("role", "group");
        const gid = uid("values-group");
        const label = el("div", "twm-flow-values__group-label");
        label.id = gid;
        label.appendChild(el("span", "twm-flow-values__group-name", g.label ?? ""));
        if (g.sub) label.appendChild(el("span", "twm-flow-values__group-sub", g.sub));
        group.setAttribute("aria-labelledby", gid);
        const items = Array.isArray(g.items) ? g.items : [];
        const grid = g.layout === "grid";
        const box = el("div", grid ? "twm-flow-values__grid" : "twm-flow-values__chips");
        if (terms.length) {
          for (const { item, label: path } of flatten(items)) {
            if (matches(item, terms) || words(path).includes(terms.join(" "))) {
              box.appendChild(option(item, { grid, label: path }));
            }
          }
          if (!box.childNodes.length) continue;
        } else if (!items.length) {
          if (g.empty) label.appendChild(el("span", "twm-flow-values__group-empty", `\u2014 ${g.empty}`));
          group.appendChild(label);
          list.appendChild(group);
          continue;
        } else {
          for (const it of items) box.appendChild(option(it, { grid }));
        }
        group.append(label, box);
        list.appendChild(group);
      }
    }
    if (!shown.length) list.appendChild(el("p", "twm-flow-values__empty", terms.length ? say(S, "nothingMatches", search.value.trim()) : say(S, "noValues")));
    activate(nextOption(list, null, 1));
  }
  function take(item, { whole = false } = {}) {
    const opens = !whole && Array.isArray(item.children) && item.children.length > 0;
    if (opens && !search.value) {
      trail.push(item);
      paint();
      return;
    }
    result = item;
    onPick?.(item);
    handle.close("chosen");
  }
  function climb() {
    trail.pop();
    paint();
    search.focus({ preventScroll: true });
  }
  search.addEventListener("input", paint);
  search.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      activate(nextOption(list, active, ev.key === "ArrowDown" ? 1 : -1) || active);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const hit = shown.find((s) => s.opt === active);
      if (hit) take(hit.item, { whole: hit.whole });
    } else if (ev.key === "ArrowRight" && !search.value) {
      const hit = shown.find((s) => s.opt === active);
      if (hit && !hit.whole && hit.item.children?.length) {
        ev.preventDefault();
        take(hit.item);
      }
    } else if (ev.key === "Escape" && trail.length) {
      ev.preventDefault();
      ev.stopPropagation();
      climb();
    }
  });
  root.addEventListener("focusout", (ev) => {
    const to = ev.relatedTarget;
    if (to && !root.contains(to) && to !== anchor) handle.close("blur");
  });
  const handle = openPopover({
    anchor,
    content: root,
    label: title ?? say(S, "insertValue"),
    className: "twm-flow-popover--values",
    focus: search,
    onClose: () => settle(result)
  });
  if (handle.toggled) settle(null);
  else paint();
  done.close = () => handle.close("closed");
  return done;
}

// src/flow/kit/keys.js
var TEXT_INPUTS = /* @__PURE__ */ new Set(["", "text", "search", "url", "tel", "email", "password", "number"]);
var EDITABLE = '[contenteditable]:not([contenteditable="false"])';
function ownsUndo(target) {
  if (!target?.closest) return false;
  if (target.closest(`textarea, ${EDITABLE}, .monaco-editor`)) return true;
  const input = target.closest("input");
  return Boolean(input) && TEXT_INPUTS.has(String(input.getAttribute("type") || "").toLowerCase());
}
function isOwnControl(target) {
  const c = target?.closest?.('button, a[href], summary, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="radio"], [role="checkbox"]');
  return Boolean(c) && !c.closest("[data-twm-flow-item]");
}
function isTextField(target) {
  return Boolean(target?.closest?.(`input, textarea, select, ${EDITABLE}, .monaco-editor`));
}
function bindFlowKeys(root, handlers = {}) {
  const run = (name, ev) => {
    const h = handlers[name];
    if (typeof h !== "function") return false;
    if (h(ev) === false) return false;
    ev.preventDefault();
    return true;
  };
  const onKey = (ev) => {
    if (ev.isComposing || ev.keyCode === 229) return;
    const mod = (ev.ctrlKey || ev.metaKey) && !ev.altKey;
    const k = String(ev.key || "");
    const lower = k.toLowerCase();
    if (mod && (lower === "z" || lower === "y")) {
      ev.stopPropagation();
      if (ownsUndo(ev.target)) return;
      run(lower === "y" || ev.shiftKey ? "redo" : "undo", ev);
      return;
    }
    if (k === "Backspace") return;
    if (isTextField(ev.target)) return;
    if (ev.defaultPrevented) return;
    if (mod && !ev.shiftKey) {
      if (lower === "d") {
        run("duplicate", ev);
        return;
      }
      if (lower === "c") {
        run("copy", ev);
        return;
      }
      if (lower === "x") {
        run("cut", ev);
        return;
      }
      if (lower === "v") {
        run("paste", ev);
        return;
      }
      return;
    }
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey) {
      if (k === "ArrowUp") run("moveUp", ev);
      else if (k === "ArrowDown") run("moveDown", ev);
      else if (k === "ArrowLeft") run("moveOut", ev);
      return;
    }
    if (ev.ctrlKey || ev.metaKey) return;
    switch (k) {
      case "Delete":
        run("remove", ev);
        break;
      case "F2":
        run("rename", ev);
        break;
      case "ArrowUp":
        run("up", ev);
        break;
      case "ArrowDown":
        run("down", ev);
        break;
      case "ArrowLeft":
        run("left", ev);
        break;
      case "ArrowRight":
        run("right", ev);
        break;
      case "Enter":
        if (!ev.shiftKey && !isOwnControl(ev.target)) run("open", ev);
        break;
      case "Escape":
        run("escape", ev);
        break;
      default:
        break;
    }
  };
  root.addEventListener("keydown", onKey);
  return () => root.removeEventListener("keydown", onKey);
}

// src/flow/kit/settings_panel.js
var TITLE = "data-twm-flow-title";
function createSettingsPanel({
  widgets,
  references = {},
  strings = null,
  services = null,
  readOnly = false,
  onChange = null,
  onRename = null,
  onFocusLost = null,
  values = null,
  valuesNote = null,
  columns = null,
  host = null
} = {}) {
  if (!widgets?.get) throw new Error("createSettingsPanel needs a widget registry (createWidgetRegistry()).");
  const S = createStrings(strings);
  const root = el("section", "twm-flow-panel");
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", say(S, "settings"));
  if (host) host.appendChild(root);
  let ro = readOnly;
  let spec = null;
  let current = {};
  let fields = [];
  let allFields = [];
  let findings = [];
  let findingsBox = null;
  let slotBefore = null;
  let slotAfter = null;
  let destroyed = false;
  const stepId = () => spec?.step?.id ?? null;
  const isReadOnly = () => Boolean(ro);
  const readOnlyReason = () => ro && typeof ro === "object" && ro.reason ? String(ro.reason) : "";
  function pickerFor() {
    if (!values) return null;
    return async ({ anchor, insert, path, key }) => {
      const answer = await values({ stepId: stepId(), step: spec?.step ?? null, field: path, key });
      const groups = Array.isArray(answer) ? answer : answer?.groups || [];
      const note = Array.isArray(answer) ? valuesNote : answer?.note ?? valuesNote;
      if (destroyed || !anchor.isConnected) return;
      openValuePicker({ anchor, groups, note, strings: S, onPick: (item) => insert(item.ref) });
    };
  }
  function setValue(key, v, opts = {}) {
    if (v === void 0) delete current[key];
    else current[key] = v;
    onChange?.(stepId(), key, v);
    if (opts?.reshape || whenKeys(allFields).has(key)) repaint();
  }
  function fieldCtx() {
    return {
      widgets,
      referenceMap: references,
      strings: S,
      services,
      readOnly: isReadOnly(),
      step: spec?.step ?? null,
      type: spec?.type ?? null,
      path: "",
      openValuePicker: pickerFor(),
      columns: columns ? () => columns(spec?.step ?? null) : () => null,
      describeContext: { step: spec?.step ?? null, type: spec?.type ?? null, services },
      set: setValue
    };
  }
  function paintHeader() {
    const head = el("header", "twm-flow-panel__head");
    const chip = el("span", `twm-flow-panel__icon ${toneClass("twm-flow-panel__icon", spec.tone)}`);
    chip.appendChild(icon(spec.icon || ""));
    chip.setAttribute("aria-hidden", "true");
    const titles = el("div", "twm-flow-panel__titles");
    if (spec.typeLabel) titles.appendChild(el("span", "twm-flow-panel__type", spec.typeLabel));
    if (spec.rename && spec.step) {
      const input = el("input", "twm-flow-panel__title-input");
      input.type = "text";
      input.value = spec.title ?? "";
      input.placeholder = spec.placeholderTitle ?? spec.typeLabel ?? "";
      input.setAttribute("aria-label", say(S, "rename"));
      input.setAttribute(TITLE, "");
      input.readOnly = isReadOnly();
      input.addEventListener("input", () => {
        spec.title = input.value;
        onRename?.(stepId(), input.value);
      });
      titles.appendChild(input);
    } else {
      titles.appendChild(el("h3", "twm-flow-panel__title", spec.title ?? ""));
    }
    if (spec.where) titles.appendChild(el("span", "twm-flow-panel__where", spec.where));
    head.append(chip, titles);
    const acts = Array.isArray(spec.actions) ? spec.actions : [];
    if (acts.length) {
      const box = el("div", "twm-flow-panel__actions");
      for (const a of acts) {
        const refusal = isReadOnly() ? readOnlyReason() || say(S, "readOnly") : a.disabled ? a.reason || "" : "";
        const b = button({
          label: a.label,
          icon: a.icon || null,
          danger: Boolean(a.danger),
          primary: Boolean(a.primary),
          className: "twm-flow-panel__action",
          onClick: () => {
            if (!b.disabled) a.run?.();
          }
        });
        b.dataset.action = a.id ?? "";
        b.disabled = Boolean(isReadOnly() || a.disabled);
        const wrap = el("span", "twm-flow-panel__action-wrap");
        wrap.appendChild(b);
        if (b.disabled && refusal && !isReadOnly()) wrap.appendChild(el("span", "twm-flow-panel__refusal", refusal));
        box.appendChild(wrap);
      }
      head.appendChild(box);
    }
    return head;
  }
  function paintSlots() {
    for (const [box, name] of [[slotBefore, "before"], [slotAfter, "after"]]) {
      if (!box) continue;
      box.replaceChildren();
      const fn = spec?.slots?.[name];
      if (typeof fn === "function") fn(box);
      box.hidden = box.childNodes.length === 0;
    }
  }
  function paint() {
    for (const f of fields) f.destroy?.();
    fields = [];
    root.replaceChildren();
    if (!spec) return;
    if (isReadOnly() && readOnlyReason()) root.appendChild(el("p", "twm-flow-panel__readonly", readOnlyReason()));
    root.appendChild(paintHeader());
    if (spec.description) root.appendChild(el("p", "twm-flow-panel__description", spec.description));
    if (spec.idLine) root.appendChild(el("div", "twm-flow-panel__id", spec.idLine));
    findingsBox = el("ul", "twm-flow-panel__findings");
    findingsBox.hidden = true;
    root.appendChild(findingsBox);
    slotBefore = el("div", "twm-flow-panel__slot");
    slotBefore.dataset.slot = "before";
    root.appendChild(slotBefore);
    const list = el("div", "twm-flow-panel__fields");
    allFields = Array.isArray(spec.fields) ? spec.fields : fieldsFromSchema(spec.type?.config_schema);
    const drawn = visibleFields(allFields, current);
    const extra = Array.isArray(spec.extra) ? spec.extra : [];
    const placed = (e) => e.after ?? e.before ?? null;
    const extrasAt = (key, where) => extra.filter((e) => where === "after" ? e.after === key : e.before === key);
    const drawExtra = (e) => {
      if (e.note !== void 0) {
        list.appendChild(el("p", `twm-flow-panel__note${e.tone ? ` twm-flow-panel__note--${e.tone === "warning" ? "warning" : "info"}` : ""}`, e.note));
        return;
      }
      const f = renderField({ key: e.key, spec: e.spec || {}, required: Boolean(e.required) }, e.value, {
        ...fieldCtx(),
        set: (_k, v, opts) => {
          e.set?.(v, opts);
          if (opts?.reshape) repaint();
        }
      });
      f.el.dataset.extra = "";
      fields.push(f);
      list.appendChild(f.el);
    };
    for (const e of extra.filter((x) => x.at === "start")) drawExtra(e);
    for (const f of drawn) {
      for (const e of extrasAt(f.key, "before")) drawExtra(e);
      const field = renderField(f, current[f.key], fieldCtx());
      fields.push(field);
      list.appendChild(field.el);
      for (const e of extrasAt(f.key, "after")) drawExtra(e);
    }
    const keys = new Set(drawn.map((f) => f.key));
    for (const e of extra) {
      if (e.at === "start") continue;
      const anchor = placed(e);
      if (anchor === null || !keys.has(anchor)) drawExtra(e);
    }
    root.appendChild(list);
    slotAfter = el("div", "twm-flow-panel__slot");
    slotAfter.dataset.slot = "after";
    root.appendChild(slotAfter);
    paintSlots();
    applyFindings();
  }
  function heldFocus() {
    const active = root.ownerDocument.activeElement;
    if (!active || active === root || !root.contains(active)) return null;
    if (active.hasAttribute?.(TITLE)) {
      return { title: true, caret: { start: active.selectionStart, end: active.selectionEnd } };
    }
    const path = active.closest("[data-field]")?.dataset.field ?? null;
    const field = path ? fields.map((f) => f.fieldAt(path)).find(Boolean) : null;
    let caret = field?.caret?.() ?? null;
    if (!caret && ownsUndo(active) && active.matches?.("input, textarea")) {
      try {
        if (Number.isInteger(active.selectionStart)) {
          caret = { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection };
        }
      } catch {
      }
    }
    return { path, caret, tag: active.tagName };
  }
  function restoreFocus(held) {
    if (!held || destroyed || !root.isConnected) return;
    if (held.title) {
      const t = root.querySelector(`[${TITLE}]`);
      if (t) {
        t.focus({ preventScroll: true });
        try {
          t.setSelectionRange(held.caret.start, held.caret.end);
        } catch {
        }
        return;
      }
    }
    const field = held.path ? fields.map((f) => f.fieldAt(held.path)).find(Boolean) : null;
    if (field && field.focus()) {
      if (held.caret) {
        if (field.control?.restoreCaret) field.restoreCaret(held.caret);
        else {
          const box = root.ownerDocument.activeElement;
          try {
            const end = box.value.length;
            box.setSelectionRange(
              Math.min(held.caret.start, end),
              Math.min(held.caret.end, end),
              held.caret.direction || "none"
            );
          } catch {
          }
        }
      }
      return;
    }
    onFocusLost?.();
  }
  function repaint() {
    const held = heldFocus();
    paint();
    restoreFocus(held);
  }
  function applyFindings() {
    if (!spec || !findingsBox) return;
    const mine = findings.filter((f) => (f.node_id ?? null) === stepId());
    const paths = fields.flatMap((f) => f.paths());
    const byPath = /* @__PURE__ */ new Map();
    const loose = [];
    for (const f of mine) {
      const hit = matchFindingField(paths, f.field);
      if (hit) {
        if (!byPath.has(hit)) byPath.set(hit, []);
        byPath.get(hit).push(f);
      } else loose.push(f);
    }
    for (const field of fields) {
      for (const p of field.paths()) {
        const target = field.fieldAt(p);
        const list = byPath.get(p) || [];
        const errors = list.filter((f) => f.severity !== "warning");
        target.setError(list.map((f) => f.message).join(" "), errors.length ? "error" : "warning");
      }
    }
    findingsBox.replaceChildren();
    for (const f of loose) {
      const li = el("li", `twm-flow-panel__finding${f.severity === "warning" ? " twm-flow-panel__finding--warning" : ""}`);
      li.append(
        icon(f.severity === "warning" ? "warning" : "error", "twm-flow-panel__finding-icon"),
        el("span", "twm-flow-panel__finding-text", String(f.message ?? ""))
      );
      findingsBox.appendChild(li);
    }
    findingsBox.hidden = loose.length === 0;
  }
  return {
    el: root,
    /** Draw a step's (or, with no `step`, the flow's) settings. */
    show(next) {
      const sameStep = spec && next && (spec.step?.id ?? null) === (next.step?.id ?? null);
      const held = heldFocus();
      spec = { ...next };
      current = { ...next.value ?? next.step?.config ?? {} };
      paint();
      if (held && sameStep) restoreFocus(held);
      else if (held) onFocusLost?.();
    },
    /** Empty the panel. */
    clear() {
      const held = heldFocus();
      spec = null;
      current = {};
      paint();
      if (held) onFocusLost?.();
    },
    get stepId() {
      return stepId();
    },
    get value() {
      return { ...current };
    },
    setFindings(list) {
      findings = Array.isArray(list) ? list.filter((f) => f && typeof f === "object") : [...list?.errors || [], ...list?.warnings || []];
      applyFindings();
    },
    /** Focus the field a finding's `field` names (the longest prefix); false when none. */
    focusField(path) {
      const hit = matchFindingField(fields.flatMap((f) => f.paths()), path);
      const field = hit ? fields.map((f) => f.fieldAt(hit)).find(Boolean) : null;
      if (!field) return false;
      field.el.scrollIntoView?.({ block: "nearest" });
      return field.focus();
    },
    /** Redraw the consumer's slots only — no field is rebuilt. */
    repaintSlots() {
      paintSlots();
    },
    setReadOnly(next) {
      ro = next;
      repaint();
    },
    destroy() {
      destroyed = true;
      for (const f of fields) f.destroy?.();
      fields = [];
      root.remove();
    }
  };
}

// src/flow/kit/step_picker.js
var words2 = (s) => String(s ?? "").toLowerCase();
function openStepPicker({
  anchor,
  entries = [],
  categories = [],
  where = "",
  paste = null,
  strings = null,
  title = null
} = {}) {
  const S = createStrings(strings);
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  let result = null;
  const root = el("div", "twm-flow-picker");
  const headingId = uid("picker-title");
  const head = el("div", "twm-flow-picker__head");
  const heading = el("span", "twm-flow-picker__title", title ?? say(S, "addStep"));
  heading.id = headingId;
  head.appendChild(heading);
  if (where) head.appendChild(el("span", "twm-flow-picker__where", where));
  root.appendChild(head);
  const listId = uid("picker-list");
  const searchRow = el("div", "twm-flow-picker__search");
  searchRow.appendChild(icon("search", "twm-flow-picker__search-icon"));
  const search = el("input", "twm-flow-picker__input");
  search.type = "search";
  search.placeholder = say(S, "searchSteps");
  search.setAttribute("aria-label", say(S, "searchSteps"));
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-controls", listId);
  search.setAttribute("aria-expanded", "true");
  search.setAttribute("aria-autocomplete", "list");
  search.autocomplete = "off";
  searchRow.appendChild(search);
  root.appendChild(searchRow);
  const list = el("div", "twm-flow-picker__list");
  list.id = listId;
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-labelledby", headingId);
  root.appendChild(list);
  const empty = el("p", "twm-flow-picker__empty");
  empty.hidden = true;
  root.appendChild(empty);
  const order = (Array.isArray(categories) ? categories : []).map((c) => ({ ...c }));
  for (const e of entries) {
    const cat = e.category ?? "";
    if (!order.some((c) => String(c.id) === String(cat))) order.push({ id: cat, label: cat, layout: "list" });
  }
  const options = [];
  for (const cat of order) {
    const mine = entries.filter((e) => String(e.category ?? "") === String(cat.id));
    if (!mine.length) continue;
    const group = el("div", "twm-flow-picker__group");
    group.setAttribute("role", "group");
    const gid = uid("picker-group");
    const glabel = el("div", "twm-flow-picker__group-label", cat.label ?? "");
    glabel.id = gid;
    group.setAttribute("aria-labelledby", gid);
    const items = el("div", `twm-flow-picker__items${cat.layout === "grid" ? " twm-flow-picker__items--grid" : ""}`);
    for (const entry of mine) {
      const opt = el("div", `twm-flow-picker__option${entry.refusal ? " twm-flow-picker__option--refused" : ""}`);
      opt.id = uid("picker-option");
      opt.setAttribute("role", "option");
      opt.setAttribute("aria-selected", "false");
      if (entry.refusal) opt.setAttribute("aria-disabled", "true");
      opt.dataset.entry = String(entry.id);
      const chip = el("span", `twm-flow-picker__chip ${toneClass("twm-flow-picker__chip", entry.tone)}`);
      chip.appendChild(icon(entry.icon || ""));
      chip.setAttribute("aria-hidden", "true");
      const text = el("span", "twm-flow-picker__words");
      const line = el("span", "twm-flow-picker__label", entry.label ?? entry.id);
      if (entry.sub) line.appendChild(el("span", "twm-flow-picker__sub", ` ${entry.sub}`));
      text.appendChild(line);
      if (entry.description && cat.layout !== "grid") {
        text.appendChild(el("span", "twm-flow-picker__description", entry.description));
      }
      if (entry.refusal) text.appendChild(el("span", "twm-flow-picker__refusal", entry.refusal));
      opt.append(chip, text);
      opt.addEventListener("mousedown", (ev) => ev.preventDefault());
      opt.addEventListener("click", () => {
        if (entry.refusal) return;
        choose({ entry });
      });
      opt.addEventListener("mousemove", () => {
        if (!entry.refusal) activate(opt);
      });
      options.push({ opt, entry, group, haystack: [entry.label, entry.sub, entry.description, entry.id].map(words2).join(" ") });
      items.appendChild(opt);
    }
    group.append(glabel, items);
    list.appendChild(group);
  }
  const foot = el("div", "twm-flow-picker__foot");
  foot.appendChild(el("span", "twm-flow-picker__keys", say(S, "pickerKeys")));
  if (paste) {
    const p = el("button", "twm-flow-picker__paste", paste.label ?? say(S, "pasteStep"));
    p.type = "button";
    p.addEventListener("click", () => choose({ paste: true }));
    foot.appendChild(p);
  }
  root.appendChild(foot);
  let active = null;
  function activate(opt) {
    if (active === opt) return;
    active?.setAttribute("aria-selected", "false");
    active?.classList.remove("twm-flow-picker__option--active");
    active = opt;
    if (opt) {
      opt.setAttribute("aria-selected", "true");
      opt.classList.add("twm-flow-picker__option--active");
      search.setAttribute("aria-activedescendant", opt.id);
      opt.scrollIntoView?.({ block: "nearest" });
    } else {
      search.removeAttribute("aria-activedescendant");
    }
  }
  function filter() {
    const terms = words2(search.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const o of options) {
      const hit = terms.every((t) => o.haystack.includes(t));
      o.opt.hidden = !hit;
      if (hit) shown += 1;
    }
    for (const g of list.querySelectorAll(".twm-flow-picker__group")) {
      g.hidden = ![...g.querySelectorAll('[role="option"]')].some((o) => !o.hidden);
    }
    empty.hidden = shown > 0;
    empty.textContent = shown > 0 ? "" : say(S, "nothingMatches", search.value.trim());
    if (!active || active.hidden) activate(nextOption(list, null, 1));
  }
  function choose(value) {
    result = value;
    handle.close("chosen");
  }
  search.addEventListener("input", filter);
  search.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      activate(nextOption(list, active, ev.key === "ArrowDown" ? 1 : -1) || active);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const hit = options.find((o) => o.opt === active);
      if (hit && !hit.entry.refusal) choose({ entry: hit.entry });
    } else if ((ev.ctrlKey || ev.metaKey) && String(ev.key).toLowerCase() === "v" && paste && !search.value) {
      ev.preventDefault();
      choose({ paste: true });
    }
  });
  root.addEventListener("focusout", (ev) => {
    const to = ev.relatedTarget;
    if (to && !root.contains(to) && to !== anchor) handle.close("blur");
  });
  const handle = openPopover({
    anchor,
    content: root,
    label: title ?? say(S, "addStep"),
    className: "twm-flow-popover--picker",
    focus: search,
    onClose: () => settle(result)
  });
  if (handle.toggled) settle(null);
  else filter();
  done.close = () => handle.close("closed");
  return done;
}

// src/flow/kit/always_before.js
var DEFAULT_LOOP_PORTS = Object.freeze({ entry: "in", next: "next", body: "body", done: "done" });
var defaultWaitsForAll = (node) => (node?.config?.join ?? "all") !== "any";
function isFlowPort(catalogue, typeId, name, direction) {
  const port = catalogue?.port ? catalogue.port(typeId, name, direction) : null;
  return port ? (port.port_type || "FLOW") === "FLOW" : true;
}
function flowStructure(graph, catalogue, { loopPorts = DEFAULT_LOOP_PORTS, kindOf = null } = {}) {
  const ports = { ...DEFAULT_LOOP_PORTS, ...loopPorts };
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const role = typeof kindOf === "function" ? (id) => kindOf(byId.get(id)?.type) : (id) => catalogue?.role ? catalogue.role(byId.get(id)?.type) : "step";
  const succ = new Map(nodes.map((n) => [n.id, []]));
  const pred = new Map(nodes.map((n) => [n.id, []]));
  const returns = [];
  for (const c of Array.isArray(graph?.connections) ? graph.connections : []) {
    const from = byId.get(c.source);
    const to = byId.get(c.target);
    if (!from || !to) continue;
    if (!isFlowPort(catalogue, from.type, c.sourcePort, "output") || !isFlowPort(catalogue, to.type, c.targetPort, "input")) continue;
    if (role(c.target) === "loop" && c.targetPort !== ports.entry) {
      returns.push(c);
      continue;
    }
    succ.get(c.source).push({ id: c.target, port: c.sourcePort });
    pred.get(c.target).push({ id: c.source, port: c.sourcePort });
  }
  return { nodes, byId, role, succ, pred, returns, ports };
}
function reach(roots, succ, stop = null) {
  const seen = /* @__PURE__ */ new Set();
  const queue = [...roots].filter((r) => r !== stop);
  for (const r of queue) seen.add(r);
  while (queue.length) {
    const id = queue.shift();
    for (const s of succ.get(id) || []) {
      if (s.id === stop || seen.has(s.id)) continue;
      seen.add(s.id);
      queue.push(s.id);
    }
  }
  return seen;
}
function dominators(roots, succ, pred) {
  const live = reach(roots, succ);
  const rootSet = new Set(roots);
  const order = [...live];
  const dom = /* @__PURE__ */ new Map();
  for (const id of order) dom.set(id, rootSet.has(id) ? /* @__PURE__ */ new Set([id]) : new Set(order));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of order) {
      if (rootSet.has(id)) continue;
      let acc = null;
      for (const p of pred.get(id) || []) {
        if (!live.has(p.id)) continue;
        const d = dom.get(p.id);
        acc = acc === null ? new Set(d) : new Set([...acc].filter((x) => d.has(x)));
      }
      const next = new Set(acc ?? []);
      next.add(id);
      const cur = dom.get(id);
      if (next.size !== cur.size || [...next].some((x) => !cur.has(x))) {
        dom.set(id, next);
        changed = true;
      }
    }
  }
  return dom;
}
function bodyOf(structure, loopId) {
  const starts = (structure.succ.get(loopId) || []).filter((s) => s.port === structure.ports.body).map((s) => s.id);
  return reach(starts, structure.succ, loopId);
}
function loopBodies(structure) {
  const out = /* @__PURE__ */ new Map();
  for (const n of structure.nodes) {
    if (structure.role(n.id) === "loop") out.set(n.id, bodyOf(structure, n.id));
  }
  return out;
}
function rootsOf(st) {
  const roots = st.nodes.filter((n) => st.role(n.id) === "start").map((n) => n.id);
  return roots.length ? roots : st.nodes.filter((n) => !(st.pred.get(n.id) || []).length).map((n) => n.id);
}
function alwaysBefore(graph, catalogue, stepId, {
  loopPorts = DEFAULT_LOOP_PORTS,
  waitsForAll = defaultWaitsForAll
} = {}) {
  const st = flowStructure(graph, catalogue, { loopPorts });
  if (!st.byId.has(stepId)) return [];
  const dom = dominators(rootsOf(st), st.succ, st.pred);
  if (!dom.has(stepId)) return [];
  const nearestFanout = (id, domMap) => {
    const mine = domMap.get(id);
    if (!mine) return null;
    let best = null;
    for (const d of mine) {
      if (d === id || st.role(d) !== "fanout") continue;
      if (best === null || domMap.get(d).size > domMap.get(best).size) best = d;
    }
    return best;
  };
  const branchMemo = /* @__PURE__ */ new Map();
  const branchSteps = (joinId, domMap) => {
    if (branchMemo.has(joinId)) return branchMemo.get(joinId);
    branchMemo.set(joinId, /* @__PURE__ */ new Set());
    const out = /* @__PURE__ */ new Set();
    const fan = nearestFanout(joinId, domMap);
    if (fan !== null && waitsForAll(st.byId.get(joinId))) {
      for (const s of st.succ.get(fan) || []) {
        if (s.id === joinId) continue;
        const sub = dominators([s.id], st.succ, st.pred);
        const onEvery = sub.get(joinId);
        if (!onEvery) continue;
        for (const x of onEvery) {
          if (x === joinId) continue;
          out.add(x);
          if (st.role(x) === "join") for (const y of branchSteps(x, sub)) out.add(y);
        }
      }
    }
    branchMemo.set(joinId, out);
    return out;
  };
  const before = new Set([...dom.get(stepId)].filter((x) => x !== stepId));
  for (const j of [...before, stepId]) {
    if (st.role(j) === "join") {
      for (const x of branchSteps(j, dom)) if (x !== stepId) before.add(x);
    }
  }
  for (const [, body] of loopBodies(st)) {
    if (body.has(stepId)) continue;
    for (const b of body) before.delete(b);
  }
  const dist = /* @__PURE__ */ new Map([[stepId, 0]]);
  const queue = [stepId];
  while (queue.length) {
    const id = queue.shift();
    for (const p of st.pred.get(id) || []) {
      if (dist.has(p.id)) continue;
      dist.set(p.id, dist.get(id) + 1);
      queue.push(p.id);
    }
  }
  const index = new Map(st.nodes.map((n, i) => [n.id, i]));
  return [...before].sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity) || index.get(a) - index.get(b));
}
function enclosingLoops(graph, catalogue, stepId, { loopPorts = DEFAULT_LOOP_PORTS } = {}) {
  const st = flowStructure(graph, catalogue, { loopPorts });
  const around = [];
  for (const [loopId, body] of loopBodies(st)) {
    if (body.has(stepId)) around.push({ loopId, size: body.size });
  }
  return around.sort((a, b) => a.size - b.size).map((x) => x.loopId);
}
function enclosingArms(graph, catalogue, stepId, {
  loopPorts = DEFAULT_LOOP_PORTS,
  continuePort = null,
  kindOf = null
} = {}) {
  const st = flowStructure(graph, catalogue, { loopPorts, kindOf });
  if (!st.byId.has(stepId)) return [];
  const flowOutputs = (typeId) => (catalogue?.outputs ? catalogue.outputs(typeId, { flow: true }) : []).map((p) => p.name);
  const cont = (node) => {
    if (typeof continuePort === "function") return continuePort(node);
    if (typeof continuePort === "string") return continuePort;
    const outs = flowOutputs(node?.type);
    return outs.includes("out") ? "out" : outs[0] ?? "out";
  };
  const isArm = (headId, port) => {
    const r = st.role(headId);
    if (r === "branch" || r === "fanout") return true;
    if (r === "loop") return port !== st.ports.done;
    return port !== cont(st.byId.get(headId));
  };
  const LINE = "\0line:";
  const succ = /* @__PURE__ */ new Map();
  const pred = /* @__PURE__ */ new Map();
  const lines = /* @__PURE__ */ new Map();
  for (const n of st.nodes) {
    succ.set(n.id, []);
    pred.set(n.id, []);
  }
  for (const n of st.nodes) {
    for (const s of st.succ.get(n.id) || []) {
      const key = `${LINE}${lines.size}`;
      lines.set(key, { head: n.id, port: s.port });
      succ.set(key, [{ id: s.id }]);
      pred.set(key, [{ id: n.id }]);
      succ.get(n.id).push({ id: key });
      pred.get(s.id).push({ id: key });
    }
  }
  const dom = dominators(rootsOf(st), succ, pred);
  const mine = dom.get(stepId);
  if (!mine) return [];
  const out = [];
  for (const key of mine) {
    const line = lines.get(key);
    if (!line || !isArm(line.head, line.port)) continue;
    const chain = [...mine].filter((x) => !lines.has(x) && dom.get(x).has(key)).sort((a, b) => dom.get(a).size - dom.get(b).size);
    let depth = 0;
    let past = false;
    for (const x of chain) {
      const r = st.role(x);
      if (r === "join") {
        if (depth === 0) {
          past = true;
          break;
        }
        depth -= 1;
      } else if (r === "fanout" && x !== stepId) depth += 1;
    }
    if (past || out.some((a) => a.head === line.head && a.port === line.port)) continue;
    out.push({ head: line.head, port: line.port, depth: dom.get(key).size });
  }
  return out.sort((a, b) => b.depth - a.depth).map(({ head, port }) => ({ head, port }));
}

// src/flow/kit/history.js
var FlowHistory = class {
  /**
   * @param {object} options
   * @param {readonly string[]} options.actions  the edits this editor records — anything else throws
   * @param {(state: string) => void} options.restore  puts a snapshot back
   * @param {() => void} [options.onState]  after every change to the stacks
   * @param {number} [options.limit]  entries kept; the oldest goes first
   * @param {number} [options.mergeMs]  how close two keyed commits must be
   * @param {() => number} [options.now]  the clock, for a test
   */
  constructor({ actions, restore, onState = null, limit = 100, mergeMs = 1e3, now = () => Date.now() } = {}) {
    if (!Array.isArray(actions) || actions.length === 0 || !actions.every((a) => typeof a === "string")) {
      throw new Error("FlowHistory needs its editor's closed list of actions: an edit nobody named must fail rather than fold itself into the next entry.");
    }
    if (typeof restore !== "function") {
      throw new Error("FlowHistory needs a restore(state) function: undo has nothing to put back without one.");
    }
    this.actions = Object.freeze([...actions]);
    this._restore = restore;
    this._onState = onState;
    this._limit = limit;
    this._mergeMs = mergeMs;
    this._now = now;
    this._undo = [];
    this._redo = [];
    this._settled = null;
    this._travelled = true;
    this.applying = false;
  }
  get canUndo() {
    return this._undo.length > 0;
  }
  get canRedo() {
    return this._redo.length > 0;
  }
  get depth() {
    return this._undo.length;
  }
  /** The state the stacks describe the present as. */
  get settled() {
    return this._settled;
  }
  /** The action the next undo would undo, or null. */
  get undoAction() {
    return this._undo[this._undo.length - 1]?.action ?? null;
  }
  /** The action the next redo would redo, or null. */
  get redoAction() {
    return this._redo[this._redo.length - 1]?.action ?? null;
  }
  /** The hydration gate: `state` is where history starts, and nothing before it is undoable. */
  baseline(state) {
    this._undo = [];
    this._redo = [];
    this._settled = state;
    this._travelled = true;
    this._changed();
  }
  /**
   * Record that the flow is now `state`, by `action`. A no-op when nothing
   * changed or while a restore is being applied. Returns whether the stacks moved.
   */
  commit(state, action, key = null) {
    if (!this.actions.includes(action)) {
      throw new Error(`"${action}" is not an edit this editor records (its actions are ${this.actions.join(", ")}).`);
    }
    if (this.applying || state === this._settled) return false;
    const at = this._now();
    const top = this._undo[this._undo.length - 1];
    if (key !== null && top && top.key === key && !this._travelled && at - top.at < this._mergeMs) {
      top.at = at;
      if (top.before === state) this._undo.pop();
    } else {
      this._undo.push({ action, key, at, before: this._settled });
      if (this._undo.length > this._limit) this._undo.shift();
    }
    this._redo = [];
    this._settled = state;
    this._travelled = false;
    this._changed();
    return true;
  }
  undo() {
    const entry = this._undo.pop();
    if (!entry) return false;
    this._redo.push({ action: entry.action, after: this._settled });
    this._travel(entry.before);
    return true;
  }
  redo() {
    const entry = this._redo.pop();
    if (!entry) return false;
    this._undo.push({ action: entry.action, key: null, at: 0, before: this._settled });
    this._travel(entry.after);
    return true;
  }
  /** The stacks, to be handed back to a successor through `adopt`. */
  keep() {
    return {
      undo: this._undo.map((e) => ({ ...e })),
      redo: this._redo.map((e) => ({ ...e })),
      settled: this._settled
    };
  }
  /** Take `kept`'s stacks when they were settled on exactly `state`. */
  adopt(kept, state) {
    if (!kept || typeof kept.settled !== "string" || kept.settled !== state) return false;
    this._undo = (kept.undo || []).map((e) => ({ ...e }));
    this._redo = (kept.redo || []).map((e) => ({ ...e }));
    this._settled = state;
    this._travelled = true;
    this._changed();
    return true;
  }
  _travel(state) {
    this._settled = state;
    this._travelled = true;
    this.applying = true;
    try {
      this._restore(state);
    } finally {
      this.applying = false;
    }
    this._changed();
  }
  _changed() {
    this._onState?.();
  }
};

// src/flow/kit/logic_graph.js
var ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
var LOGIC_GRAPH_STRINGS = Object.freeze({
  connectSelf: "A step cannot connect to itself.",
  connectMissing: "Both ends must be steps in this flow.",
  connectNoOutput: (port) => `This step has no output called ${port}.`,
  connectNoInput: (port) => `That step has no input called ${port}.`,
  connectNotFlow: (how) => how ? `Only flow ports connect; a data port is read as ${how}.` : "Only flow ports connect; a data port is read, not connected.",
  connectTwice: "These two are already connected.",
  connectOneLine: (port) => `The ${port} port takes one connection; use a step that runs several branches.`
});
function emptyGraph() {
  return { nodes: [], connections: [] };
}
function normalise(graph) {
  const g = graph && typeof graph === "object" ? graph : emptyGraph();
  return {
    nodes: (Array.isArray(g.nodes) ? g.nodes : []).map((n) => ({
      id: String(n.id),
      type: String(n.type),
      ...n.label ? { label: String(n.label) } : {},
      config: n.config && typeof n.config === "object" ? structuredClone(n.config) : {},
      position: { x: Math.round(Number(n.position?.x) || 0), y: Math.round(Number(n.position?.y) || 0) }
    })),
    connections: (Array.isArray(g.connections) ? g.connections : []).map((c) => ({
      source: String(c.source),
      target: String(c.target),
      sourcePort: String(c.sourcePort || "out"),
      targetPort: String(c.targetPort || "in")
    }))
  };
}
function sortedKeys(value) {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortedKeys(value[k])]));
  }
  return value;
}
function serialise(graph) {
  const g = normalise(graph);
  return JSON.stringify({
    nodes: g.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      ...n.label ? { label: n.label } : {},
      config: sortedKeys(n.config),
      position: n.position
    })),
    connections: g.connections.map((c) => ({
      source: c.source,
      target: c.target,
      sourcePort: c.sourcePort,
      targetPort: c.targetPort
    }))
  });
}
function nextId(graph, typeId, { catalogue = null } = {}) {
  const base = catalogue?.idBase ? catalogue.idBase(typeId) : String(typeId || "step").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40) || "step";
  const taken = new Set((graph?.nodes || []).map((n) => n.id));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i += 1) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }
}
function addNode(graph, typeId, position = null, {
  id = null,
  label = null,
  config = null,
  catalogue = null
} = {}) {
  const nid = id && ID_OK.test(id) && !graph.nodes.some((n) => n.id === id) ? id : nextId(graph, typeId, { catalogue });
  const node = {
    id: nid,
    type: typeId,
    ...label ? { label } : {},
    config: config && typeof config === "object" ? structuredClone(config) : {},
    position: { x: Math.round(position?.x || 0), y: Math.round(position?.y || 0) }
  };
  graph.nodes.push(node);
  return node;
}
function removeNode(graph, nodeId) {
  graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
  graph.connections = graph.connections.filter((c) => c.source !== nodeId && c.target !== nodeId);
}
function moveNode(graph, nodeId, position) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (node) node.position = { x: Math.round(position.x), y: Math.round(position.y) };
}
var sameEdge = (a, b) => a.source === b.source && a.target === b.target && a.sourcePort === b.sourcePort && a.targetPort === b.targetPort;
function portOf(catalogue, node, name, direction) {
  if (!node) return null;
  if (catalogue?.port) return catalogue.port(node.type, name, direction);
  const def = catalogue?.get?.(node.type);
  return def?.ports?.find((p) => p.name === name && p.direction === direction) || null;
}
function canConnect(graph, catalogue, { source, sourcePort, target, targetPort }, { strings = null, dataRead = null } = {}) {
  const S = createStrings(LOGIC_GRAPH_STRINGS, strings);
  if (source === target) return { ok: false, reason: S.connectSelf };
  const from = graph.nodes.find((n) => n.id === source);
  const to = graph.nodes.find((n) => n.id === target);
  if (!from || !to) return { ok: false, reason: S.connectMissing };
  const out = portOf(catalogue, from, sourcePort, "output");
  const inp = portOf(catalogue, to, targetPort, "input");
  if (!out) return { ok: false, reason: S.connectNoOutput(sourcePort) };
  if (!inp) return { ok: false, reason: S.connectNoInput(targetPort) };
  if ((out.port_type || "FLOW") !== "FLOW" || (inp.port_type || "FLOW") !== "FLOW") {
    return { ok: false, reason: S.connectNotFlow(dataRead) };
  }
  if (graph.connections.some((c) => c.source === source && c.sourcePort === sourcePort && c.target === target && c.targetPort === targetPort)) {
    return { ok: false, reason: S.connectTwice };
  }
  if (!out.multiple && graph.connections.some((c) => c.source === source && c.sourcePort === sourcePort)) {
    return { ok: false, reason: S.connectOneLine(out.label || sourcePort) };
  }
  return { ok: true };
}
function connect(graph, catalogue, edge, options = {}) {
  const verdict = canConnect(graph, catalogue, edge, options);
  if (verdict.ok) {
    graph.connections.push({
      source: edge.source,
      target: edge.target,
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort
    });
  }
  return verdict;
}
function disconnect(graph, edge) {
  graph.connections = graph.connections.filter((c) => !sameEdge(c, edge));
}
function inputNamesOf(graph, syntax, scope) {
  const names = /* @__PURE__ */ new Set();
  const prefix = `${scope}.`;
  const walk = (value) => {
    if (typeof value === "string") {
      for (const m of syntax.find(value)) {
        if (!m.path.startsWith(prefix)) continue;
        const rest = m.path.slice(prefix.length);
        const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)?.[0];
        if (name) names.add(name);
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  for (const n of graph?.nodes || []) walk(n.config);
  return [...names];
}

// src/flow/canvas_editor/strings.js
var CANVAS_STRINGS = Object.freeze({
  palette: "Steps",
  canvasLabel: "Flow canvas",
  toolbarLabel: "Flow",
  arrange: "Arrange",
  arrangeTitle: "Lay the steps out left to right, in the order a run takes them",
  fit: "Fit",
  fitTitle: "Show the whole flow",
  nothingToUndo: "There is nothing to undo.",
  nothingToRedo: "There is nothing to redo.",
  arrangeNeedsTwo: "Arrange needs two steps or more.",
  readOnlyRefusal: "This flow is read only.",
  connectFrom: "Click, then click the input to connect to",
  connectTo: "Connect an output here",
  connectStarted: "Now click the input to connect to. Esc cancels.",
  connectFirst: "Click an output first, then this input.",
  dataPort: (how) => how ? `Read it in a later step as ${how}` : "A data port: it is read, not connected.",
  dropHere: "Drop a step on the canvas to add it.",
  returnLine: "Back to the loop for its next pass",
  connectedReturn: "Goes round the loop again.",
  unknownType: (type) => `There is no step type "${type}".`,
  stepId: (id) => `Step id: ${id}`,
  connection: "Connection",
  connectionLine: (e) => `${e.source} \xB7 ${e.sourcePort} \u2192 ${e.target} \xB7 ${e.targetPort}`,
  removeConnection: "Remove connection",
  portCount: (n) => `\xD7${n}`,
  portNotTaken: "not taken"
});

// src/flow/canvas_editor/layout.js
var CANVAS_NODE = Object.freeze({ width: 208, header: 34, row: 22 });
var FOOT = 12;
var inputsOf = (catalogue, node) => catalogue?.inputs ? catalogue.inputs(node?.type) : [];
var outputsOf = (catalogue, node) => catalogue?.outputs ? catalogue.outputs(node?.type) : [];
var roleOf = (catalogue, node) => catalogue?.role ? catalogue.role(node?.type) : "step";
function portAnchor(catalogue, node, portName, direction, box = CANVAS_NODE) {
  const list = direction === "input" ? inputsOf(catalogue, node) : outputsOf(catalogue, node);
  const i = Math.max(0, list.findIndex((p) => p.name === portName));
  return {
    x: node.position.x + (direction === "input" ? 0 : box.width),
    y: node.position.y + box.header + box.row * i + box.row / 2,
    side: direction === "input" ? "left" : "right"
  };
}
function nodeBottom(catalogue, node, box = CANVAS_NODE) {
  const rows = Math.max(inputsOf(catalogue, node).length, outputsOf(catalogue, node).length, 1);
  return node.position.y + box.header + box.row * rows + FOOT;
}
function isReturnEdge(connection, target, catalogue, loopEntry = "in") {
  return Boolean(target) && roleOf(catalogue, target) === "loop" && connection.targetPort !== loopEntry;
}
function layoutGraph(graph, catalogue, {
  width = CANVAS_NODE.width,
  header = CANVAS_NODE.header,
  row = CANVAS_NODE.row,
  gap = 96,
  rowGap = 40,
  loopEntry = "in"
} = {}) {
  const nodes = graph?.nodes || [];
  const connections = graph?.connections || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const portOrder = (n, port) => {
    const outs = outputsOf(catalogue, n);
    const i = outs.findIndex((p) => p.name === port);
    return i < 0 ? outs.length : i;
  };
  const isReturn = (c) => isReturnEdge(c, byId.get(c.target), catalogue, loopEntry);
  const order = /* @__PURE__ */ new Map();
  const queue = nodes.filter((n) => roleOf(catalogue, n) === "start").map((n) => n.id);
  for (const id of queue) order.set(id, order.size);
  while (queue.length) {
    const id = queue.shift();
    const out = connections.map((c, i) => ({ c, i })).filter(({ c }) => c.source === id && byId.has(c.target) && !isReturn(c)).sort((a, b) => portOrder(byId.get(id), a.c.sourcePort) - portOrder(byId.get(id), b.c.sourcePort) || a.i - b.i);
    for (const { c } of out) {
      if (!order.has(c.target)) {
        order.set(c.target, order.size);
        queue.push(c.target);
      }
    }
  }
  for (const n of nodes) if (!order.has(n.id)) order.set(n.id, order.size);
  const rows = (n) => Math.max(inputsOf(catalogue, n).length, outputsOf(catalogue, n).length);
  return arrange(
    nodes.map((n) => ({
      id: n.id,
      label: String(order.get(n.id)).padStart(6, "0"),
      height: header + row * rows(n) + 24
    })),
    connections.filter((c) => !isReturn(c)).map((c) => ({ from: c.target, to: c.source })),
    { columnGap: width + gap, rowGap }
  );
}

// src/flow/canvas_editor/editor.js
var CANVAS_ACTIONS = Object.freeze([
  "flow:node:add",
  "flow:node:remove",
  "flow:node:move",
  "flow:edge:connect",
  "flow:edge:disconnect",
  "flow:node:label",
  "flow:node:config",
  "flow:settings",
  "flow:arrange"
]);
var NATURAL = 1;
var READABLE = 0.8;
var DRAG_PX = 4;
var RETURN_DROP = 40;
var SVG = "http://www.w3.org/2000/svg";
var DEFAULT_REFERENCES = Object.freeze({
  template: TEMPLATE_REFERENCES,
  formula: FORMULA_REFERENCES,
  parameter: PARAMETER_REFERENCES
});
function sortedKeys2(value) {
  if (Array.isArray(value)) return value.map(sortedKeys2);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortedKeys2(value[k])]));
  }
  return value;
}
var plainObject = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
function createCanvasEditor(host, options = {}) {
  const {
    widgets = createWidgetRegistry(),
    references = DEFAULT_REFERENCES,
    values = null,
    valuesNote = null,
    summarise = null,
    summariseReads = null,
    flowSettings = null,
    readOnly = false,
    actions = [],
    slots = {},
    strings = null,
    services = null,
    onChange = null,
    onSelect = null,
    history: historyOptions = {},
    loop = {},
    node: nodeOptions = {},
    dataPortRead = null,
    removable = null,
    paletteTypes = null,
    label = null,
    gridSize = 16,
    waitsForAll = void 0
  } = options;
  const catalogue = Array.isArray(options.catalogue) ? createStepCatalogue(options.catalogue) : options.catalogue;
  if (!catalogue?.get || !catalogue?.byCategory) {
    throw new Error("createCanvasEditor needs a step catalogue (createStepCatalogue(types, \u2026)).");
  }
  const S = createStrings(CANVAS_STRINGS, strings);
  const BOX = Object.freeze({
    width: Number(nodeOptions.width) || CANVAS_NODE.width,
    header: Number(nodeOptions.header) || CANVAS_NODE.header,
    row: Number(nodeOptions.row) || CANVAS_NODE.row
  });
  const loopPorts = Object.freeze({ ...DEFAULT_LOOP_PORTS, ...plainObject(loop) });
  const canRemove = typeof removable === "function" ? removable : (_node, type) => (type?.role || "step") !== "start";
  const offered = typeof paletteTypes === "function" ? paletteTypes : (type) => type.role !== "start";
  const root = el("div", "twm-flow-graph");
  if (BOX.width !== CANVAS_NODE.width) root.style.setProperty("--twm-canvas-node-width", `${BOX.width}px`);
  if (BOX.header !== CANVAS_NODE.header) root.style.setProperty("--twm-canvas-node-header", `${BOX.header}px`);
  if (BOX.row !== CANVAS_NODE.row) root.style.setProperty("--twm-canvas-node-row", `${BOX.row}px`);
  const toolbar = el("div", "twm-flow-graph__toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", say(S, "toolbarLabel"));
  const status = el("span", "twm-flow-graph__status");
  const toolbarEnd = el("span", "twm-flow-graph__toolbar-end");
  const why = el("p", "twm-flow-graph__why");
  const readonlyBanner = el("p", "twm-flow-graph__readonly");
  readonlyBanner.hidden = true;
  const message = el("p", "twm-flow-graph__message");
  message.setAttribute("aria-live", "polite");
  const banner = el("p", "twm-flow-graph__banner");
  banner.hidden = true;
  const body = el("div", "twm-flow-graph__body");
  const palette = el("nav", "twm-flow-graph__palette");
  palette.setAttribute("aria-label", say(S, "palette"));
  const canvasHost = el("div", "twm-flow-graph__canvas");
  const aside = el("aside", "twm-flow-graph__aside");
  const connectionBox = el("section", "twm-flow-graph__connection");
  connectionBox.hidden = true;
  body.append(palette, canvasHost, aside);
  let graph = emptyGraph();
  let settingsSchema = flowSettings?.schema ?? null;
  let settingsTitle = flowSettings?.title ?? null;
  let settingsValue = structuredClone(plainObject(flowSettings?.value));
  let ro = readOnly;
  let findings = [];
  let findingsBy = /* @__PURE__ */ new Map();
  let overlay = null;
  let selected = null;
  let connecting = null;
  let suppressClick = false;
  let dragCleanup = null;
  let destroyed = false;
  let fitFrame = null;
  let travelling = null;
  let lastSelect = "";
  const nodeEls = /* @__PURE__ */ new Map();
  const consumerState = /* @__PURE__ */ new Map();
  const canvas = new CanvasAdapter({ container: canvasHost, gridSize });
  canvas.root.setAttribute("role", "application");
  canvas.root.setAttribute("aria-label", label || say(S, "canvasLabel"));
  canvas.onSelectionChange = () => {
    if (connecting) cancelConnect();
    if (selected && selected.kind !== "flow") select(null);
  };
  const isReadOnly = () => Boolean(ro);
  const readOnlyReason = () => ro && typeof ro === "object" && ro.reason ? String(ro.reason) : "";
  const nodeOf = (id) => graph.nodes.find((x) => x.id === id) || null;
  const typeOf = (n) => catalogue.get(n?.type);
  const snapshot = () => JSON.stringify({ graph: JSON.parse(serialise(graph)), flowSettings: sortedKeys2(settingsValue) });
  const history = new FlowHistory({
    actions: CANVAS_ACTIONS,
    restore: (state) => restore(state),
    onState: () => paintToolbar(),
    limit: historyOptions.limit ?? 100,
    mergeMs: historyOptions.mergeMs ?? 1e3,
    now: historyOptions.now
  });
  function emitChange(action, key, via = null) {
    if (!onChange || destroyed) return;
    const text = snapshot();
    onChange({ graph: normalise(graph), flowSettings: structuredClone(settingsValue), text, action, key, via });
  }
  function commit(action, key = null) {
    if (history.commit(snapshot(), action, key)) emitChange(action, key);
    paintToolbar();
  }
  function restore(state) {
    const p = JSON.parse(state);
    graph = normalise(p.graph);
    settingsValue = plainObject(p.flowSettings);
    if (connecting) cancelConnect();
    if (selected?.kind === "node" && !nodeOf(selected.id)) selected = null;
    if (selected?.kind === "edge" && !graph.connections.some((c) => sameEdge(c, selected.edge))) selected = null;
    findingsBy = groupFindings(findings, { graph });
    paintNodes();
    paintPanel();
    keepFocus();
    emitChange(null, null, travelling);
    announceSelection();
  }
  function keepFocus() {
    if (destroyed || !root.isConnected) return;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) canvas.root.focus({ preventScroll: true });
  }
  function setMessage(line, tone = null) {
    message.textContent = line || "";
    message.className = "twm-flow-graph__message" + (tone ? ` twm-flow-graph__message--${tone === "ok" ? "ok" : "warning"}` : "");
  }
  const tool = (id, opts) => {
    const b = button(opts);
    b.dataset.action = id;
    b.classList.add("twm-flow-graph__tool");
    b.dataset.tip = opts.title || "";
    return b;
  };
  const tools = {
    undo: tool("undo", { label: say(S, "undo"), icon: "undo", title: say(S, "undoTitle"), onClick: () => undo() }),
    redo: tool("redo", { label: say(S, "redo"), icon: "redo", title: say(S, "redoTitle"), onClick: () => redo() }),
    arrange: tool("arrange", {
      label: say(S, "arrange"),
      icon: "account_tree",
      title: say(S, "arrangeTitle"),
      onClick: () => arrangeGraph()
    }),
    fit: tool("fit", {
      label: say(S, "fit"),
      icon: "fit_screen",
      title: say(S, "fitTitle"),
      onClick: () => fit({ whole: true })
    })
  };
  const own = new Set(Object.keys(tools));
  const consumerTools = [];
  for (const a of Array.isArray(actions) ? actions : []) {
    if (!a || !a.id || own.has(a.id)) continue;
    const b = tool(a.id, {
      label: a.label ?? a.id,
      icon: a.icon || null,
      primary: Boolean(a.primary),
      danger: Boolean(a.danger),
      title: a.title || null,
      onClick: () => {
        if (!b.disabled) a.run?.(api);
      }
    });
    consumerTools.push({ spec: a, el: b });
  }
  toolbar.append(
    tools.undo,
    tools.redo,
    tools.arrange,
    tools.fit,
    ...consumerTools.map((t) => t.el),
    status,
    toolbarEnd
  );
  if (typeof slots.toolbarEnd === "function") slots.toolbarEnd(toolbarEnd);
  function refusals() {
    const stop = isReadOnly() ? readOnlyReason() || say(S, "readOnlyRefusal") : null;
    return {
      undo: stop || (history.canUndo ? null : say(S, "nothingToUndo")),
      redo: stop || (history.canRedo ? null : say(S, "nothingToRedo")),
      arrange: stop || (graph.nodes.length < 2 ? say(S, "arrangeNeedsTwo") : null),
      fit: null
    };
  }
  function refuse(control, sentence) {
    control.disabled = Boolean(sentence);
    control.title = sentence || control.dataset.tip || "";
    if (sentence) control.dataset.refusal = sentence;
    else delete control.dataset.refusal;
  }
  function paintToolbar() {
    if (destroyed) return;
    const r = refusals();
    for (const id of Object.keys(tools)) {
      const extra = consumerState.get(id);
      refuse(tools[id], r[id] || (extra?.disabled ? extra.reason || "" : null) || null);
      if (extra?.disabled && !r[id] && !extra.reason) tools[id].disabled = true;
    }
    const said = [];
    for (const { spec, el: b } of consumerTools) {
      const state = consumerState.get(spec.id) || {};
      const reason = state.disabled ? state.reason || "" : "";
      refuse(b, reason || null);
      if (state.disabled && !reason) b.disabled = true;
      b.classList.toggle("twm-flow-graph__tool--busy", Boolean(state.busy));
      if (state.busy) b.setAttribute("aria-busy", "true");
      else b.removeAttribute("aria-busy");
      if (reason && !said.includes(reason)) said.push(reason);
    }
    why.textContent = said.join(" \xB7 ");
    why.hidden = said.length === 0;
  }
  function undo() {
    if (refusals().undo) return false;
    if (connecting) {
      cancelConnect();
      setMessage("");
    }
    travelling = "undo";
    try {
      return history.undo();
    } finally {
      travelling = null;
    }
  }
  function redo() {
    if (refusals().redo) return false;
    if (connecting) {
      cancelConnect();
      setMessage("");
    }
    travelling = "redo";
    try {
      return history.redo();
    } finally {
      travelling = null;
    }
  }
  function paintPalette() {
    palette.replaceChildren(el("h3", "twm-flow-graph__palette-title", say(S, "palette")));
    for (const { category, types } of catalogue.byCategory()) {
      const list = types.filter((t) => offered(t));
      if (!list.length) continue;
      if (category.label) palette.appendChild(el("h4", "twm-flow-graph__palette-group", category.label));
      for (const t of list) {
        const item = el("button", "twm-flow-graph__palette-item");
        item.type = "button";
        item.dataset.type = t.type_id;
        const chip = el("span", `twm-flow-graph__palette-icon ${toneClass("twm-flow-graph__palette-icon", category.tone)}`);
        chip.appendChild(icon(t.icon || "widgets"));
        item.append(chip, el("span", "twm-flow-graph__palette-label", t.label));
        item.title = t.description ? `${t.label} \u2014 ${t.description}` : t.label;
        if (t.unavailable) {
          item.disabled = true;
          item.dataset.refusal = String(t.unavailable);
          palette.append(item, el("p", "twm-flow-graph__palette-why", String(t.unavailable)));
          continue;
        }
        item.disabled = isReadOnly();
        item.addEventListener("pointerdown", (ev) => startPaletteDrag(ev, t));
        item.addEventListener("click", () => {
          if (suppressClick || isReadOnly()) return;
          addStep(t.type_id);
        });
        palette.appendChild(item);
      }
    }
  }
  function addStep(typeId, at = null) {
    if (isReadOnly()) return null;
    const n = graph.nodes.length;
    let where = at;
    if (!where) {
      const box = canvas.visibleBox();
      where = {
        x: canvas.snap((box.width ? box.x + box.width / 2 - BOX.width / 2 : 80) + n % 4 * 24),
        y: canvas.snap((box.height ? box.y + box.height / 3 : 80) + n % 4 * 24)
      };
    }
    const added = addNode(graph, typeId, where, { catalogue });
    selected = { kind: "node", id: added.id };
    paintNodes();
    paintPanel();
    announceSelection();
    commit("flow:node:add");
    return added;
  }
  function overCanvas(x, y) {
    const r = canvas.root.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function swallowNextClick({ afterRelease = false } = {}) {
    suppressClick = true;
    const clear = () => setTimeout(() => {
      suppressClick = false;
    }, 0);
    if (afterRelease) clear();
    else window.addEventListener("pointerup", clear, { once: true, capture: true });
  }
  function startPaletteDrag(ev, t) {
    if (ev.button !== 0 || ev.isPrimary === false || isReadOnly()) return;
    dragCleanup?.();
    const start = { x: ev.clientX, y: ev.clientY };
    let ghost = null;
    const onMove = (m) => {
      if (!ghost) {
        if (Math.abs(m.clientX - start.x) + Math.abs(m.clientY - start.y) < DRAG_PX) return;
        ghost = el("div", "twm-flow-graph__ghost");
        ghost.append(icon(t.icon || "widgets"), el("span", "twm-flow-graph__ghost-label", t.label));
        document.body.appendChild(ghost);
      }
      ghost.style.left = `${m.clientX + 8}px`;
      ghost.style.top = `${m.clientY + 8}px`;
      canvasHost.classList.toggle("twm-flow-graph__canvas--drop", overCanvas(m.clientX, m.clientY));
    };
    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      ghost?.remove();
      canvasHost.classList.remove("twm-flow-graph__canvas--drop");
      dragCleanup = null;
    };
    function onUp(u) {
      const dragged = Boolean(ghost);
      finish();
      if (!dragged) return;
      swallowNextClick({ afterRelease: true });
      if (!overCanvas(u.clientX, u.clientY)) {
        setMessage(say(S, "dropHere"));
        return;
      }
      const p = canvas.clientToCanvas(u.clientX, u.clientY);
      addStep(t.type_id, { x: canvas.snap(p.x - BOX.width / 2), y: canvas.snap(p.y - BOX.header / 2) });
    }
    function onCancel() {
      finish();
    }
    function onKey(k) {
      if (k.key !== "Escape") return;
      k.preventDefault();
      k.stopPropagation();
      const dragged = Boolean(ghost);
      finish();
      if (dragged) swallowNextClick();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    dragCleanup = finish;
  }
  const anchor = (n, port2, direction) => portAnchor(catalogue, n, port2, direction, BOX);
  const bottomOf = (n) => nodeBottom(catalogue, n, BOX);
  const isReturn = (c, target) => isReturnEdge(c, target, catalogue, loopPorts.entry);
  function buildNode(nodeRow) {
    const def = typeOf(nodeRow);
    const tone = catalogue.tone(nodeRow.type);
    const n = el("div", "twm-flow-graph__node");
    n.dataset.nodeId = nodeRow.id;
    n.setAttribute("data-twm-flow-item", "");
    n.setAttribute("role", "group");
    n.tabIndex = 0;
    const header = el("div", "twm-flow-graph__node-head");
    const chip = el("span", `twm-flow-graph__node-icon ${toneClass("twm-flow-graph__node-icon", tone)}`);
    chip.appendChild(icon(def?.icon || "widgets"));
    const name = nodeRow.label || def?.label || nodeRow.type;
    n.setAttribute("aria-label", name);
    const title = el("span", "twm-flow-graph__node-title", name);
    title.title = name;
    const tag = el("span", "twm-flow-graph__node-tag", nodeRow.id);
    tag.title = say(S, "stepId", nodeRow.id);
    header.append(chip, title, tag);
    header.addEventListener("pointerdown", (ev) => startMove(ev, nodeRow.id));
    n.appendChild(header);
    const inputs = catalogue.inputs(nodeRow.type);
    const outputs = catalogue.outputs(nodeRow.type);
    const rows = Math.max(inputs.length, outputs.length);
    for (let i = 0; i < rows; i += 1) {
      const row = el("div", "twm-flow-graph__node-row");
      row.append(
        inputs[i] ? port(nodeRow, inputs[i]) : el("span", "twm-flow-graph__node-gap"),
        outputs[i] ? port(nodeRow, outputs[i]) : el("span", "twm-flow-graph__node-gap")
      );
      n.appendChild(row);
    }
    if (!def) n.appendChild(el("p", "twm-flow-graph__node-finding", say(S, "unknownType", nodeRow.type)));
    if (typeof summarise === "function") n.appendChild(el("p", "twm-flow-graph__node-summary"));
    const notes = el("div", "twm-flow-graph__node-findings");
    const runLine = el("p", "twm-flow-graph__node-run");
    n.append(notes, runLine);
    n.addEventListener("click", (ev) => {
      if (ev.target.closest(".twm-flow-graph__port")) return;
      if (!(selected?.kind === "node" && selected.id === nodeRow.id)) select({ kind: "node", id: nodeRow.id });
    });
    n.addEventListener("focus", () => {
      if (!(selected?.kind === "node" && selected.id === nodeRow.id)) select({ kind: "node", id: nodeRow.id });
    });
    return n;
  }
  function port(nodeRow, p) {
    const b = el("button", `twm-flow-graph__port twm-flow-graph__port--${p.direction === "input" ? "in" : "out"}`);
    b.type = "button";
    b.dataset.port = p.name;
    b.dataset.direction = p.direction;
    b.append(
      el("span", "twm-flow-graph__port-dot"),
      el("span", "twm-flow-graph__port-label", p.label || p.name),
      el("span", "twm-flow-graph__port-count")
    );
    if ((p.port_type || "FLOW") !== "FLOW") {
      b.classList.add("twm-flow-graph__port--data");
      b.disabled = true;
      b.dataset.data = "";
      b.title = say(S, "dataPort", dataPortRead ? dataPortRead(nodeRow, p) : null);
      return b;
    }
    b.title = p.direction === "output" ? say(S, "connectFrom") : say(S, "connectTo");
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      portClicked(nodeRow.id, p);
    });
    return b;
  }
  function portClicked(nodeId, p) {
    if (isReadOnly()) return;
    if (p.direction === "output") {
      connecting = { source: nodeId, sourcePort: p.name };
      root.classList.add("twm-flow-graph--connecting");
      paintNodes();
      setMessage(say(S, "connectStarted"));
      return;
    }
    if (!connecting) {
      setMessage(say(S, "connectFirst"));
      return;
    }
    const edge = { ...connecting, target: nodeId, targetPort: p.name };
    const verdict = connect(graph, catalogue, edge, { strings: S });
    cancelConnect();
    if (!verdict.ok) {
      setMessage(verdict.reason, "warning");
      return;
    }
    setMessage(isReturn(edge, nodeOf(nodeId)) ? say(S, "connectedReturn") : "");
    paintEdges();
    commit("flow:edge:connect");
  }
  function cancelConnect() {
    connecting = null;
    root.classList.remove("twm-flow-graph--connecting");
    paintNodes();
  }
  function startMove(ev, nodeId) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    select({ kind: "node", id: nodeId });
    if (isReadOnly()) return;
    const nodeRow = nodeOf(nodeId);
    const n = nodeEls.get(nodeId);
    if (!nodeRow || !n) return;
    const from = { ...nodeRow.position };
    const start = { x: ev.clientX, y: ev.clientY };
    let moved = false;
    const onMove = (m) => {
      const dx = (m.clientX - start.x) / canvas.scale;
      const dy = (m.clientY - start.y) / canvas.scale;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      nodeRow.position = { x: canvas.snap(from.x + dx), y: canvas.snap(from.y + dy) };
      n.style.left = `${nodeRow.position.x}px`;
      n.style.top = `${nodeRow.position.y}px`;
      paintEdges();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (moved) commit("flow:node:move");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }
  function paintNodes() {
    if (destroyed) return;
    const live = new Set(graph.nodes.map((x) => x.id));
    for (const [id, n] of nodeEls) {
      if (!live.has(id)) {
        n.remove();
        nodeEls.delete(id);
      }
    }
    for (const nodeRow of graph.nodes) {
      let n = nodeEls.get(nodeRow.id);
      const shape = `${nodeRow.type}|${nodeRow.label || ""}`;
      if (!n || n.dataset.shape !== shape) {
        const fresh = buildNode(nodeRow);
        fresh.dataset.shape = shape;
        const focused = n && n.contains(document.activeElement);
        if (n) n.replaceWith(fresh);
        else canvas.nodeLayer.appendChild(fresh);
        nodeEls.set(nodeRow.id, fresh);
        n = fresh;
        if (focused) fresh.focus({ preventScroll: true });
      }
      n.style.left = `${nodeRow.position.x}px`;
      n.style.top = `${nodeRow.position.y}px`;
      n.style.width = `${BOX.width}px`;
      const picked = selected?.kind === "node" && selected.id === nodeRow.id;
      n.classList.toggle("twm-flow-graph__node--picked", picked);
      if (picked) n.setAttribute("aria-current", "true");
      else n.removeAttribute("aria-current");
      n.classList.toggle("twm-flow-graph__node--connect-source", connecting?.source === nodeRow.id);
      const mine = findingsBy.get(nodeRow.id) || [];
      const errors = mine.filter((f) => f.severity !== "warning");
      n.classList.toggle("twm-flow-graph__node--error", errors.length > 0);
      n.classList.toggle("twm-flow-graph__node--warning", errors.length === 0 && mine.length > 0);
      n.querySelector(".twm-flow-graph__node-findings").replaceChildren(...mine.slice(0, 2).map((f) => el(
        "p",
        `twm-flow-graph__node-finding${f.severity === "warning" ? " twm-flow-graph__node-finding--warning" : ""}`,
        String(f.message ?? "")
      )));
      const summary = n.querySelector(".twm-flow-graph__node-summary");
      if (summary) summary.textContent = summarise(nodeRow, typeOf(nodeRow)) || "";
      const step = overlay?.steps?.[nodeRow.id] || null;
      const line = n.querySelector(".twm-flow-graph__node-run");
      line.textContent = step ? String(step.line ?? step.state ?? "") : "";
      if (step?.state) line.dataset.state = String(step.state);
      else delete line.dataset.state;
      if (step?.tone) line.dataset.tone = String(step.tone);
      else delete line.dataset.tone;
      n.classList.toggle("twm-flow-graph__node--skipped", step?.state === "skipped" || step?.state === "not-reached");
      const ports = overlay?.ports?.[nodeRow.id] || null;
      for (const b of n.querySelectorAll(".twm-flow-graph__port")) {
        if (!("data" in b.dataset)) b.disabled = isReadOnly();
        const mark = b.dataset.direction === "output" ? ports?.[b.dataset.port] : null;
        b.classList.toggle("twm-flow-graph__port--taken", Boolean(mark?.taken));
        b.classList.toggle("twm-flow-graph__port--untaken", Boolean(mark) && !mark.taken);
        const count2 = b.querySelector(".twm-flow-graph__port-count");
        count2.textContent = mark?.taken && Number.isFinite(Number(mark.count)) && mark.count !== null ? say(S, "portCount", mark.count) : mark && !mark.taken ? say(S, "portNotTaken") : "";
      }
    }
    paintEdges();
  }
  function paintEdges() {
    if (destroyed) return;
    const byId = new Map(graph.nodes.map((x) => [x.id, x]));
    const paths = [];
    graph.connections.forEach((c) => {
      const a = byId.get(c.source);
      const b = byId.get(c.target);
      if (!a || !b) return;
      const from = anchor(a, c.sourcePort, "output");
      const to = anchor(b, c.targetPort, "input");
      const back = isReturn(c, b);
      const d = back ? returnEdge(from, to, { floor: Math.max(bottomOf(a), bottomOf(b)) + RETURN_DROP }) : routeEdge(from, to, { simple: true });
      const picked = selected?.kind === "edge" && sameEdge(selected.edge, c);
      const mark = overlay?.ports?.[c.source]?.[c.sourcePort];
      const line = document.createElementNS(SVG, "path");
      line.setAttribute("class", [
        "twm-flow-graph__edge",
        back ? "twm-flow-graph__edge--back" : "",
        picked ? "twm-flow-graph__edge--picked" : "",
        mark?.taken ? "twm-flow-graph__edge--taken" : "",
        mark && !mark.taken ? "twm-flow-graph__edge--untaken" : ""
      ].filter(Boolean).join(" "));
      line.setAttribute("d", d);
      const hit = document.createElementNS(SVG, "path");
      hit.setAttribute("class", "twm-flow-graph__edge-hit");
      hit.setAttribute("d", d);
      if (back) {
        const title = document.createElementNS(SVG, "title");
        title.textContent = say(S, "returnLine");
        hit.appendChild(title);
      }
      hit.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        select({ kind: "edge", edge: { ...c } });
      });
      paths.push(line, hit);
    });
    canvas.edgeLayer.replaceChildren(...paths);
  }
  function fit({ whole = false } = {}) {
    if (!graph.nodes.length || destroyed) return;
    const xs = graph.nodes.map((x2) => x2.position.x);
    const ys = graph.nodes.map((x2) => x2.position.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const height = Math.max(...graph.nodes.map(bottomOf)) - y;
    canvas.fit({ x, y, width: Math.max(...xs) + BOX.width - x, height });
    const scale = canvas.scale > NATURAL ? NATURAL : !whole && canvas.scale < READABLE ? READABLE : null;
    if (scale !== null) {
      const box = canvas.root.getBoundingClientRect();
      canvas.setViewport({ scale, tx: 40 - x * scale, ty: box.height / 2 - (y + height / 2) * scale });
    }
  }
  function arrangeGraph() {
    if (refusals().arrange) return false;
    const at = layoutGraph(graph, catalogue, { ...BOX, loopEntry: loopPorts.entry });
    const ox = Math.min(...graph.nodes.map((x) => x.position.x));
    const oy = Math.min(...graph.nodes.map((x) => x.position.y));
    for (const nodeRow of graph.nodes) {
      const p = at.get(nodeRow.id);
      if (p) nodeRow.position = { x: canvas.snap(ox + p.x), y: canvas.snap(oy + p.y) };
    }
    paintNodes();
    commit("flow:arrange");
    fit();
    return true;
  }
  const panel = createSettingsPanel({
    widgets,
    references,
    strings: S,
    services,
    readOnly: isReadOnly(),
    onChange: (stepId, key, value) => {
      if (isReadOnly()) return;
      if (stepId === null) {
        if (value === void 0) delete settingsValue[key];
        else settingsValue[key] = value;
        commit("flow:settings", `settings:${key}`);
        return;
      }
      const nodeRow = nodeOf(stepId);
      if (!nodeRow) return;
      if (value === void 0) delete nodeRow.config[key];
      else nodeRow.config[key] = value;
      paintNodes();
      commit("flow:node:config", `config:${stepId}:${key}`);
    },
    onRename: (stepId, text) => {
      if (isReadOnly()) return;
      const nodeRow = nodeOf(stepId);
      if (!nodeRow) return;
      if (text) nodeRow.label = text;
      else delete nodeRow.label;
      const n = nodeEls.get(nodeRow.id);
      const name = text || typeOf(nodeRow)?.label || nodeRow.type;
      const title = n?.querySelector(".twm-flow-graph__node-title");
      if (title) title.textContent = title.title = name;
      if (n) {
        n.dataset.shape = `${nodeRow.type}|${nodeRow.label || ""}`;
        n.setAttribute("aria-label", name);
      }
      commit("flow:node:label", `label:${stepId}`);
    },
    onFocusLost: () => keepFocus(),
    values: typeof values === "function" ? (q) => values({
      graph: normalise(graph),
      stepId: q.stepId,
      field: q.field,
      key: q.key,
      before: q.stepId ? alwaysBefore(graph, catalogue, q.stepId, {
        loopPorts,
        ...waitsForAll ? { waitsForAll } : {}
      }) : [],
      loops: q.stepId ? enclosingLoops(graph, catalogue, q.stepId, { loopPorts }) : [],
      arms: q.stepId ? enclosingArms(graph, catalogue, q.stepId, { loopPorts }) : [],
      parameters: null
    }) : null,
    valuesNote,
    host: aside
  });
  aside.appendChild(connectionBox);
  const strip = createFindingsStrip({
    strings: S,
    nameOf: (id) => {
      if (id === null) return say(S, "theFlow");
      const n = nodeOf(id);
      return n ? n.label || typeOf(n)?.label || n.id : String(id);
    },
    onGoTo: (f) => {
      const target = f.node_id && nodeOf(f.node_id) ? { kind: "node", id: f.node_id } : { kind: "flow" };
      select(target);
      if (target.kind === "node") {
        const n = nodeOf(target.id);
        canvas.bringIntoView({
          x: n.position.x,
          y: n.position.y,
          width: BOX.width,
          height: bottomOf(n) - n.position.y
        });
      }
      if (!(f.field && panel.focusField(f.field))) focusFirstField();
    }
  });
  function focusFirstField() {
    const control = panel.el.querySelector('[data-field] input, [data-field] select, [data-field] textarea, [data-field] [contenteditable="true"]') || panel.el.querySelector("[data-twm-flow-title]");
    if (control) {
      control.focus({ preventScroll: true });
      return true;
    }
    return false;
  }
  function select(next) {
    selected = next;
    for (const [id, n] of nodeEls) {
      const picked = next?.kind === "node" && next.id === id;
      n.classList.toggle("twm-flow-graph__node--picked", picked);
      if (picked) n.setAttribute("aria-current", "true");
      else n.removeAttribute("aria-current");
    }
    paintEdges();
    paintPanel();
    announceSelection();
  }
  function announceSelection() {
    const now = selected?.kind === "node" ? `step:${selected.id}` : selected?.kind === "edge" ? `connection:${JSON.stringify(selected.edge)}` : selected?.kind === "flow" ? "flow" : "";
    if (now === lastSelect) return;
    lastSelect = now;
    if (!onSelect || destroyed) return;
    if (selected?.kind === "node") onSelect({ kind: "step", id: selected.id });
    else if (selected?.kind === "edge") onSelect({ kind: "connection", id: null, connection: { ...selected.edge } });
    else if (selected?.kind === "flow") onSelect({ kind: "flow", id: null });
    else onSelect({ kind: null, id: null });
  }
  function removeSelected() {
    if (!selected || isReadOnly()) return false;
    if (selected.kind === "node") {
      const nodeRow = nodeOf(selected.id);
      if (!nodeRow || !canRemove(nodeRow, typeOf(nodeRow))) return false;
      removeNode(graph, selected.id);
      findingsBy = groupFindings(findings, { graph });
      select(null);
      paintNodes();
      commit("flow:node:remove");
    } else if (selected.kind === "edge") {
      disconnect(graph, selected.edge);
      select(null);
      paintNodes();
      commit("flow:edge:disconnect");
    } else return false;
    keepFocus();
    return true;
  }
  function paintConnection() {
    const e = selected.edge;
    const remove = button({
      label: say(S, "removeConnection"),
      icon: "link_off",
      danger: true,
      className: "twm-flow-graph__connection-remove",
      onClick: () => removeSelected()
    });
    remove.dataset.action = "remove-connection";
    remove.disabled = isReadOnly();
    connectionBox.replaceChildren(
      el("h3", "twm-flow-graph__connection-title", say(S, "connection")),
      el("p", "twm-flow-graph__connection-line", say(S, "connectionLine", e)),
      remove
    );
    connectionBox.hidden = false;
  }
  function paintPanel() {
    if (destroyed) return;
    if (selected?.kind === "edge") {
      panel.clear();
      panel.el.hidden = true;
      paintConnection();
      return;
    }
    connectionBox.hidden = true;
    connectionBox.replaceChildren();
    panel.el.hidden = false;
    const nodeRow = selected?.kind === "node" ? nodeOf(selected.id) : null;
    if (nodeRow) {
      const def = typeOf(nodeRow);
      const after = typeof slots.stepPanel === "function" ? (box) => slots.stepPanel(box, normalise({
        nodes: [nodeRow],
        connections: []
      }).nodes[0], api) : null;
      panel.show({
        step: nodeRow,
        type: def,
        value: nodeRow.config,
        title: nodeRow.label || "",
        placeholderTitle: def?.label || nodeRow.type,
        rename: true,
        typeLabel: def?.label || nodeRow.type,
        description: def ? def.description || "" : say(S, "unknownType", nodeRow.type),
        idLine: typeof summariseReads === "function" ? summariseReads(nodeRow, def) || null : null,
        icon: def?.icon || "widgets",
        tone: catalogue.tone(nodeRow.type),
        actions: canRemove(nodeRow, def) ? [{
          id: "remove",
          label: say(S, "removeStep"),
          icon: "delete",
          danger: true,
          run: () => removeSelected()
        }] : [],
        slots: { after }
      });
    } else {
      const after = typeof slots.flowPanel === "function" ? (box) => slots.flowPanel(box, api) : null;
      panel.show({
        step: null,
        type: null,
        value: settingsValue,
        title: settingsTitle || say(S, "theFlow"),
        fields: settingsSchema ? fieldsFromSchema(settingsSchema) : [],
        icon: "tune",
        tone: "grey",
        slots: { after }
      });
    }
    panel.setFindings(findings);
  }
  const unbindKeys = bindFlowKeys(root, {
    undo: () => {
      undo();
    },
    redo: () => {
      redo();
    },
    remove: () => removeSelected() ? void 0 : false,
    rename: () => {
      if (selected?.kind !== "node" || isReadOnly()) return false;
      const t = panel.el.querySelector("[data-twm-flow-title]");
      if (!t) return false;
      t.focus({ preventScroll: true });
      t.select?.();
      return void 0;
    },
    open: (ev) => {
      if (ev.target.closest?.(".twm-flow-graph__port")) return false;
      const nodeEl = ev.target.closest?.("[data-node-id]");
      if (nodeEl && canvas.nodeLayer.contains(nodeEl)) {
        if (!(selected?.kind === "node" && selected.id === nodeEl.dataset.nodeId)) {
          select({ kind: "node", id: nodeEl.dataset.nodeId });
        }
        return focusFirstField() ? void 0 : false;
      }
      return false;
    },
    escape: () => {
      if (!connecting) return false;
      cancelConnect();
      setMessage("");
      return void 0;
    }
  });
  root.append(toolbar, why, readonlyBanner, message, strip.el, banner, body);
  if (host) host.appendChild(root);
  function paintReadOnly() {
    root.classList.toggle("twm-flow-graph--readonly", isReadOnly());
    readonlyBanner.textContent = readOnlyReason() || (isReadOnly() ? say(S, "readOnlyRefusal") : "");
    readonlyBanner.hidden = !isReadOnly();
  }
  const api = {
    el: root,
    /** The editor's own history — `keep()`, `adopt(kept, editor.snapshot())`, `baseline(...)`. */
    history,
    /** The kernel underneath, for a consumer that needs the viewport. */
    canvas,
    /**
     * Replace the content. `baseline` (the default) clears both stacks: what
     * was loaded is where undo starts. With `baseline: false` the stacks are
     * kept and the loaded content is the present they undo from.
     */
    load({ graph: g = null, flowSettings: fs } = {}, { baseline = true, fit: andFit = true } = {}) {
      if (destroyed) return;
      if (connecting) cancelConnect();
      graph = normalise(g);
      if (fs !== void 0) {
        settingsSchema = fs?.schema ?? settingsSchema;
        settingsTitle = fs?.title ?? settingsTitle;
        settingsValue = structuredClone(plainObject(fs?.value));
      }
      if (selected?.kind === "node" && !nodeOf(selected.id)) selected = null;
      if (selected?.kind === "edge" && !graph.connections.some((c) => sameEdge(c, selected.edge))) selected = null;
      findingsBy = groupFindings(findings, { graph });
      paintNodes();
      paintPanel();
      const state = snapshot();
      if (baseline) history.baseline(state);
      else if (state !== history.settled) history.adopt({ ...history.keep(), settled: state }, state);
      paintToolbar();
      announceSelection();
      if (andFit) {
        if (fitFrame !== null) globalThis.cancelAnimationFrame?.(fitFrame);
        fitFrame = globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(() => {
          fitFrame = null;
          fit();
        }) : (fit(), null);
      }
    },
    getGraph: () => normalise(graph),
    serialise: () => serialise(graph),
    /** The text `onChange` hands on and the history holds: the graph and the flow's settings. */
    snapshot,
    getFlowSettings: () => structuredClone(settingsValue),
    setFindings(list) {
      findings = findingsList(list);
      findingsBy = groupFindings(findings, { graph });
      strip.set(findings);
      paintNodes();
      panel.setFindings(findings);
    },
    /** Draw a run on the canvas — never changes the graph and rebuilds no field. */
    setRunOverlay(next) {
      overlay = next && typeof next === "object" ? next : null;
      banner.textContent = overlay?.banner ? String(overlay.banner) : "";
      banner.hidden = !overlay?.banner;
      paintNodes();
      panel.repaintSlots();
    },
    setReadOnly(next) {
      ro = next;
      if (ro && connecting) cancelConnect();
      dragCleanup?.();
      paintReadOnly();
      paintPalette();
      paintNodes();
      panel.setReadOnly(isReadOnly());
      paintToolbar();
    },
    /** A verb refused IN PLACE, its reason beside it; or marked busy. */
    setActionState(id, { disabled = false, reason = null, busy = false } = {}) {
      consumerState.set(id, { disabled: Boolean(disabled), reason, busy: Boolean(busy) });
      paintToolbar();
    },
    setStatus(text) {
      status.textContent = text || "";
    },
    setMessage,
    select(target) {
      if (target === null || target === void 0) select(null);
      else if (target === "flow") select({ kind: "flow" });
      else if (nodeOf(String(target))) select({ kind: "node", id: String(target) });
    },
    /** Rebuild the panel's fields, keeping the focus and the caret — for a
     *  consumer whose widget's data has arrived. */
    repaintPanel() {
      paintPanel();
    },
    focus() {
      canvas.root.focus({ preventScroll: true });
    },
    undo,
    redo,
    arrange: () => arrangeGraph(),
    fit,
    destroy() {
      if (destroyed) return;
      dragCleanup?.();
      if (fitFrame !== null) globalThis.cancelAnimationFrame?.(fitFrame);
      closeFlowPopovers();
      unbindKeys();
      panel.destroy();
      strip.destroy();
      destroyed = true;
      canvas.destroy();
      root.remove();
    }
  };
  paintReadOnly();
  paintPalette();
  paintNodes();
  paintPanel();
  paintToolbar();
  history.baseline(snapshot());
  return api;
}

// src/flow/outline/strings.js
var plural2 = (n, one, many) => n === 1 ? one : many.replace("{n}", String(n));
var OUTLINE_STRINGS = Object.freeze({
  // ── why a flow cannot be drawn as an outline (36 §6.3) ──────────────
  outline_no_start: "This flow has no Start step.",
  outline_two_starts: "This flow has two Start steps.",
  outline_unknown_type: (type) => `\u2018${type}\u2019 is a step type this editor does not know, so the flow cannot be drawn as an outline.`,
  outline_unreachable: (x) => `Nothing leads to \u2018${x}\u2019 from Start.`,
  outline_shared_step: (x) => `\u2018${x}\u2019 is reached from two places that are not one block.`,
  outline_jump_out: (x, y) => `A line from \u2018${x}\u2019 leaves its block for \u2018${y}\u2019.`,
  outline_two_continuations: (x) => `\u2018${x}\u2019 continues to two steps; a Parallel step runs branches side by side.`,
  outline_parallel_unjoined: (p) => `The branches of \u2018${p}\u2019 do not meet at one Merge.`,
  outline_merge_unpaired: (j) => `\u2018${j}\u2019 closes no Parallel step.`,
  outline_loop_shape: (l) => `The body of \u2018${l}\u2019 does not end at its Next.`,
  loopNextOutside: (x, l) => `\u2018${x}\u2019 is not inside the body of \u2018${l}\u2019, so it cannot go on to its next item.`,
  loopLeaks: (l, y) => `The body of \u2018${l}\u2019 reaches \u2018${y}\u2019, which runs after the loop.`,
  loopEnteredByNext: (l) => `\u2018${l}\u2019 is entered by its Next from outside its body.`,
  outline_cycle: (x, y) => `\u2018${x}\u2019 leads back to \u2018${y}\u2019, and only a loop's Next may.`,
  selfLine: (x) => `A line leaves \u2018${x}\u2019 and comes straight back into it; a step cannot connect to itself.`,
  outline_unknown_port: (x, port) => `\u2018${x}\u2019 has no port called ${port}.`,
  outline_broken_line: (id) => `A line names \u2018${id}\u2019, which is not a step in this flow.`,
  outline_after_end: (x, y) => `\u2018${x}\u2019 ends the run, and a line leaves it for \u2018${y}\u2019.`,
  readOnlyBecause: (reason) => `This flow is shown as a list in the order it runs, and cannot be edited here: ${reason}`,
  // ── the list ───────────────────────────────────────────────────────
  stepsHeading: "Steps",
  stepsCount: (n) => plural2(n, "1 step", "{n} steps"),
  findStep: "Find a step",
  findNothing: (q) => `No step matches \u201C${q}\u201D.`,
  statusKeys: "Alt+\u2191 \u2193 moves a step \xB7 Ctrl+D duplicates \xB7 Del removes \xB7 Ctrl+Z undoes",
  fold: (x) => `Fold ${x}`,
  unfold: (x) => `Unfold ${x}`,
  menuFor: (x) => `Menu for ${x}`,
  dragToMove: "Drag to move",
  addStepHere: (where) => `Add a step here \u2014 ${where}`,
  removeBranch: (arm) => `Remove ${arm}`,
  armStops: "Stops here",
  flowStart: "Start",
  startType: "Flow",
  // ── where a step is, and where one would go ────────────────────────
  topLevel: "Top level",
  topLevelFirst: "Top level \xB7 the first step",
  topLevelLast: "Top level \xB7 the last step",
  insidePath: (path) => `Inside ${path}`,
  pathJoin: " \u203A ",
  gapTop: "at the top level",
  gapInside: (path) => `inside ${path}`,
  gapAfter: (where, x) => `${where}, after ${x}`,
  gapBefore: (where, x) => `${where}, before ${x}`,
  gapFirst: (where) => `${where}, as the first step`,
  dropInto: (path) => `Into ${path}`,
  dropTop: "Top level",
  dropBefore: (x) => `before ${x}`,
  dropAfter: (x) => `after ${x}`,
  dropFirst: "as the first step",
  dropLabel: (where, at) => `${where} \xB7 ${at}`,
  dropNowhere: "Drop it between two steps to move it there.",
  // ── the step menu ──────────────────────────────────────────────────
  moveUp: "Move up",
  moveDown: "Move down",
  moveOut: (x) => `Move out of ${x}`,
  moveOutTop: "Move out",
  wrapIn: "Wrap in",
  copy: "Copy",
  cut: "Cut",
  pasteAfter: "Paste after",
  renameKey: "F2",
  keyMoveUp: "Alt+\u2191",
  keyMoveDown: "Alt+\u2193",
  keyMoveOut: "Alt+\u2190",
  keyDuplicate: "Ctrl+D",
  keyCopy: "Ctrl+C",
  keyCut: "Ctrl+X",
  keyPaste: "Ctrl+V",
  keyRemove: "Del",
  refusedLine: (what, why) => `${what} \u2014 ${why}`,
  alreadyFirst: (where) => `already first in ${where}`,
  alreadyLast: (where) => `already last in ${where}`,
  alreadyTop: "already at the top level",
  theTopLevel: "the top level",
  nothingCopied: "nothing is copied",
  readOnlyRefusal: "the flow is read only",
  // ── why an edit is refused ─────────────────────────────────────────
  endNotLast: (end) => `\u2018${end}\u2019 ends the run, so it can only be the last step here.`,
  nothingAfterEnd: (end) => `Nothing runs after \u2018${end}\u2019.`,
  endsNotLast: (x) => `Every way through \u2018${x}\u2019 ends, so it can only be the last step here.`,
  endInLoop: (end, loop) => `\u2018${end}\u2019 ends the run, and a loop's body cannot: the steps inside \u2018${loop}\u2019 end at its next item.`,
  wrapLoopNeverReturns: (x) => `\u2018${x}\u2019 never goes on, so a loop around it would never reach its next item.`,
  wouldOrphan: (y) => `Nothing would lead to \u2018${y}\u2019 any more.`,
  branchToJoinNeeded: (p, j) => `\u2018${p}\u2019 needs a branch that goes on to \u2018${j}\u2019.`,
  unreachableHere: (x) => `Every way through \u2018${x}\u2019 ends, so nothing would reach a step after it.`,
  nextOutsideLoop: (x) => `\u2018${x}\u2019 goes on with the next item of a loop, so it can only go inside one.`,
  intoItself: (x) => `\u2018${x}\u2019 cannot go inside itself.`,
  lastBranch: (p) => `\u2018${p}\u2019 needs at least one branch.`,
  armNoContinuation: (x) => `Nothing comes after \u2018${x}\u2019 yet, so there is nowhere for those steps to carry on to \u2014 add a step after it first.`,
  notBlockShaped: (why) => `That would leave a flow the outline cannot draw: ${why}`,
  noJoinType: "There is no step type that closes a Parallel step.",
  // ── ports drawn as settings (36 §6.5) ──────────────────────────────
  armExitLabel: "After those steps",
  armExitRejoin: (x) => `Carry on with \u201C${x}\u201D`,
  armExitRejoinEnd: "Carry on after this step",
  joinSettingLabel: "When the branches finish",
  joinAll: "Wait for every branch",
  joinAny: "Go on when the first one finishes",
  // ── the run overlay (36 §6.7) ──────────────────────────────────────
  runTaken: "taken",
  runNotTaken: "not taken",
  runCount: (n) => `\xD7${n}`,
  runState: (state) => ({
    completed: "completed",
    failed: "failed",
    skipped: "skipped",
    running: "running",
    cancelled: "cancelled",
    "not-reached": "not reached"
  })[state] ?? String(state ?? "")
});

// src/flow/outline/mapping.js
var isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var DEFAULTS = Object.freeze({
  start: { role: "start", label: null },
  end: { role: "end", entry: null },
  step: { input: "in", continue: "out" },
  branch: { role: "branch", arms: {}, unconnected: "stop", entry: null, note: null },
  fanout: {
    role: "fanout",
    join: { role: "join", type: null, input: "in", output: "out", field: "join", foot: {}, choices: {} },
    arm: "Branch {n}",
    addArm: "Add a branch",
    entry: null,
    note: null
  },
  loop: {
    role: "loop",
    ports: { entry: "in", next: "next", body: "body", done: "done" },
    foot: "Next item",
    skip: "Go on with the next item",
    addInside: "Add a step inside",
    entry: null,
    note: null
  },
  arms: {},
  types: {},
  add: "Add a step"
});
var DEFAULT_SETTING = Object.freeze({
  stop: "Stop here",
  fail: "Fail the run",
  connected: (arm) => `Run the steps under \u201C${arm}\u201D`
});
function word(v, arg, fallback = "") {
  const r = typeof v === "function" ? v(arg) : v;
  return r === void 0 || r === null ? fallback : String(r);
}
function merged(base, over) {
  const out = { ...base };
  if (isObject(over)) for (const [k, v] of Object.entries(over)) out[k] = v;
  return out;
}
function createBlockMapping(blocks = {}, catalogue = null) {
  if (blocks && blocks.__outlineMapping) return blocks;
  const b = isObject(blocks) ? blocks : {};
  const start = merged(DEFAULTS.start, b.start);
  const end = merged(DEFAULTS.end, b.end);
  const step = merged(DEFAULTS.step, b.step);
  const branch = merged(DEFAULTS.branch, b.branch);
  const fanout = merged(DEFAULTS.fanout, b.fanout);
  fanout.join = merged(DEFAULTS.fanout.join, b.fanout?.join);
  const loop = merged(DEFAULTS.loop, b.loop);
  loop.ports = merged(DEFAULTS.loop.ports, b.loop?.ports);
  const arms = isObject(b.arms) ? b.arms : {};
  const types = isObject(b.types) ? b.types : {};
  const roleKind = /* @__PURE__ */ new Map([
    [start.role, "start"],
    [end.role, "end"],
    [branch.role, "branch"],
    [fanout.role, "fanout"],
    [fanout.join.role, "join"],
    [loop.role, "loop"]
  ]);
  const typeOf = (typeId) => catalogue?.get?.(typeId) ?? null;
  const flowPorts = (typeId, direction) => (catalogue ? direction === "input" ? catalogue.inputs(typeId, { flow: true }) : catalogue.outputs(typeId, { flow: true }) : []).map((p) => p.name);
  const named = (typeId, direction, want) => {
    const ports = flowPorts(typeId, direction);
    if (want && ports.includes(want)) return want;
    return ports[0] ?? null;
  };
  function kindOf(typeId) {
    const role = catalogue?.role ? catalogue.role(typeId) : "step";
    return roleKind.get(role) ?? "step";
  }
  function override(typeId) {
    return isObject(types[typeId]) ? types[typeId] : {};
  }
  function input(typeId) {
    const k = kindOf(typeId);
    if (k === "loop") return named(typeId, "input", loop.ports.entry);
    if (k === "join") return named(typeId, "input", override(typeId).input ?? fanout.join.input);
    return named(typeId, "input", override(typeId).input ?? step.input);
  }
  function cont(typeId) {
    const k = kindOf(typeId);
    if (k === "branch" || k === "end" || k === "fanout") return null;
    if (k === "loop") return flowPorts(typeId, "output").includes(loop.ports.done) ? loop.ports.done : null;
    if (k === "join") return named(typeId, "output", override(typeId).continue ?? fanout.join.output);
    return named(typeId, "output", override(typeId).continue ?? step.continue);
  }
  function armPorts(typeId) {
    const k = kindOf(typeId);
    const outs = flowPorts(typeId, "output");
    if (k === "branch") return outs;
    if (k === "fanout" || k === "end") return [];
    if (k === "loop") return outs.filter((p) => p !== loop.ports.body && p !== loop.ports.done);
    const c = cont(typeId);
    return outs.filter((p) => p !== c);
  }
  function portLabel(typeId, port) {
    return catalogue?.port?.(typeId, port, "output")?.label ?? port;
  }
  function stepView(node) {
    const type = typeOf(node?.type);
    return { id: node?.id, label: node?.label || type?.label || node?.id || "", node, type };
  }
  function armSpec(node, port) {
    const o = override(node?.type).arms?.[port];
    const g = arms[port];
    return { ...isObject(g) ? g : {}, ...isObject(o) ? o : {} };
  }
  function armLabel(node, port) {
    const spec = armSpec(node, port);
    return word(spec.label, stepView(node), portLabel(node?.type, port));
  }
  function armUnconnected(node, port) {
    const spec = armSpec(node, port);
    return spec.unconnected === "fail" ? "fail" : "stop";
  }
  function armSetting(node, port) {
    const spec = armSpec(node, port);
    const g = isObject(arms[port]?.setting) ? arms[port].setting : {};
    const o = isObject(override(node?.type).arms?.[port]?.setting) ? override(node?.type).arms[port].setting : {};
    const setting = { ...g, ...o };
    const label = armLabel(node, port);
    const how = armUnconnected(node, port);
    return {
      label: word(setting.label, stepView(node), label),
      unconnected: word(setting.unconnected, stepView(node), DEFAULT_SETTING[how]),
      connected: word(setting.connected ?? DEFAULT_SETTING.connected, label, ""),
      meaning: how,
      tone: spec.tone ?? (how === "fail" ? "fail" : "arm"),
      // the schema field the setting is drawn after, or null (at the end)
      after: setting.after ?? null
    };
  }
  function branchArmLabel(node, port) {
    const o = override(node?.type).arms?.[port];
    if (isObject(o) && o.label !== void 0) return word(o.label, stepView(node), port);
    if (typeof o === "string") return o;
    const g = branch.arms?.[port];
    if (g !== void 0) return word(isObject(g) ? g.label : g, stepView(node), portLabel(node?.type, port));
    return portLabel(node?.type, port);
  }
  function branchArmTone(node, port, index) {
    const g = branch.arms?.[port];
    if (isObject(g) && g.tone) return g.tone;
    return index === 0 ? "then" : "else";
  }
  function fanoutArmLabel(n) {
    return word(fanout.arm, n, `Branch ${n}`).replace("{n}", String(n));
  }
  function joinType() {
    if (fanout.join.type && catalogue?.has?.(fanout.join.type)) return fanout.join.type;
    return catalogue?.list?.().find((t) => kindOf(t.type_id) === "join")?.type_id ?? null;
  }
  function joinValue(joinNode) {
    const field = fanout.join.field;
    const v = joinNode?.config?.[field];
    if (v !== void 0) return v;
    const def = typeOf(joinNode?.type)?.config_schema?.properties?.[field]?.default;
    return def === void 0 ? "all" : def;
  }
  function joinFoot(joinNode, S) {
    const v = joinValue(joinNode);
    const foot = fanout.join.foot?.[v];
    if (foot !== void 0) return word(foot, v, "");
    return v === "any" ? S?.joinFootAny ?? "Then go on when the first finishes" : S?.joinFootAll ?? "Then wait for every branch";
  }
  function entryFor(typeId) {
    const t = typeOf(typeId);
    const k = kindOf(typeId);
    const own = override(typeId).entry;
    const blockEntry = k === "branch" ? branch.entry : k === "fanout" ? fanout.entry : k === "loop" ? loop.entry : k === "end" ? end.entry : null;
    const shared = blockEntry && catalogue?.list?.().filter((x) => kindOf(x.type_id) === k).length === 1 ? blockEntry : null;
    const e = { ...isObject(shared) ? shared : {}, ...isObject(own) ? own : {} };
    return {
      label: e.label ?? t?.label ?? typeId,
      sub: e.sub ?? (e.label ? t?.label ?? "" : ""),
      description: e.description ?? t?.description ?? ""
    };
  }
  return Object.freeze({
    __outlineMapping: true,
    start,
    end,
    step,
    branch,
    fanout,
    loop,
    loopPorts: Object.freeze({ ...loop.ports }),
    kindOf,
    input,
    cont,
    armPorts,
    armLabel,
    armUnconnected,
    armSetting,
    branchArmLabel,
    branchArmTone,
    fanoutArmLabel,
    joinType,
    joinValue,
    joinFoot,
    entryFor,
    stepView,
    startLabel: (S) => start.label ?? S?.flowStart ?? "Start",
    loopFoot: (node) => word(loop.foot, stepView(node), "Next item"),
    loopSkip: (node) => word(loop.skip, stepView(node), "Go on with the next item"),
    loopAddInside: (node) => word(loop.addInside, stepView(node), "Add a step inside"),
    fanoutAddArm: (node) => word(fanout.addArm, stepView(node), "Add a branch"),
    addLabel: () => word(b.add ?? DEFAULTS.add, null, "Add a step"),
    note: (kind, node) => {
      const n = kind === "branch" ? branch.note : kind === "fanout" ? fanout.note : kind === "loop" ? loop.note : null;
      return n === null || n === void 0 ? null : word(n, stepView(node), "");
    },
    joinField: fanout.join.field,
    joinChoices: fanout.join.choices || {}
  });
}
function displayName(node, catalogue) {
  if (!node) return "";
  return node.label || catalogue?.get?.(node.type)?.label || node.id;
}

// src/flow/outline/recognise.js
var Refusal = class extends Error {
  constructor(code, message, nodeId) {
    super(message);
    this.code = code;
    this.nodeId = nodeId ?? null;
  }
};
var E = (loopId) => `\0E:${loopId}`;
var isE = (key) => typeof key === "string" && key.startsWith("\0E:");
var loopOfE = (key) => key.slice(3);
function outlineFromGraph(graph, catalogue, blocks = {}, { strings = null } = {}) {
  const map = createBlockMapping(blocks, catalogue);
  const S = createStrings(OUTLINE_STRINGS, strings);
  try {
    const tree = new Recogniser(graph, catalogue, map, S).run();
    return { ok: true, tree };
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, code: err.code, message: err.message, node_id: err.nodeId };
    throw err;
  }
}
var Recogniser = class {
  constructor(graph, catalogue, map, S) {
    this.graph = graph && typeof graph === "object" ? graph : { nodes: [], connections: [] };
    this.cat = catalogue;
    this.map = map;
    this.S = S;
    this.nodes = Array.isArray(this.graph.nodes) ? this.graph.nodes : [];
    this.conns = Array.isArray(this.graph.connections) ? this.graph.connections : [];
    this.byId = new Map(this.nodes.map((n) => [String(n.id), n]));
    this.rank = /* @__PURE__ */ new Map();
    this.reachMemo = /* @__PURE__ */ new Map();
    this.placed = /* @__PURE__ */ new Map();
    this.ancestors = /* @__PURE__ */ new Set();
    this.returnsSeen = /* @__PURE__ */ new Set();
  }
  // ── names and refusals ──────────────────────────────────────────────
  name(id) {
    return displayName(this.byId.get(id), this.cat) || String(id);
  }
  refuse(code, nodeId, ...args) {
    throw new Refusal(code, say(this.S, code, ...args), nodeId);
  }
  refuseWith(code, key, nodeId, ...args) {
    throw new Refusal(code, say(this.S, key, ...args), nodeId);
  }
  kind(id) {
    return this.map.kindOf(this.byId.get(id)?.type);
  }
  typeOf(id) {
    return this.byId.get(id)?.type;
  }
  isNext(id, port) {
    return this.kind(id) === "loop" && port === this.map.loopPorts.next;
  }
  // ── the graph, read once ────────────────────────────────────────────
  index() {
    const starts = this.nodes.filter((n) => this.map.kindOf(n.type) === "start");
    if (starts.length === 0) this.refuse("outline_no_start", null);
    if (starts.length > 1) this.refuse("outline_two_starts", String(starts[1].id));
    this.startId = String(starts[0].id);
    for (const n of this.nodes) {
      if (!this.cat?.has?.(n.type)) this.refuse("outline_unknown_type", String(n.id), String(n.type));
    }
    this.flow = [];
    this.extra = [];
    this.out = new Map(this.nodes.map((n) => [String(n.id), []]));
    this.into = new Map(this.nodes.map((n) => [String(n.id), []]));
    for (const c of this.conns) {
      const s = String(c.source);
      const t = String(c.target);
      const sourcePort = String(c.sourcePort || "out");
      const targetPort = String(c.targetPort || "in");
      if (!this.byId.has(s)) this.refuse("outline_broken_line", this.byId.has(t) ? t : null, s);
      if (!this.byId.has(t)) this.refuse("outline_broken_line", s, t);
      const sp = this.cat.port(this.typeOf(s), sourcePort, "output");
      const tp = this.cat.port(this.typeOf(t), targetPort, "input");
      if (!sp) this.refuse("outline_unknown_port", s, this.name(s), sourcePort);
      if (!tp) this.refuse("outline_unknown_port", t, this.name(t), targetPort);
      if ((sp.port_type || "FLOW") !== "FLOW" || (tp.port_type || "FLOW") !== "FLOW") {
        this.extra.push(c);
        continue;
      }
      if (s === t) this.refuseWith("outline_cycle", "selfLine", s, this.name(s));
      const edge = { source: s, target: t, sourcePort, targetPort, raw: c };
      this.flow.push(edge);
      this.out.get(s).push(edge);
      this.into.get(t).push(edge);
    }
  }
  outOf(id, port) {
    return this.out.get(id).filter((e) => e.sourcePort === port);
  }
  /** Every node is reached from Start, over any flow line. */
  reachability() {
    const seen = /* @__PURE__ */ new Set([this.startId]);
    const queue = [this.startId];
    while (queue.length) {
      const id = queue.shift();
      for (const e of this.out.get(id)) {
        if (!seen.has(e.target)) {
          seen.add(e.target);
          queue.push(e.target);
        }
      }
    }
    for (const n of this.nodes) {
      if (!seen.has(String(n.id))) this.refuse("outline_unreachable", String(n.id), this.name(String(n.id)));
    }
  }
  /**
   * The structure the continuations are read on: a loop's body lines set
   * aside (a loop is one node from outside), a line into a loop's Next sent
   * to that loop's virtual end of body. A cycle here is a line back that is
   * not a loop's Next.
   */
  structure() {
    this.succ = /* @__PURE__ */ new Map();
    const add = (from, to) => {
      if (!this.succ.has(from)) this.succ.set(from, []);
      if (!this.succ.get(from).includes(to)) this.succ.get(from).push(to);
    };
    for (const n of this.nodes) add(String(n.id), null);
    for (const e of this.flow) {
      if (this.isNext(e.target, e.targetPort)) {
        add(e.source, E(e.target));
        continue;
      }
      if (this.kind(e.source) === "loop" && e.sourcePort === this.map.loopPorts.body) continue;
      add(e.source, e.target);
    }
    for (const [k, list] of this.succ) this.succ.set(k, list.filter((x) => x !== null));
    const state = /* @__PURE__ */ new Map();
    const order = [];
    const visit = (id, from) => {
      const st = state.get(id);
      if (st === 1) this.refuse("outline_cycle", from, this.name(from), this.name(id));
      if (st === 2) return;
      state.set(id, 1);
      for (const s of this.succ.get(id) || []) if (!isE(s)) visit(s, id);
      state.set(id, 2);
      order.push(id);
    };
    for (const n of this.nodes) visit(String(n.id), String(n.id));
    order.reverse().forEach((id, i) => this.rank.set(id, i));
    for (const n of this.nodes) {
      if (this.kind(String(n.id)) === "loop") this.rank.set(E(String(n.id)), this.nodes.length + this.rank.get(String(n.id)));
    }
  }
  /** Every key reachable from `key` (itself not included). */
  reach(key) {
    if (key === null || key === void 0) return /* @__PURE__ */ new Set();
    if (this.reachMemo.has(key)) return this.reachMemo.get(key);
    const out = /* @__PURE__ */ new Set();
    const stack = [...this.succ.get(key) || []];
    while (stack.length) {
      const k = stack.pop();
      if (out.has(k)) continue;
      out.add(k);
      for (const s of this.succ.get(k) || []) stack.push(s);
    }
    this.reachMemo.set(key, out);
    return out;
  }
  /** A line's target as a key of the structure: a node, or a loop's end of body. */
  keyOf(edge) {
    return this.isNext(edge.target, edge.targetPort) ? E(edge.target) : edge.target;
  }
  /**
   * Where a Branch carries on: a key, or null. The first step the arms that
   * meet all reach; and where they meet nowhere, the place the branch's own
   * Seq goes on to (`T`) when an arm goes there — that arm rejoins it, and
   * the branch is the last item of its Seq.
   */
  branchContinuation(id, T) {
    const arms = [];
    for (const port of this.map.armPorts(this.typeOf(id))) {
      const es = this.outOf(id, port);
      if (es.length > 1) this.refuse("outline_two_continuations", id, this.name(id));
      if (!es.length) {
        arms.push(/* @__PURE__ */ new Set());
        continue;
      }
      const k = this.keyOf(es[0]);
      arms.push(/* @__PURE__ */ new Set([k, ...this.reach(k)]));
    }
    const live = arms.filter((r, i) => arms.some((q, j) => j !== i && [...r].some((x) => q.has(x))));
    const common = live.length ? [...live[0]].filter((x) => live.every((r) => r.has(x))) : [];
    if (common.length) {
      common.sort((a, b) => (this.rank.get(a) ?? Infinity) - (this.rank.get(b) ?? Infinity));
      return common[0];
    }
    if (T?.kind === "node" && arms.some((r) => r.has(T.id))) return T.id;
    if (T?.kind === "next" && arms.some((r) => r.has(E(T.loop)))) return E(T.loop);
    if (T?.kind === "join") {
      const joins = new Set(arms.map((r) => this.firstOpenJoin(r)).filter(Boolean));
      if (joins.size === 1) return [...joins][0];
    }
    return null;
  }
  /**
   * The first join in `keys` that no fanout among them closes first: walked
   * in run order, a fanout opens one and a join closes the innermost open
   * one, so a parallel nested inside an arm keeps its own Merge.
   */
  firstOpenJoin(keys) {
    let depth = 0;
    const ordered2 = [...keys].filter((k) => !isE(k) && !this.placed.has(k)).sort((a, b) => (this.rank.get(a) ?? Infinity) - (this.rank.get(b) ?? Infinity));
    for (const k of ordered2) {
      const kind = this.kind(k);
      if (kind === "fanout") depth += 1;
      else if (kind === "join") {
        if (depth === 0) return k;
        depth -= 1;
      }
    }
    return null;
  }
  // ── the parse ───────────────────────────────────────────────────────
  run() {
    this.index();
    this.reachability();
    this.structure();
    const start = this.startId;
    this.place(start, null);
    const startItem = { kind: "start", id: start, input: null, cont: this.map.cont(this.typeOf(start)), arms: [] };
    this.placed.set(start, startItem);
    const contEdges = startItem.cont ? this.outOf(start, startItem.cont) : [];
    if (contEdges.length > 1) this.refuse("outline_two_continuations", start, this.name(start));
    const contPos = contEdges.length ? this.position(contEdges[0]) : null;
    const T = this.targetOf(contPos);
    const ctx0 = { depth: 0, loops: [], guards: [], targets: [], kind: "top" };
    startItem.arms = this.parseArms(start, T, ctx0, "arm");
    const top = this.parseSeq(contPos, { kind: "none" }, ctx0);
    top.entry = { source: start, port: startItem.cont };
    top.ref = "top";
    return {
      start: startItem,
      top,
      nodes: this.nodes,
      extra: this.extra,
      loopNext: this.map.loopPorts.next
    };
  }
  place(id, item) {
    this.placed.set(id, item);
    this.ancestors.add(id);
  }
  position(edge) {
    return { t: edge.target, tp: edge.targetPort, src: edge.source, edge };
  }
  /** A continuation position as an arm's exit target. */
  targetOf(pos) {
    if (!pos) return { kind: "none" };
    if (this.isNext(pos.t, pos.tp)) return { kind: "next", loop: pos.t };
    return { kind: "node", id: pos.t };
  }
  child(ctx, T, kind, extraGuard = null) {
    const guards = extraGuard ? [...ctx.guards, extraGuard] : ctx.guards;
    return { depth: ctx.depth + 1, loops: ctx.loops, guards, targets: [...ctx.targets, T], kind };
  }
  afterGuard(T) {
    if (T.kind !== "node") return null;
    return { set: this.reach(T.id), tag: "after" };
  }
  /** The arms of an ordinary step (or a loop's other outputs, or Start's), each targeting `T`. */
  parseArms(id, T, ctx, kind) {
    const arms = [];
    for (const port of this.map.armPorts(this.typeOf(id))) {
      const es = this.outOf(id, port);
      if (es.length > 1) this.refuse("outline_two_continuations", id, this.name(id));
      const sub = this.child(ctx, T, "step", this.afterGuard(T));
      const seq = es.length ? this.parseSeq(this.position(es[0]), T, sub) : this.emptySeq(T, "open");
      seq.entry = { source: id, port };
      seq.ref = { arm: id, port };
      arms.push({ port, role: kind, seq });
    }
    return arms;
  }
  emptySeq(T, exit) {
    return { items: [], exit, T: T.kind === "node" ? { id: T.id } : T.kind === "next" ? { id: T.loop, next: true } : null };
  }
  /**
   * One Seq, from `pos` (the line into its first item, or null for a port
   * left unconnected) until it reaches `T`.
   */
  parseSeq(pos, T, ctx) {
    const seq = { items: [], exit: null, T: null };
    seq.T = T.kind === "node" ? { id: T.id } : T.kind === "next" ? { id: T.loop, next: true } : null;
    const added = [];
    let cur = pos;
    const finish = (exit, extra = {}) => {
      seq.exit = exit;
      Object.assign(seq, extra);
    };
    for (; ; ) {
      if (!cur) {
        const ownPortOpen = seq.items.length === 0 && ctx.kind === "step";
        finish(T.kind === "none" && !ownPortOpen ? "rejoin" : "open");
        break;
      }
      const { t, tp, src } = cur;
      if (cur.edge && this.isNext(t, tp)) this.returnsSeen.add(cur.edge);
      if (T.kind === "node" && t === T.id && !this.isNext(t, tp)) {
        finish("rejoin", { to: { id: t, port: tp } });
        break;
      }
      if (T.kind === "join" && this.kind(t) === "join" && !this.placed.has(t)) {
        finish("rejoin", { to: { id: t, port: tp }, join: t });
        break;
      }
      if (this.isNext(t, tp)) {
        if (T.kind === "next" && T.loop === t) {
          finish("rejoin", { to: { id: t, port: tp } });
          break;
        }
        if (ctx.loops[0] === t) {
          finish("next", { to: { id: t, port: tp }, loop: t });
          break;
        }
        if (ctx.loops.includes(t)) this.refuse("outline_loop_shape", ctx.loops[0], this.name(ctx.loops[0]));
        this.refuseWith("outline_loop_shape", "loopNextOutside", src, this.name(src), this.name(t));
      }
      for (const g of ctx.guards) {
        if (!g.set.has(t)) continue;
        if (g.tag === "leak") this.refuseWith("outline_loop_shape", "loopLeaks", g.loop, this.name(g.loop), this.name(t));
        this.refuse("outline_jump_out", src, this.name(src), this.name(t));
      }
      for (const target of ctx.targets) {
        if (target.kind === "node" && target.id === t) this.refuse("outline_jump_out", src, this.name(src), this.name(t));
      }
      if (this.placed.has(t)) {
        if (this.ancestors.has(t)) this.refuse("outline_cycle", src, this.name(src), this.name(t));
        this.refuse("outline_shared_step", t, this.name(t));
      }
      const k = this.kind(t);
      let next = null;
      if (k === "end") {
        const item = { kind: "end", id: t, input: tp };
        this.place(t, item);
        added.push(t);
        const leaving = this.out.get(t)[0];
        if (leaving) this.refuse("outline_after_end", t, this.name(t), this.name(leaving.target));
        seq.items.push(item);
        finish("end");
        break;
      } else if (k === "join") {
        this.refuse("outline_merge_unpaired", t, this.name(t));
      } else if (k === "start") {
        this.refuse("outline_two_starts", t);
      } else if (k === "branch") {
        next = this.parseBranch(t, tp, ctx, seq, added, T);
      } else if (k === "fanout") {
        next = this.parseFanout(t, tp, ctx, seq, added);
      } else if (k === "loop") {
        next = this.parseLoop(t, tp, ctx, seq, added);
      } else {
        next = this.parseStep(t, tp, ctx, seq, added);
      }
      cur = next;
    }
    for (const id of added) this.ancestors.delete(id);
    return seq;
  }
  parseStep(id, tp, ctx, seq, added) {
    const type = this.typeOf(id);
    const item = { kind: "step", id, input: tp, cont: this.map.cont(type), arms: [] };
    this.place(id, item);
    added.push(id);
    seq.items.push(item);
    const es = item.cont ? this.outOf(id, item.cont) : [];
    if (es.length > 1) this.refuse("outline_two_continuations", id, this.name(id));
    const contPos = es.length ? this.position(es[0]) : null;
    item.arms = this.parseArms(id, this.targetOf(contPos), ctx, "arm");
    return contPos;
  }
  parseBranch(id, tp, ctx, seq, added, seqT) {
    const item = { kind: "branch", id, input: tp, arms: [] };
    this.place(id, item);
    added.push(id);
    seq.items.push(item);
    const key = this.branchContinuation(id, seqT);
    const T = key === null ? { kind: "none" } : isE(key) ? { kind: "next", loop: loopOfE(key) } : { kind: "node", id: key };
    this.map.armPorts(this.typeOf(id)).forEach((port) => {
      const es = this.outOf(id, port);
      const sub = this.child(ctx, T, "branch", this.afterGuard(T));
      const armSeq = es.length ? this.parseSeq(this.position(es[0]), T, sub) : this.emptySeq(T, T.kind === "none" ? "rejoin" : "open");
      armSeq.entry = { source: id, port };
      armSeq.ref = { arm: id, port };
      item.arms.push({ port, role: "branch", seq: armSeq });
    });
    if (key === null) return null;
    if (isE(key)) return { t: loopOfE(key), tp: this.map.loopPorts.next, src: id, edge: null };
    return { t: key, tp: this.map.input(this.typeOf(key)), src: id, edge: null };
  }
  parseFanout(id, tp, ctx, seq, added) {
    const item = { kind: "fanout", id, input: tp, join: null, arms: [] };
    this.place(id, item);
    added.push(id);
    seq.items.push(item);
    const lines = this.out.get(id);
    if (!lines.length) this.refuse("outline_parallel_unjoined", id, this.name(id));
    const joins = /* @__PURE__ */ new Set();
    const armNodes = [];
    lines.forEach((e, i) => {
      const before = new Set(this.placed.keys());
      const sub = this.child(ctx, { kind: "join" }, "fanout");
      const armSeq = this.parseSeq(this.position(e), { kind: "join" }, sub);
      armSeq.entry = { source: id, port: e.sourcePort, line: i };
      armSeq.ref = { fanout: id, first: armSeq.items[0]?.id ?? null };
      if (armSeq.exit === "rejoin") joins.add(armSeq.join);
      for (const k of this.placed.keys()) if (!before.has(k)) armNodes.push(k);
      item.arms.push({ port: e.sourcePort, role: "fanout", seq: armSeq });
    });
    if (joins.size === 0 && item.arms.every((a) => a.seq.exit !== "rejoin")) return null;
    if (joins.size !== 1) this.refuse("outline_parallel_unjoined", id, this.name(id));
    const J = [...joins][0];
    const after = this.reach(J);
    for (const n of armNodes) {
      if (!after.has(n)) continue;
      const line = this.into.get(n).find((e) => armNodes.includes(e.source) && !after.has(e.source)) ?? this.into.get(n)[0];
      this.refuse("outline_jump_out", line.source, this.name(line.source), this.name(n));
    }
    const joinType = this.typeOf(J);
    item.join = { id: J, input: this.map.input(joinType), cont: this.map.cont(joinType) };
    for (const a of item.arms) a.seq.T = { id: J };
    for (const port of this.map.armPorts(joinType)) {
      const extra = this.outOf(J, port)[0];
      if (extra) this.refuse("outline_two_continuations", J, this.name(J));
    }
    this.place(J, item);
    added.push(J);
    const es = item.join.cont ? this.outOf(J, item.join.cont) : [];
    if (es.length > 1) this.refuse("outline_two_continuations", J, this.name(J));
    return es.length ? this.position(es[0]) : null;
  }
  parseLoop(id, tp, ctx, seq, added) {
    const ports = this.map.loopPorts;
    if (tp !== ports.entry && tp !== this.map.input(this.typeOf(id))) {
      this.refuseWith("outline_loop_shape", "loopEnteredByNext", id, this.name(id));
    }
    const item = { kind: "loop", id, input: tp, done: ports.done, body: null, arms: [] };
    this.place(id, item);
    added.push(id);
    seq.items.push(item);
    const doneEdges = this.outOf(id, ports.done);
    if (doneEdges.length > 1) this.refuse("outline_two_continuations", id, this.name(id));
    const donePos = doneEdges.length ? this.position(doneEdges[0]) : null;
    const doneKey = donePos ? this.keyOf(donePos.edge) : null;
    const bodyEdges = this.outOf(id, ports.body);
    if (bodyEdges.length > 1) this.refuse("outline_two_continuations", id, this.name(id));
    const T = { kind: "next", loop: id };
    const leak = doneKey === null ? null : { set: /* @__PURE__ */ new Set([doneKey, ...this.reach(doneKey)]), tag: "leak", loop: id };
    const sub = { ...this.child(ctx, T, "body", leak), loops: [id, ...ctx.loops] };
    const bodySeq = bodyEdges.length ? this.parseSeq(this.position(bodyEdges[0]), T, sub) : this.emptySeq(T, "open");
    bodySeq.entry = { source: id, port: ports.body };
    bodySeq.ref = { body: id };
    item.body = { port: ports.body, role: "body", seq: bodySeq };
    const returns = this.into.get(id).filter((e) => e.targetPort === ports.next);
    for (const r of returns) {
      if (!this.returnsSeen.has(r)) this.refuseWith("outline_loop_shape", "loopNextOutside", r.source, this.name(r.source), this.name(id));
    }
    if (bodySeq.items.length && !returns.length) this.refuse("outline_loop_shape", id, this.name(id));
    item.arms = this.parseArms(id, this.targetOf(donePos), ctx, "arm");
    return donePos;
  }
};
function graphFromOutline(tree) {
  const connections = [];
  const add = (source, sourcePort, to) => {
    if (to) connections.push({ source, target: to.id, sourcePort, targetPort: to.port });
  };
  const head = (item) => ({ id: item.id, port: item.input });
  const exitTo = (seq, T) => {
    if (seq.exit === "next") return seq.to;
    if (seq.exit !== "rejoin" || !T) return null;
    return seq.to && seq.to.id === T.id ? seq.to : T;
  };
  const emitArm = (owner, port, seq, T) => {
    if (!seq.items.length) {
      add(owner, port, exitTo(seq, T));
      return;
    }
    add(owner, port, head(seq.items[0]));
    emitSeq(seq, T);
  };
  const emitItem = (item, next) => {
    switch (item.kind) {
      case "start":
      case "step":
        if (item.cont) add(item.id, item.cont, next);
        for (const arm of item.arms) emitArm(item.id, arm.port, arm.seq, next);
        break;
      case "branch":
        for (const arm of item.arms) emitArm(item.id, arm.port, arm.seq, next);
        break;
      case "fanout":
        for (const arm of item.arms) {
          emitArm(item.id, arm.port, arm.seq, item.join ? { id: item.join.id, port: item.join.input } : null);
        }
        if (item.join?.cont) add(item.join.id, item.join.cont, next);
        break;
      case "loop":
        emitArm(item.id, item.body.port, item.body.seq, { id: item.id, port: tree.loopNext });
        add(item.id, item.done, next);
        for (const arm of item.arms) emitArm(item.id, arm.port, arm.seq, next);
        break;
      default:
        break;
    }
  };
  function emitSeq(seq, T) {
    seq.items.forEach((item, i) => {
      const next = i + 1 < seq.items.length ? head(seq.items[i + 1]) : exitTo(seq, T);
      emitItem(item, next);
    });
  }
  const top = tree.top;
  emitItem(tree.start, top.items.length ? head(top.items[0]) : exitTo(top, null));
  emitSeq(top, null);
  return {
    nodes: tree.nodes.map((n) => structuredClone(n)),
    connections: [...connections, ...tree.extra.map((c) => ({ ...c }))]
  };
}
function sameGraphAsSets(a, b) {
  const nodeKey = (n) => JSON.stringify(sorted(n));
  const lineKey = (c) => JSON.stringify([
    String(c.source),
    String(c.sourcePort || "out"),
    String(c.target),
    String(c.targetPort || "in")
  ]);
  const nodes = (g) => new Map((g?.nodes || []).map((n) => [String(n.id), nodeKey(n)]));
  const lines = (g) => new Set((g?.connections || []).map(lineKey));
  const na = nodes(a);
  const nb = nodes(b);
  if (na.size !== nb.size) return false;
  for (const [id, k] of na) if (nb.get(id) !== k) return false;
  const la = lines(a);
  const lb = lines(b);
  if (la.size !== lb.size) return false;
  for (const k of la) if (!lb.has(k)) return false;
  return true;
}
function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
  return v;
}
function indexTree(tree) {
  const at = /* @__PURE__ */ new Map();
  const seqs = [];
  const walkSeq = (seq, depth, path, owner, arm) => {
    seq.depth = depth;
    seqs.push({ seq, depth, path, owner, arm });
    seq.items.forEach((item, index) => {
      const place = { item, seq, index, arm, owner, depth, path };
      at.set(item.id, place);
      if (item.kind === "fanout" && item.join) at.set(item.join.id, { ...place, join: true });
      const inner = (a) => walkSeq(a.seq, depth + 1, [...path, { owner: item, arm: a }], item, a);
      if (item.kind === "loop") inner(item.body);
      for (const a of item.arms || []) inner(a);
    });
  };
  at.set(tree.start.id, { item: tree.start, seq: null, index: -1, arm: null, owner: null, depth: 0, path: [] });
  for (const a of tree.start.arms) walkSeq(a.seq, 1, [{ owner: tree.start, arm: a }], tree.start, a);
  walkSeq(tree.top, 0, [], null, null);
  return { at, seqs };
}
function subtreeIds(item) {
  const out = [item.id];
  if (item.kind === "fanout" && item.join) out.push(item.join.id);
  const seqIds = (seq) => seq.items.flatMap(subtreeIds);
  if (item.kind === "loop") out.push(...seqIds(item.body.seq));
  for (const a of item.arms || []) out.push(...seqIds(a.seq));
  return out;
}
function runOrder(tree) {
  const out = [tree.start.id];
  for (const a of tree.start.arms) out.push(...a.seq.items.flatMap(subtreeIds));
  out.push(...tree.top.items.flatMap(subtreeIds));
  return out;
}
function flatRunOrder(graph, catalogue, blocks = {}) {
  const map = createBlockMapping(blocks, catalogue);
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const ids = nodes.map((n) => String(n.id));
  const start = nodes.find((n) => map.kindOf(n.type) === "start");
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  if (start) {
    const queue = [String(start.id)];
    seen.add(String(start.id));
    while (queue.length) {
      const id = queue.shift();
      out.push(id);
      for (const c of graph.connections || []) {
        if (String(c.source) !== id) continue;
        const t = String(c.target);
        if (!seen.has(t) && ids.includes(t)) {
          seen.add(t);
          queue.push(t);
        }
      }
    }
  }
  for (const id of ids) if (!seen.has(id)) out.push(id);
  return out;
}
function describeOutline(tree) {
  const lines = [];
  const pad = (d) => "  ".repeat(d);
  const seq = (s, d) => {
    for (const item of s.items) itemLines(item, d);
    lines.push(`${pad(d)}= ${s.exit}`);
  };
  const arm = (a, d) => {
    lines.push(`${pad(d)}${a.role === "fanout" ? "branch" : a.role === "body" ? "body" : `arm ${a.port}`}`);
    seq(a.seq, d + 1);
  };
  function itemLines(item, d) {
    lines.push(`${pad(d)}${item.kind} ${item.id}${item.kind === "fanout" && item.join ? ` join ${item.join.id}` : ""}`);
    if (item.kind === "loop") arm(item.body, d + 1);
    for (const a of item.arms || []) arm(a, d + 1);
  }
  lines.push(`start ${tree.start.id}`);
  for (const a of tree.start.arms) arm(a, 1);
  seq(tree.top, 0);
  return lines;
}

// src/flow/outline/operations.js
var portOf2 = (c, side) => String((side === "source" ? c.sourcePort : c.targetPort) || (side === "source" ? "out" : "in"));
var sameRef = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var clone = (v) => structuredClone(v);
var OpRefusal = class extends Error {
};
function createOutlineOperations({ catalogue, blocks = {}, strings = null, references = {} } = {}) {
  const map = createBlockMapping(blocks, catalogue);
  const S = createStrings(OUTLINE_STRINGS, strings);
  const syntaxes = Object.values(references || {}).filter((x) => x && typeof x.rename === "function");
  const refuse = (reason) => {
    throw new OpRefusal(reason);
  };
  const nameOf2 = (graph, id) => displayName(graph.nodes.find((n) => n.id === id), catalogue) || String(id);
  function read(graph) {
    const r = outlineFromGraph(graph, catalogue, map, { strings });
    if (!r.ok) return { ok: false, refusal: r };
    return { ok: true, tree: r.tree, index: indexTree(r.tree), graph };
  }
  function seqOf(view, ref) {
    const { tree, index } = view;
    if (ref === "top") return tree.top;
    if (ref?.arm !== void 0) {
      const place = index.at.get(ref.arm);
      const arms = place?.item?.arms || [];
      return arms.find((a) => a.port === ref.port)?.seq ?? null;
    }
    if (ref?.body !== void 0) {
      const item = index.at.get(ref.body)?.item;
      return item?.kind === "loop" ? item.body.seq : null;
    }
    if (ref?.fanout !== void 0) {
      const item = index.at.get(ref.fanout)?.item;
      if (item?.kind !== "fanout") return null;
      return item.arms.find((a) => (a.seq.items[0]?.id ?? null) === (ref.first ?? null))?.seq ?? null;
    }
    return null;
  }
  function placeOf(view, id) {
    const p = view.index.at.get(id);
    if (!p || p.seq === null) return null;
    return p;
  }
  function locate(view, anchor) {
    if (!anchor) return null;
    if (anchor.before !== void 0 || anchor.after !== void 0) {
      const p = placeOf(view, anchor.before ?? anchor.after);
      if (!p || p.join) return p && p.join && anchor.after !== void 0 ? { seq: p.seq, index: p.index + 1 } : null;
      return { seq: p.seq, index: p.index + (anchor.after !== void 0 ? 1 : 0) };
    }
    if (anchor.into !== void 0) {
      const seq = seqOf(view, anchor.into);
      return seq ? { seq, index: 0 } : null;
    }
    return null;
  }
  function inputOf2(id, graph) {
    return map.input(graph.nodes.find((n) => n.id === id)?.type);
  }
  function exitTarget(seq, graph) {
    if (seq.exit === "next") return seq.to;
    if (seq.exit !== "rejoin" || !seq.T) return null;
    if (seq.to && seq.to.id === seq.T.id) return seq.to;
    return seq.T.next ? { id: seq.T.id, port: map.loopPorts.next } : { id: seq.T.id, port: inputOf2(seq.T.id, graph) };
  }
  function outsOf(item) {
    const rejoins = (arms) => arms.flatMap((a) => a.seq.exit !== "rejoin" ? [] : a.seq.items.length ? outsOf(a.seq.items[a.seq.items.length - 1]) : [a.seq.entry]);
    switch (item.kind) {
      case "start":
      case "step":
        return [...item.cont ? [{ source: item.id, port: item.cont }] : [], ...rejoins(item.arms)];
      case "loop":
        return [{ source: item.id, port: item.done }, ...rejoins(item.arms)];
      case "fanout":
        return item.join?.cont ? [{ source: item.join.id, port: item.join.cont }] : [];
      case "branch":
        return rejoins(item.arms);
      default:
        return [];
    }
  }
  function loopAround(view, seq) {
    const s = view.index.seqs.find((x) => x.seq === seq);
    if (!s) return null;
    for (let i = s.path.length - 1; i >= 0; i -= 1) if (s.path[i].arm.role === "body") return s.path[i].owner.id;
    return null;
  }
  function gapAt(view, seq, index) {
    const items = seq.items;
    const last = items[items.length - 1];
    let succ = index < items.length ? { id: items[index].id, port: items[index].input } : exitTarget(seq, view.graph);
    if (!succ && !items.length && seq.ref?.body !== void 0) succ = { id: seq.ref.body, port: map.loopPorts.next };
    const arriving = index === 0 ? [seq.entry] : outsOf(items[index - 1]);
    return {
      seq,
      index,
      succ,
      arriving,
      loop: loopAround(view, seq),
      afterEnd: index === items.length && last?.kind === "end",
      atEnd: index === items.length
    };
  }
  function addLine(graph, source, sourcePort, target, targetPort) {
    if (source === target) return;
    if (graph.connections.some((c) => c.source === source && portOf2(c, "source") === sourcePort && c.target === target && portOf2(c, "target") === targetPort)) return;
    graph.connections.push({ source, target, sourcePort, targetPort });
  }
  function dropLine(graph, source, sourcePort, to) {
    graph.connections = graph.connections.filter((c) => !(c.source === source && portOf2(c, "source") === sourcePort && (!to || c.target === to.id && portOf2(c, "target") === to.port)));
  }
  function splice(graph, gap, frag) {
    if (gap.afterEnd) refuse(say(S, "nothingAfterEnd", nameOf2(graph, gap.seq.items[gap.seq.items.length - 1].id)));
    if (!gap.arriving.length) {
      const prev = gap.seq.items[gap.index - 1];
      refuse(say(S, "unreachableHere", prev ? nameOf2(graph, prev.id) : ""));
    }
    const goesOn = frag.exits.some((x) => x.kind === "cont");
    if (!goesOn && !gap.atEnd) {
      refuse(say(S, frag.endsHere ? "endNotLast" : "endsNotLast", nameOf2(graph, frag.head.id)));
    }
    if (!goesOn && gap.succ && !gap.addOnly) {
      const from = new Set(gap.arriving.map((a) => `${a.source}\0${a.port}`));
      const others = graph.connections.filter((c) => c.target === gap.succ.id && portOf2(c, "target") === gap.succ.port && !from.has(`${c.source}\0${portOf2(c, "source")}`));
      if (!others.length) refuse(say(S, "wouldOrphan", nameOf2(graph, gap.succ.id)));
    }
    if (frag.exits.some((x) => x.kind === "next") && !gap.loop) refuse(say(S, "nextOutsideLoop", nameOf2(graph, frag.head.id)));
    if (gap.loop) {
      const end = frag.ids.find((id) => map.kindOf(graph.nodes.find((n) => n.id === id)?.type) === "end");
      if (end) refuse(say(S, "endInLoop", nameOf2(graph, end), nameOf2(graph, gap.loop)));
    }
    for (const a of gap.arriving) {
      if (gap.succ && !gap.addOnly) dropLine(graph, a.source, a.port, gap.succ);
      addLine(graph, a.source, a.port, frag.head.id, frag.head.input);
    }
    for (const x of frag.exits) {
      const to = x.kind === "next" ? { id: gap.loop, port: map.loopPorts.next } : gap.succ;
      if (to) addLine(graph, x.source, x.port, to.id, to.port);
    }
    for (const l of frag.internal) addLine(graph, l.source, portOf2(l, "source"), l.target, portOf2(l, "target"));
  }
  function freshFragment(graph, typeId) {
    const type = catalogue.get(typeId);
    if (!type) refuse(say(S, "outline_unknown_type", typeId));
    if (type.unavailable) refuse(String(type.unavailable));
    const kind = map.kindOf(typeId);
    if (kind === "start" || kind === "join") refuse(say(S, "outline_unknown_type", typeId));
    const node = addNode(graph, typeId, null, { catalogue });
    const head = { id: node.id, input: map.input(typeId) };
    const exit = (port) => ({ source: node.id, port, kind: "cont" });
    switch (kind) {
      case "end":
        return { head, exits: [], internal: [], ids: [node.id], endsHere: true };
      case "branch":
        return { head, exits: map.armPorts(typeId).map(exit), internal: [], ids: [node.id] };
      case "loop":
        return { head, exits: [exit(map.loopPorts.done)], internal: [], ids: [node.id] };
      case "fanout": {
        const joinType = map.joinType();
        if (!joinType) refuse(say(S, "noJoinType"));
        const join = addNode(graph, joinType, null, { catalogue });
        const out = catalogue.outputs(typeId, { flow: true })[0]?.name ?? "out";
        return {
          head,
          ids: [node.id, join.id],
          internal: [{ source: node.id, sourcePort: out, target: join.id, targetPort: map.input(joinType) }],
          exits: [{ source: join.id, port: map.cont(joinType), kind: "cont" }]
        };
      }
      default:
        return { head, exits: map.cont(typeId) ? [exit(map.cont(typeId))] : [], internal: [], ids: [node.id] };
    }
  }
  function fragmentOf(view, id) {
    const place = placeOf(view, id);
    if (!place) refuse(say(S, "outline_unreachable", nameOf2(view.graph, id)));
    const item = place.item;
    const ids = subtreeIds(item);
    const inside = new Set(ids);
    const internal = view.graph.connections.filter((c) => inside.has(c.source) && inside.has(c.target));
    const exits = outsOf(item).map((o) => ({ ...o, kind: "cont" }));
    const walk = (seq) => {
      if (seq.exit === "next" && !inside.has(seq.loop)) {
        const outs = seq.items.length ? outsOf(seq.items[seq.items.length - 1]) : [seq.entry];
        for (const o of outs) exits.push({ ...o, kind: "next" });
      }
      for (const it of seq.items) {
        if (it.kind === "loop") walk(it.body.seq);
        for (const a of it.arms || []) walk(a.seq);
      }
    };
    if (item.kind === "loop") walk(item.body.seq);
    for (const a of item.arms || []) walk(a.seq);
    return {
      head: { id: item.id, input: item.input },
      ids,
      internal: internal.map(clone),
      exits,
      endsHere: item.kind === "end",
      kind: item.kind,
      item,
      place,
      nodes: view.graph.nodes.filter((n) => inside.has(n.id)).map(clone)
    };
  }
  function detach(graph, view, id, { drop = false } = {}) {
    const frag = fragmentOf(view, id);
    const { seq, index } = frag.place;
    const before = gapAt(view, seq, index);
    const after = gapAt(view, seq, index + 1);
    const inside = new Set(frag.ids);
    graph.connections = graph.connections.filter((c) => {
      const a = inside.has(c.source);
      const b = inside.has(c.target);
      return drop ? !a && !b : a === b;
    });
    if (drop) graph.nodes = graph.nodes.filter((n) => !inside.has(n.id));
    for (const a of before.arriving) {
      if (after.succ && !(after.succ.id === a.source)) addLine(graph, a.source, a.port, after.succ.id, after.succ.port);
    }
    return frag;
  }
  function without(graph, ids) {
    const out = new Set(ids);
    return {
      nodes: graph.nodes.filter((n) => !out.has(n.id)),
      connections: graph.connections.filter((c) => !out.has(c.source) && !out.has(c.target))
    };
  }
  function freshCopy(graph, frag) {
    const taken = new Set(graph.nodes.map((n) => n.id));
    const ids = /* @__PURE__ */ new Map();
    for (const n of frag.nodes) {
      const base = String(n.id).replace(/-\d+$/, "") || "step";
      let id = base;
      for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;
      taken.add(id);
      ids.set(n.id, id);
    }
    const rename = (v) => {
      if (typeof v === "string") return syntaxes.reduce((text, s) => s.rename(text, ids), v);
      if (Array.isArray(v)) return v.map(rename);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rename(x)]));
      return v;
    };
    for (const n of frag.nodes) {
      graph.nodes.push({
        ...clone(n),
        id: ids.get(n.id),
        config: rename(clone(n.config ?? {})),
        position: { x: 0, y: 0 }
      });
    }
    const m = (id) => ids.get(id) ?? id;
    return {
      head: { id: m(frag.head.id), input: frag.head.input },
      ids: frag.ids.map(m),
      internal: frag.internal.map((c) => ({ ...c, source: m(c.source), target: m(c.target) })),
      exits: frag.exits.map((x) => ({ ...x, source: m(x.source) })),
      endsHere: frag.endsHere
    };
  }
  function attempt(graph, fn) {
    const g = clone(graph);
    g.nodes = Array.isArray(g.nodes) ? g.nodes : [];
    g.connections = Array.isArray(g.connections) ? g.connections : [];
    const view = read(g);
    if (!view.ok) return { ok: false, reason: view.refusal.message };
    try {
      const select = fn(g, view);
      const check = read(g);
      if (!check.ok) return { ok: false, reason: say(S, "notBlockShaped", check.refusal.message) };
      return { ok: true, graph: g, select: select ?? null, view: check };
    } catch (err) {
      if (err instanceof OpRefusal) return { ok: false, reason: err.message };
      throw err;
    }
  }
  function canonical(view, seq, index) {
    for (; ; ) {
      const prev = seq.items[index - 1];
      if (!prev || prev.kind !== "branch" || index !== seq.items.length) return { seq, index };
      const live = prev.arms.filter((a) => a.seq.exit !== "rejoin" ? false : a.seq.items.length ? outsOf(a.seq.items[a.seq.items.length - 1]).length > 0 : true);
      if (live.length !== 1) return { seq, index };
      seq = live[0].seq;
      index = seq.items.length;
    }
  }
  function gapFor(view, anchor) {
    const at = locate(view, anchor);
    if (!at) refuse(say(S, "dropNowhere"));
    const c = canonical(view, at.seq, at.index);
    return gapAt(view, c.seq, c.index);
  }
  function insideOf(view, id, anchor) {
    const ids = new Set(subtreeIds(placeOf(view, id).item));
    const refIds = [anchor.before, anchor.after, anchor.into?.arm, anchor.into?.body, anchor.into?.fanout].filter((x) => x !== void 0);
    return refIds.some((x) => ids.has(x) && !(x === id && (anchor.before !== void 0 || anchor.after !== void 0)));
  }
  const ops = {
    map,
    strings: S,
    read,
    locate,
    gapAt,
    outsOf,
    fragmentOf,
    /** Insert a new step of `typeId` (a block's steps, for a block) at `anchor`. */
    insert(graph, anchor, typeId) {
      return attempt(graph, (g, view) => {
        const gap = gapFor(view, anchor);
        const frag = freshFragment(g, typeId);
        splice(g, gap, frag);
        return frag.head.id;
      });
    },
    /** Remove a step and everything inside it. */
    remove(graph, id) {
      return attempt(graph, (g, view) => {
        const place = placeOf(view, id);
        if (!place) refuse(say(S, "outline_unreachable", nameOf2(g, id)));
        const { seq, index } = place;
        const holder = view.index.seqs.find((x) => x.seq === seq);
        if (holder?.arm?.role === "fanout" && seq.items.length === 1 && !holder.owner.join && holder.owner.arms.length === 1) refuse(say(S, "lastBranch", nameOf2(g, holder.owner.id)));
        const nextId2 = seq.items[index + 1]?.id ?? seq.items[index - 1]?.id ?? view.index.seqs.find((x) => x.seq === seq)?.owner?.id ?? null;
        detach(g, view, place.item.id, { drop: true });
        return nextId2;
      });
    },
    /** Move a step (with what is inside it) to `anchor`, keeping its id. */
    move(graph, id, anchor) {
      return attempt(graph, (g, view) => {
        const place = placeOf(view, id);
        if (!place) refuse(say(S, "outline_unreachable", nameOf2(g, id)));
        const itemId = place.item.id;
        if (insideOf(view, itemId, anchor)) refuse(say(S, "intoItself", nameOf2(g, itemId)));
        const frag = detach(g, view, itemId);
        const lifted = read(without(g, frag.ids));
        if (!lifted.ok) refuse(lifted.refusal.message);
        splice(g, gapFor({ ...lifted, graph: g }, anchor), frag);
        return itemId;
      });
    },
    moveUp(graph, id) {
      const view = read(graph);
      if (!view.ok) return { ok: false, reason: view.refusal.message };
      const p = placeOf(view, id);
      if (!p) return { ok: false, reason: say(S, "readOnlyRefusal") };
      if (p.index === 0) return { ok: false, reason: say(S, "alreadyFirst", seqName(view, p.seq)) };
      return ops.move(graph, id, { before: p.seq.items[p.index - 1].id });
    },
    moveDown(graph, id) {
      const view = read(graph);
      if (!view.ok) return { ok: false, reason: view.refusal.message };
      const p = placeOf(view, id);
      if (!p) return { ok: false, reason: say(S, "readOnlyRefusal") };
      const items = p.seq.items;
      if (p.index >= items.length - 1) return { ok: false, reason: say(S, "alreadyLast", seqName(view, p.seq)) };
      const anchor = p.index + 2 < items.length ? { before: items[p.index + 2].id } : { after: items[p.index + 1].id };
      return ops.move(graph, id, anchor);
    },
    moveOut(graph, id) {
      const view = read(graph);
      if (!view.ok) return { ok: false, reason: view.refusal.message };
      const p = placeOf(view, id);
      if (!p) return { ok: false, reason: say(S, "readOnlyRefusal") };
      if (!p.owner || p.owner.kind === "start") return { ok: false, reason: say(S, "alreadyTop") };
      return ops.move(graph, id, { after: p.owner.id });
    },
    /** Wrap a step in a new block of `typeId`: it becomes the block's first arm (or its body). */
    wrap(graph, id, typeId) {
      return attempt(graph, (g, view) => {
        const place = placeOf(view, id);
        if (!place) refuse(say(S, "outline_unreachable", nameOf2(g, id)));
        const itemId = place.item.id;
        const { seq, index } = place;
        const emptyRef = seq.ref?.fanout !== void 0 ? { fanout: seq.ref.fanout, first: null } : seq.ref;
        const anchor = index > 0 ? { after: seq.items[index - 1].id } : seq.items[index + 1] ? { before: seq.items[index + 1].id } : { into: emptyRef };
        const frag = detach(g, view, itemId);
        const lifted = read(without(g, frag.ids));
        if (!lifted.ok) refuse(lifted.refusal.message);
        const kind = map.kindOf(typeId);
        if (!["branch", "loop", "fanout"].includes(kind)) refuse(say(S, "outline_unknown_type", typeId));
        const goesOn = frag.exits.some((x) => x.kind === "cont");
        if (kind === "loop" && !goesOn) refuse(say(S, "wrapLoopNeverReturns", nameOf2(g, itemId)));
        const block = freshFragment(g, typeId);
        if (kind === "fanout" && !goesOn) {
          const join = block.ids[1];
          g.nodes = g.nodes.filter((n) => n.id !== join);
          block.ids = [block.ids[0]];
          block.internal = [];
          block.exits = [];
        }
        splice(g, gapFor({ ...lifted, graph: g }, anchor), block);
        const withBlock = read(without(g, frag.ids));
        if (!withBlock.ok) refuse(withBlock.refusal.message);
        const inner = kind === "branch" ? { arm: block.head.id, port: map.armPorts(typeId)[0] } : kind === "loop" ? { body: block.head.id } : { fanout: block.head.id, first: null };
        if (kind === "fanout" && !block.exits.length) {
          const port = catalogue.outputs(typeId, { flow: true })[0]?.name ?? "out";
          splice(g, {
            seq: { items: [] },
            index: 0,
            arriving: [{ source: block.head.id, port }],
            succ: null,
            loop: loopAround(withBlock, withBlock.index.at.get(block.head.id).seq),
            atEnd: true,
            afterEnd: false
          }, frag);
          return block.head.id;
        }
        splice(g, gapFor({ ...withBlock, graph: g }, { into: inner }), frag);
        return block.head.id;
      });
    },
    /** A copy of a step (and what is inside it) right after it. */
    duplicate(graph, id) {
      return attempt(graph, (g, view) => {
        const frag = fragmentOf(view, id);
        if (frag.endsHere) refuse(say(S, "nothingAfterEnd", nameOf2(g, frag.head.id)));
        const copy = freshCopy(g, frag);
        splice(g, gapFor(view, { after: frag.head.id }), copy);
        return copy.head.id;
      });
    },
    /** What Copy keeps: a step's fragment, as plain data. */
    copy(graph, id) {
      const view = read(graph);
      if (!view.ok) return null;
      try {
        const f = fragmentOf(view, id);
        return {
          head: f.head,
          ids: f.ids,
          internal: f.internal,
          exits: f.exits,
          endsHere: f.endsHere,
          nodes: f.nodes,
          label: displayName(f.nodes[0], catalogue),
          kind: f.kind
        };
      } catch (err) {
        if (err instanceof OpRefusal) return null;
        throw err;
      }
    },
    /** Paste a copied fragment at `anchor`, under new ids. */
    paste(graph, anchor, copied) {
      if (!copied) return { ok: false, reason: say(S, "nothingCopied") };
      return attempt(graph, (g, view) => {
        const gap = gapFor(view, anchor);
        const copy = freshCopy(g, copied);
        splice(g, gap, copy);
        return copy.head.id;
      });
    },
    /** An ordinary step's arm port: connected straight to the step's continuation, or not at all. */
    setArm(graph, id, port, connected) {
      return attempt(graph, (g, view) => {
        const place = placeOf(view, id);
        const arm = place?.item?.arms?.find((a) => a.port === port);
        if (!arm) refuse(say(S, "outline_unknown_port", nameOf2(g, id), port));
        if (connected) {
          if (arm.seq.exit !== "open" || arm.seq.items.length) return id;
          const after = gapAt(view, place.seq, place.index + 1).succ;
          if (!after) refuse(say(S, "armNoContinuation", nameOf2(g, id)));
          addLine(g, id, port, after.id, after.port);
        } else {
          const inside = new Set(arm.seq.items.flatMap(subtreeIds));
          g.nodes = g.nodes.filter((n) => !inside.has(n.id));
          g.connections = g.connections.filter((c) => !inside.has(c.source) && !inside.has(c.target) && !(c.source === id && portOf2(c, "source") === port));
        }
        return id;
      });
    },
    /** Where an arm inside a loop goes after its steps: on with the step after, or the loop's next item. */
    setArmExit(graph, id, port, exit) {
      return attempt(graph, (g, view) => {
        const place = placeOf(view, id);
        const arm = place?.item?.arms?.find((a) => a.port === port);
        if (!arm || !["rejoin", "next"].includes(arm.seq.exit)) refuse(say(S, "readOnlyRefusal"));
        if (arm.seq.exit === exit) return id;
        const loop = loopAround(view, place.seq);
        const cont = gapAt(view, place.seq, place.index + 1).succ;
        if (!loop || !cont) refuse(say(S, "nextOutsideLoop", nameOf2(g, id)));
        const from = exit === "next" ? cont : { id: loop, port: map.loopPorts.next };
        const to = exit === "next" ? { id: loop, port: map.loopPorts.next } : cont;
        const outs = arm.seq.items.length ? outsOf(arm.seq.items[arm.seq.items.length - 1]) : [arm.seq.entry];
        for (const o of outs) {
          dropLine(g, o.source, o.port, from);
          addLine(g, o.source, o.port, to.id, to.port);
        }
        return id;
      });
    },
    /** A new branch of a parallel step, holding one new step of `typeId`. */
    addBranch(graph, fanoutId, typeId) {
      return attempt(graph, (g, view) => {
        const item = placeOf(view, fanoutId)?.item;
        if (item?.kind !== "fanout") refuse(say(S, "readOnlyRefusal"));
        const port = catalogue.outputs(g.nodes.find((n) => n.id === fanoutId).type, { flow: true })[0]?.name ?? "out";
        const frag = freshFragment(g, typeId);
        const gap = {
          seq: { items: [] },
          index: 0,
          arriving: [{ source: fanoutId, port }],
          loop: loopAround(view, placeOf(view, fanoutId).seq),
          succ: item.join ? { id: item.join.id, port: item.join.input } : null,
          atEnd: true,
          afterEnd: false,
          // the parallel's other lines out stay: a new branch is one more of them
          addOnly: true
        };
        splice(g, gap, frag);
        return frag.head.id;
      });
    },
    /** Remove one branch of a parallel step and everything in it. */
    removeBranch(graph, fanoutId, armIndex) {
      return attempt(graph, (g, view) => {
        const item = placeOf(view, fanoutId)?.item;
        if (item?.kind !== "fanout") refuse(say(S, "readOnlyRefusal"));
        if (item.arms.length <= 1) refuse(say(S, "lastBranch", nameOf2(g, fanoutId)));
        const arm = item.arms[armIndex];
        if (!arm) refuse(say(S, "readOnlyRefusal"));
        if (item.join && !item.arms.some((a, i) => i !== armIndex && a.seq.exit === "rejoin")) {
          refuse(say(S, "branchToJoinNeeded", nameOf2(g, fanoutId), nameOf2(g, item.join.id)));
        }
        const inside = new Set(arm.seq.items.flatMap(subtreeIds));
        const first = arm.seq.items[0];
        g.nodes = g.nodes.filter((n) => !inside.has(n.id));
        g.connections = g.connections.filter((c) => !inside.has(c.source) && !inside.has(c.target) && !(c.source === fanoutId && portOf2(c, "source") === arm.port && (first ? c.target === first.id : c.target === item.join?.id)));
        return fanoutId;
      });
    },
    /** The parallel's join setting (`all` / `any`), written to its join step's config. */
    setJoin(graph, fanoutId, value) {
      return attempt(graph, (g, view) => {
        const item = placeOf(view, fanoutId)?.item;
        if (item?.kind !== "fanout" || !item.join) refuse(say(S, "readOnlyRefusal"));
        const node = g.nodes.find((n) => n.id === item.join.id);
        node.config = { ...node.config || {}, [map.joinField]: value };
        return fanoutId;
      });
    },
    /** Is the anchor somewhere `id` could be moved to? (A drag's drop targets ask.) */
    canMoveTo(view, id, anchor) {
      return !insideOf(view, placeOf(view, id)?.item?.id ?? id, anchor);
    }
  };
  function armWords(graph, owner, arm, i) {
    const node = graph.nodes.find((n) => n.id === owner.id);
    if (arm.role === "body") return displayName(node, catalogue);
    if (arm.role === "fanout") return map.fanoutArmLabel(i + 1);
    if (owner.kind === "branch") return map.branchArmLabel(node, arm.port);
    return map.armLabel(node, arm.port);
  }
  function pathWords(view, seq) {
    const s = view.index.seqs.find((x) => x.seq === seq);
    if (!s) return [];
    const out = [];
    for (const step of s.path) {
      const i = step.owner.arms ? step.owner.arms.indexOf(step.arm) : -1;
      if (step.arm.role === "body") out.push(displayName(view.graph.nodes.find((n) => n.id === step.owner.id), catalogue));
      else {
        out.push(displayName(view.graph.nodes.find((n) => n.id === step.owner.id), catalogue));
        out.push(armWords(view.graph, step.owner, step.arm, i));
      }
    }
    return out;
  }
  function seqName(view, seq) {
    if (seq === view.tree.top) return say(S, "theTopLevel");
    const s = view.index.seqs.find((x) => x.seq === seq);
    if (!s) return "";
    const last = s.path[s.path.length - 1];
    const i = last.owner.arms ? last.owner.arms.indexOf(last.arm) : -1;
    return armWords(view.graph, last.owner, last.arm, i);
  }
  ops.whereText = (view, id) => {
    const p = view.index.at.get(id);
    if (!p || !p.seq) return "";
    if (p.seq === view.tree.top) {
      const items = p.seq.items;
      if (items.length > 1 && p.index === 0) return say(S, "topLevelFirst");
      if (items.length > 1 && p.index === items.length - 1) return say(S, "topLevelLast");
      return say(S, "topLevel");
    }
    return say(S, "insidePath", pathWords(view, p.seq).join(say(S, "pathJoin")));
  };
  ops.gapWords = (view, seq, index) => {
    const where = seq === view.tree.top ? say(S, "gapTop") : say(S, "gapInside", pathWords(view, seq).join(say(S, "pathJoin")));
    const prev = seq.items[index - 1];
    const next = seq.items[index];
    if (prev) return say(S, "gapAfter", where, nameOf2(view.graph, prev.id));
    if (next) return say(S, "gapBefore", where, nameOf2(view.graph, next.id));
    return say(S, "gapFirst", where);
  };
  ops.dropWords = (view, seq, index) => {
    const where = seq === view.tree.top ? say(S, "dropTop") : say(S, "dropInto", seqName(view, seq));
    const next = seq.items[index];
    const prev = seq.items[index - 1];
    const at = next ? say(S, "dropBefore", nameOf2(view.graph, next.id)) : prev ? say(S, "dropAfter", nameOf2(view.graph, prev.id)) : say(S, "dropFirst");
    return say(S, "dropLabel", where, at);
  };
  ops.resolve = (view, anchor) => {
    const at = locate(view, anchor);
    return at ? canonical(view, at.seq, at.index) : null;
  };
  ops.isCanonical = (view, seq, index) => {
    const c = canonical(view, seq, index);
    return c.seq === seq && c.index === index;
  };
  ops.seqName = seqName;
  ops.armWords = armWords;
  ops.anchorOf = (seq, index) => {
    if (index < seq.items.length) return { before: seq.items[index].id };
    if (index > 0) return { after: seq.items[index - 1].id };
    return { into: seq.ref };
  };
  ops.sameRef = sameRef;
  ops.loopAround = loopAround;
  return ops;
}

// src/flow/outline/menu.js
function openStepMenu({ anchor, label, items, strings = null, onClose = null }) {
  const S = createStrings(OUTLINE_STRINGS, strings);
  const root = el("div", "twm-flow-outline__menu-list");
  root.setAttribute("role", "menu");
  root.setAttribute("aria-label", label || "");
  root.id = uid("outline-menu");
  let sub = null;
  function build(list, host, depth) {
    const rows = [];
    for (const it of list) {
      if (it.separator) {
        const sep = el("div", "twm-flow-outline__menu-sep");
        sep.setAttribute("role", "separator");
        host.appendChild(sep);
        continue;
      }
      const b = el("button", `twm-flow-outline__menu-item${it.danger ? " twm-flow-outline__menu-item--danger" : ""}`);
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.dataset.item = it.id ?? "";
      b.tabIndex = -1;
      const words3 = el("span", "twm-flow-outline__menu-words");
      if (it.icon) {
        const chip = el("span", `twm-flow-outline__menu-chip ${toneClass("twm-flow-outline__menu-chip", it.tone)}`);
        chip.appendChild(icon(it.icon));
        words3.appendChild(chip);
      }
      words3.appendChild(el(
        "span",
        "twm-flow-outline__menu-label",
        it.refusal ? say(S, "refusedLine", it.label, it.refusal) : it.label
      ));
      b.appendChild(words3);
      if (it.items) {
        b.setAttribute("aria-haspopup", "menu");
        b.setAttribute("aria-expanded", "false");
        b.appendChild(icon("chevron_right", "twm-flow-outline__menu-key"));
      } else if (it.keys) {
        b.appendChild(el("span", "twm-flow-outline__menu-key", it.keys));
      }
      if (it.refusal) {
        b.disabled = true;
        b.setAttribute("aria-disabled", "true");
      }
      b.addEventListener("mousedown", (ev) => ev.preventDefault());
      b.addEventListener("click", () => {
        if (b.disabled) return;
        if (it.items) {
          openSub(b, it);
          return;
        }
        handle.close("chosen");
        it.run?.();
      });
      b.addEventListener("mouseenter", () => {
        if (b.disabled) return;
        if (depth === 0 && sub && sub.owner !== b) closeSub();
        b.focus({ preventScroll: true });
      });
      host.appendChild(b);
      rows.push(b);
    }
    return rows;
  }
  function enabled(container) {
    return [...container.querySelectorAll(':scope > [role="menuitem"]')].filter((b) => !b.disabled);
  }
  function openSub(owner, it) {
    if (sub?.owner === owner) {
      enabled(sub.el)[0]?.focus({ preventScroll: true });
      return;
    }
    closeSub();
    const box = el("div", "twm-flow-outline__menu-list twm-flow-outline__menu-sub");
    box.setAttribute("role", "menu");
    box.setAttribute("aria-label", it.label);
    build(it.items, box, 1);
    owner.setAttribute("aria-expanded", "true");
    owner.classList.add("twm-flow-outline__menu-item--open");
    owner.after(box);
    box.style.top = `${owner.offsetTop}px`;
    sub = { owner, el: box };
    enabled(box)[0]?.focus({ preventScroll: true });
  }
  function closeSub() {
    if (!sub) return;
    sub.owner.setAttribute("aria-expanded", "false");
    sub.owner.classList.remove("twm-flow-outline__menu-item--open");
    const owner = sub.owner;
    sub.el.remove();
    sub = null;
    return owner;
  }
  build(items, root, 0);
  root.addEventListener("keydown", (ev) => {
    const inSub = sub && sub.el.contains(document.activeElement);
    const box = inSub ? sub.el : root;
    const list = enabled(box);
    const at = list.indexOf(document.activeElement);
    const go = (i) => {
      ev.preventDefault();
      list[Math.max(0, Math.min(list.length - 1, i))]?.focus({ preventScroll: true });
    };
    switch (ev.key) {
      case "ArrowDown":
        go(at < 0 ? 0 : at + 1);
        break;
      case "ArrowUp":
        go(at < 0 ? list.length - 1 : at - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(list.length - 1);
        break;
      case "ArrowRight": {
        const b = document.activeElement;
        if (!inSub && b?.getAttribute("aria-haspopup") === "menu" && !b.disabled) {
          ev.preventDefault();
          b.click();
        }
        break;
      }
      case "ArrowLeft":
        if (inSub) {
          ev.preventDefault();
          closeSub()?.focus({ preventScroll: true });
        }
        break;
      case "Escape":
        if (inSub) {
          ev.preventDefault();
          ev.stopPropagation();
          closeSub()?.focus({ preventScroll: true });
        }
        break;
      case "Tab":
        ev.preventDefault();
        break;
      default:
        break;
    }
  });
  const handle = openPopover({
    anchor,
    content: root,
    label: label || "",
    className: "twm-flow-popover--menu",
    focus: enabled(root)[0] || root,
    onClose: () => onClose?.()
  });
  return { el: root, close: () => handle.close("closed"), toggled: handle.toggled };
}

// src/flow/outline/editor.js
var OUTLINE_ACTIONS = Object.freeze([
  "flow:step:add",
  "flow:step:remove",
  "flow:step:move",
  "flow:step:wrap",
  "flow:step:duplicate",
  "flow:step:paste",
  "flow:step:label",
  "flow:step:config",
  "flow:arm",
  "flow:branch:add",
  "flow:branch:remove",
  "flow:settings"
]);
var OUTLINE_INDENT = 22;
var DRAG_START_PX = 4;
var CLIPBOARD = null;
function createOutlineEditor(host, options = {}) {
  const {
    catalogue,
    widgets,
    references = {},
    blocks = {},
    values = null,
    valuesNote = null,
    summarise = null,
    summariseReads = null,
    flowSettings = null,
    readOnly = false,
    actions = [],
    slots = {},
    strings = null,
    services = null,
    onChange = null,
    onSelect = null,
    onFoldChange = null,
    initialFolds = [],
    history: historyOptions = {}
  } = options;
  if (!catalogue?.get) throw new Error("createOutlineEditor needs a step catalogue (createStepCatalogue()).");
  if (!widgets?.get) throw new Error("createOutlineEditor needs a widget registry (createWidgetRegistry()).");
  const S = createStrings(OUTLINE_STRINGS, strings);
  const map = createBlockMapping(blocks, catalogue);
  const ops = createOutlineOperations({ catalogue, blocks: map, strings, references });
  let graph = emptyGraph();
  let settings = flowSettings ? { ...flowSettings, value: structuredClone(flowSettings.value ?? {}) } : null;
  let view = null;
  let refusal = null;
  let consumerRO = readOnly || false;
  let selected = "flow";
  const folds = new Set(Array.isArray(initialFolds) ? initialFolds : []);
  let findings = [];
  let overlay = null;
  let findText = "";
  let destroyed = false;
  let drag = null;
  const actionState = /* @__PURE__ */ new Map();
  const itemEls = /* @__PURE__ */ new Map();
  const nodeOf = (id) => graph.nodes.find((n) => n.id === id) ?? null;
  const typeOf = (id) => catalogue.get(nodeOf(id)?.type) ?? null;
  const nameOf2 = (id) => id ? displayName(nodeOf(id), catalogue) || String(id) : say(S, "theFlow");
  const editable = () => !refusal && !consumerRO;
  const roReason = () => refusal ? say(S, "readOnlyBecause", refusal.message) : consumerRO && typeof consumerRO === "object" && consumerRO.reason ? String(consumerRO.reason) : "";
  const startId = () => graph.nodes.find((n) => map.kindOf(n.type) === "start")?.id ?? null;
  const root = el("div", "twm-flow-outline");
  root.tabIndex = -1;
  const toolbar = el("div", "twm-flow-outline__toolbar");
  toolbar.setAttribute("role", "toolbar");
  const undoBtn = button({ label: say(S, "undo"), icon: "undo", title: say(S, "undoTitle"), className: "twm-flow-outline__tool" });
  const redoBtn = button({ label: say(S, "redo"), icon: "redo", title: say(S, "redoTitle"), className: "twm-flow-outline__tool" });
  undoBtn.dataset.action = "undo";
  redoBtn.dataset.action = "redo";
  undoBtn.addEventListener("click", () => api.undo());
  redoBtn.addEventListener("click", () => api.redo());
  toolbar.append(undoBtn, redoBtn);
  const actionEls = /* @__PURE__ */ new Map();
  if (actions.length) {
    const sep = el("span", "twm-flow-outline__sep");
    sep.setAttribute("aria-hidden", "true");
    toolbar.appendChild(sep);
  }
  for (const a of actions) {
    const wrap = el("span", "twm-flow-outline__tool-wrap");
    const b = button({
      label: a.label,
      icon: a.icon || null,
      primary: Boolean(a.primary),
      className: "twm-flow-outline__tool"
    });
    b.dataset.action = a.id;
    b.addEventListener("click", () => {
      if (!b.disabled) a.run?.(api);
    });
    const why = el("span", "twm-flow-outline__refusal");
    why.hidden = true;
    wrap.append(b, why);
    toolbar.appendChild(wrap);
    actionEls.set(a.id, { button: b, why });
  }
  const statusEl = el("span", "twm-flow-outline__status");
  statusEl.setAttribute("aria-live", "polite");
  const spacer = el("span", "twm-flow-outline__spacer");
  const toolbarEnd = el("div", "twm-flow-outline__toolbar-end");
  toolbar.append(statusEl, spacer, toolbarEnd);
  const roBanner = el("div", "twm-flow-outline__readonly");
  roBanner.setAttribute("role", "status");
  roBanner.hidden = true;
  const strip = createFindingsStrip({
    strings: S,
    nameOf: (id) => nameOf2(id),
    onGoTo: (f) => goTo(f)
  });
  const runBanner = el("div", "twm-flow-outline__banner");
  runBanner.hidden = true;
  const body = el("div", "twm-flow-outline__body");
  const list = el("section", "twm-flow-outline__list");
  list.setAttribute("aria-label", say(S, "stepsHeading"));
  const head = el("div", "twm-flow-outline__list-head");
  const heading = el("h2", "twm-flow-outline__heading", say(S, "stepsHeading"));
  const countEl = el("span", "twm-flow-outline__count");
  const foldAllBtn = el("button", "twm-flow-outline__fold-all", say(S, "foldAll"));
  foldAllBtn.type = "button";
  const unfoldAllBtn = el("button", "twm-flow-outline__fold-all", say(S, "unfoldAll"));
  unfoldAllBtn.type = "button";
  foldAllBtn.addEventListener("click", () => setFolds(blockIds()));
  unfoldAllBtn.addEventListener("click", () => setFolds([]));
  head.append(heading, countEl, el("span", "twm-flow-outline__spacer"), foldAllBtn, unfoldAllBtn);
  const findBox = el("input", "twm-flow-outline__find");
  findBox.type = "search";
  findBox.placeholder = say(S, "findStep");
  findBox.setAttribute("aria-label", say(S, "findStep"));
  findBox.autocomplete = "off";
  findBox.addEventListener("input", () => {
    findText = findBox.value;
    render();
  });
  findBox.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && findBox.value) {
      ev.preventDefault();
      ev.stopPropagation();
      findBox.value = "";
      findText = "";
      render();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const first = [...tree.querySelectorAll('[role="treeitem"][data-match]')][0];
      if (first) select(first.dataset.step || "flow", { focus: true });
    }
  });
  const scroller = el("div", "twm-flow-outline__scroll");
  const tree = el("div", "twm-flow-outline__tree");
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-label", say(S, "stepsHeading"));
  scroller.appendChild(tree);
  const message = el("p", "twm-flow-outline__message");
  message.setAttribute("aria-live", "polite");
  message.hidden = true;
  const keysLine = el("p", "twm-flow-outline__keys", say(S, "statusKeys"));
  list.append(head, findBox, scroller, message, keysLine);
  const settingsHost = el("section", "twm-flow-outline__settings");
  const aside = el("aside", "twm-flow-outline__aside");
  aside.hidden = true;
  body.append(list, settingsHost, aside);
  root.append(toolbar, roBanner, strip.el, runBanner, body);
  host.appendChild(root);
  if (typeof slots.toolbarEnd === "function") slots.toolbarEnd(toolbarEnd);
  toolbarEnd.hidden = toolbarEnd.childNodes.length === 0;
  const panel = createSettingsPanel({
    widgets,
    references,
    strings: S,
    services,
    readOnly: false,
    host: settingsHost,
    valuesNote,
    onChange: (stepId, key, value) => onPanelChange(stepId, key, value),
    onRename: (stepId, label) => onRename(stepId, label),
    onFocusLost: () => focusSelected(),
    values: values ? (q) => valuesFor(q) : null,
    columns: null
  });
  function valuesFor({ stepId, field, key }) {
    const g = structuredClone(graph);
    if (!stepId) return values({ graph: g, stepId: null, field, key, before: [], loops: [], arms: [], parameters: null });
    const loopPorts = map.loopPorts;
    const before = alwaysBefore(graph, catalogue, stepId, {
      loopPorts,
      waitsForAll: (join) => map.joinValue(join) !== "any"
    });
    const loops = enclosingLoops(graph, catalogue, stepId, { loopPorts });
    const arms = enclosingArms(graph, catalogue, stepId, {
      loopPorts,
      kindOf: (type) => map.kindOf(type),
      continuePort: (n) => map.cont(n?.type)
    });
    return values({ graph: g, stepId, step: nodeOf(stepId), field, key, before, loops, arms, parameters: null });
  }
  const stateText = () => JSON.stringify({ graph, settings: settings ? settings.value : null });
  const history = new FlowHistory({
    actions: OUTLINE_ACTIONS,
    limit: historyOptions.limit ?? 100,
    mergeMs: historyOptions.mergeMs ?? 1e3,
    now: historyOptions.now,
    restore: (state) => {
      const s = JSON.parse(state);
      graph = s.graph;
      if (settings) settings.value = s.settings ?? {};
      reread();
      if (selected !== "flow" && selected !== null && !nodeOf(selected)) selected = "flow";
      render();
      showPanel();
      drawAside();
    },
    onState: () => updateTools()
  });
  function emit(action, key = null) {
    onChange?.({
      graph: structuredClone(graph),
      flowSettings: settings ? structuredClone(settings.value) : null,
      text: serialise(graph),
      action,
      key
    });
  }
  function commit(action, key = null) {
    if (history.commit(stateText(), action, key)) emit(action, key);
  }
  function reread() {
    const r = ops.read(graph);
    view = r.ok ? r : null;
    refusal = r.ok ? null : r.refusal;
    drawReadOnly();
  }
  function drawReadOnly() {
    const why = roReason();
    roBanner.replaceChildren();
    roBanner.hidden = !why;
    if (why) roBanner.append(icon("lock", "twm-flow-outline__readonly-icon"), el("span", "twm-flow-outline__readonly-text", why));
    root.classList.toggle("twm-flow-outline--readonly", !editable());
    updateTools();
  }
  function updateTools() {
    const can = editable();
    undoBtn.disabled = !can || !history.canUndo;
    redoBtn.disabled = !can || !history.canRedo;
    foldAllBtn.disabled = !view;
    unfoldAllBtn.disabled = !view;
    for (const [id, { button: b, why }] of actionEls) {
      const st = actionState.get(id) || {};
      b.disabled = Boolean(st.disabled || st.busy);
      b.classList.toggle("twm-flow-outline__tool--busy", Boolean(st.busy));
      why.textContent = st.disabled && st.reason ? String(st.reason) : "";
      why.hidden = !why.textContent;
    }
  }
  function announce(text) {
    message.textContent = text || "";
    message.hidden = !text;
  }
  const findingsBy = () => groupFindings(findings, { graph });
  function blockIds() {
    if (!view) return [];
    const out = [];
    for (const p of view.index.at.values()) {
      if (!p.seq || p.join) continue;
      if (hasChildren(p.item)) out.push(p.item.id);
    }
    return out;
  }
  function drawnArms(item) {
    if (item.kind === "step" || item.kind === "start") {
      return item.arms.filter((a) => !(a.seq.exit === "open" && a.seq.items.length === 0));
    }
    return item.arms || [];
  }
  function hasChildren(item) {
    if (item.kind === "loop" || item.kind === "fanout" || item.kind === "branch") return true;
    return drawnArms(item).length > 0;
  }
  function stepsInside(item) {
    return subtreeIds(item).filter((id) => id !== item.id && map.kindOf(nodeOf(id)?.type) !== "join").length;
  }
  function lineOf(node, type) {
    const s = node && summarise ? summarise(node, type) : null;
    if (s && typeof s === "object") return { text: s.text === void 0 || s.text === null ? "" : String(s.text), mono: Boolean(s.mono) };
    return { text: s === void 0 || s === null ? "" : String(s), mono: false };
  }
  function findFilter() {
    const q = findText.trim().toLowerCase();
    if (!q || !view) return null;
    const match = /* @__PURE__ */ new Set();
    for (const n of graph.nodes) {
      if (map.kindOf(n.type) === "start" || map.kindOf(n.type) === "join") continue;
      const t = catalogue.get(n.type);
      const hay = [displayName(n, catalogue), t?.label, lineOf(n, t).text].map((s) => String(s ?? "").toLowerCase()).join(" ");
      if (hay.includes(q)) match.add(n.id);
    }
    const show = new Set(match);
    for (const id of match) {
      const p = view.index.at.get(id);
      for (const step of p?.path || []) show.add(step.owner.id);
    }
    return { match, show, query: findText.trim() };
  }
  const stepRun = (id) => overlay?.steps?.[id] ?? null;
  const portRun = (id, port) => overlay?.ports?.[id]?.[port] ?? null;
  const RUN_TONES2 = {
    completed: "ok",
    failed: "fail",
    skipped: "skip",
    "not-reached": "skip",
    running: "running",
    cancelled: "skip"
  };
  const isOff = (id) => ["skipped", "not-reached"].includes(stepRun(id)?.state);
  function render() {
    if (destroyed) return;
    const active = root.ownerDocument.activeElement;
    const held = tree.contains(active) ? {
      step: active.closest('[role="treeitem"]')?.dataset.step || "flow",
      menu: Boolean(active.closest(".twm-flow-outline__menu"))
    } : null;
    tree.replaceChildren();
    itemEls.clear();
    gapEls = [];
    offArm.clear();
    const filter = findFilter();
    if (view) renderOutline(filter);
    else renderFlat();
    countEl.textContent = say(S, "stepsCount", graph.nodes.filter((n) => !["start", "join"].includes(map.kindOf(n.type))).length);
    if (filter && !filter.match.size) announce(say(S, "findNothing", filter.query));
    else if (filter || message.dataset.kind === "find") announce("");
    message.dataset.kind = filter ? "find" : "";
    drawRunBanner();
    applySelection();
    if (held) {
      const item = itemEls.get(held.step) ?? itemEls.get(selected) ?? itemEls.get("flow");
      const target = held.menu ? item?.querySelector(":scope > .twm-flow-outline__row > .twm-flow-outline__menu") : null;
      (target || item)?.focus({ preventScroll: true });
    }
    if (drag?.started) {
      tree.appendChild(drag.line);
      drag.targets = dropTargets(drag.id);
      itemEls.get(drag.id)?.querySelector(":scope > .twm-flow-outline__row")?.classList.add("twm-flow-outline__row--dragging");
    }
  }
  let pressing = false;
  let pendingRender = false;
  function renderSoon() {
    if (pressing) {
      pendingRender = true;
      return;
    }
    render();
  }
  const onPressStart = () => {
    pressing = true;
  };
  const onPressEnd = () => {
    if (!pressing) return;
    pressing = false;
    if (!pendingRender) return;
    pendingRender = false;
    setTimeout(() => {
      if (!destroyed && !pressing) render();
      else if (pressing) pendingRender = true;
    }, 0);
  };
  function guides(row, depth) {
    for (let k = 0; k < depth; k += 1) {
      const g = el("span", "twm-flow-outline__guide");
      g.setAttribute("aria-hidden", "true");
      g.style.setProperty("--twm-outline-guide", String(k));
      row.appendChild(g);
    }
  }
  function rowAt(cls, depth) {
    const row = el("div", `twm-flow-outline__row ${cls}`);
    row.style.setProperty("--twm-outline-depth", String(depth));
    guides(row, depth);
    return row;
  }
  function renderFlat() {
    const order = flatRunOrder(graph, catalogue, map);
    for (const id of order) {
      const n = nodeOf(id);
      if (!n) continue;
      if (map.kindOf(n.type) === "start") tree.appendChild(flowItem(null));
      else tree.appendChild(stepItem({ kind: "step", id, arms: [] }, 0, null));
    }
  }
  function renderOutline(filter) {
    const flow = flowItem(filter);
    tree.appendChild(flow);
    const flowRow = flow.querySelector(":scope > .twm-flow-outline__row");
    gap(flowRow, view.tree.top, 0, 0);
    renderSeq(view.tree.top, 0, tree, filter);
    if (editable() && !filter) {
      const add = addRow(0, map.addLabel(), () => addAnchor(view.tree.top));
      if (add) tree.appendChild(add);
    }
  }
  function addAnchor(seq) {
    let at = ops.resolve(view, ops.anchorOf(seq, seq.items.length)) ?? { seq, index: seq.items.length };
    if (at.seq !== seq) return null;
    const last = at.seq.items[at.index - 1];
    if (at.index === at.seq.items.length && last?.kind === "end") at = { seq: at.seq, index: at.index - 1 };
    const facts = ops.gapAt(view, at.seq, at.index);
    if (facts.afterEnd || !facts.arriving.length) return null;
    return { anchor: ops.anchorOf(at.seq, at.index), seq: at.seq, index: at.index };
  }
  function renderSeq(seq, depth, container, filter) {
    seq.items.forEach((item, i) => {
      if (filter && !filter.show.has(item.id)) return;
      const itemEl = stepItem(item, depth, filter);
      container.appendChild(itemEl);
      const rows = itemEl.querySelectorAll(".twm-flow-outline__row");
      const visible = [...rows].filter((r) => !r.closest("[hidden]"));
      gap(visible[visible.length - 1] || rows[0], seq, i + 1, depth);
    });
  }
  function flowItem(filter) {
    const id = startId();
    const node = id ? nodeOf(id) : null;
    const type = node ? catalogue.get(node.type) : null;
    const item = el("div", "twm-flow-outline__item twm-flow-outline__item--flow");
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-level", "1");
    item.dataset.twmFlowItem = "";
    item.dataset.flow = "";
    item.tabIndex = -1;
    const row = rowAt("twm-flow-outline__row--flow", 0);
    const chip = el("span", `twm-flow-outline__chip ${toneClass("twm-flow-outline__chip", map.start.tone || "blue")}`);
    chip.setAttribute("aria-hidden", "true");
    chip.appendChild(icon(map.start.icon || type?.icon || "play_arrow"));
    const words3 = el("span", "twm-flow-outline__words");
    const line = el("span", "twm-flow-outline__line");
    line.appendChild(el("span", "twm-flow-outline__title", map.startLabel(S)));
    words3.appendChild(line);
    const said = node ? lineOf(node, type) : { text: "", mono: false };
    const sum = said.text;
    if (sum) words3.appendChild(summaryEl(said));
    row.append(chip, words3);
    const fs = findingsBy().get(null) || [];
    if (fs.length) row.appendChild(badge(fs));
    item.appendChild(row);
    item.setAttribute("aria-label", [map.startLabel(S), sum].filter(Boolean).join(", "));
    row.addEventListener("click", () => select("flow", { focus: true }));
    if (filter) item.classList.add("twm-flow-outline__item--context");
    itemEls.set("flow", item);
    return item;
  }
  function summaryEl({ text, mono }) {
    return el("span", `twm-flow-outline__summary${mono ? " twm-flow-outline__summary--mono" : ""}`, text);
  }
  function badge(list2) {
    const errors = list2.filter((f) => f.severity !== "warning");
    const b = el("span", `twm-flow-outline__badge${errors.length ? "" : " twm-flow-outline__badge--warning"}`);
    b.appendChild(icon(errors.length ? "error" : "warning"));
    b.title = errors.length ? say(S, "toFix", errors.length) : say(S, "toLookAt", list2.length);
    return b;
  }
  function stepItem(item, depth, filter) {
    const blocky = view ? hasChildren(item) : false;
    const folded = blocky && folds.has(item.id) && !filter;
    const li = el("div", "twm-flow-outline__item");
    li.setAttribute("role", "treeitem");
    li.setAttribute("aria-level", String(depth + 1));
    li.dataset.twmFlowItem = "";
    li.dataset.step = item.id;
    li.tabIndex = -1;
    if (blocky) li.setAttribute("aria-expanded", String(!folded));
    if (filter) {
      if (filter.match.has(item.id)) li.dataset.match = "";
      else li.classList.add("twm-flow-outline__item--context");
    }
    const { row, label } = stepRow(item, depth, filter);
    li.setAttribute("aria-label", label);
    li.appendChild(row);
    itemEls.set(item.id, li);
    if (view && blocky) {
      const inside = el("div", "twm-flow-outline__inside");
      inside.hidden = folded;
      buildInside(item, depth, inside, filter, row);
      li.appendChild(inside);
    }
    return li;
  }
  function stepRow(item, depth, filter) {
    const node = nodeOf(item.id);
    const type = catalogue.get(node?.type);
    const name = nameOf2(item.id);
    const blocky = view ? hasChildren(item) : false;
    const folded = blocky && folds.has(item.id) && !filter;
    const row = rowAt("twm-flow-outline__row--step", depth);
    if (isOff(item.id) || offArm.has(item.id)) row.classList.add("twm-flow-outline__row--off");
    const grip = el("span", "twm-flow-outline__grip");
    grip.setAttribute("aria-hidden", "true");
    grip.title = say(S, "dragToMove");
    grip.appendChild(icon("drag_indicator"));
    if (editable() && view) grip.addEventListener("pointerdown", (ev) => armDrag(ev, item.id));
    else grip.classList.add("twm-flow-outline__grip--off");
    row.appendChild(grip);
    if (blocky) {
      const f = el("button", "twm-flow-outline__fold");
      f.type = "button";
      f.tabIndex = -1;
      f.setAttribute("aria-label", say(S, folded ? "unfold" : "fold", name));
      f.setAttribute("aria-expanded", String(!folded));
      f.appendChild(icon(folded ? "chevron_right" : "expand_more"));
      f.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleFold(item.id);
      });
      row.appendChild(f);
    } else {
      const sp = el("span", "twm-flow-outline__fold-space");
      sp.setAttribute("aria-hidden", "true");
      row.appendChild(sp);
    }
    const chip = el("span", `twm-flow-outline__chip ${toneClass("twm-flow-outline__chip", catalogue.tone(node?.type))}`);
    chip.setAttribute("aria-hidden", "true");
    chip.appendChild(icon(type?.icon || ""));
    row.appendChild(chip);
    const words3 = el("span", "twm-flow-outline__words");
    const line = el("span", "twm-flow-outline__line");
    line.appendChild(el("span", "twm-flow-outline__title", name));
    if (type?.label && type.label !== name) line.appendChild(el("span", "twm-flow-outline__type", type.label));
    words3.appendChild(line);
    const mine = findingsBy().get(item.id) || [];
    const said = lineOf(node, type);
    const summary = said.text;
    if (mine.length) {
      const errors = mine.filter((f) => f.severity !== "warning");
      words3.appendChild(el(
        "span",
        `twm-flow-outline__summary twm-flow-outline__summary--${errors.length ? "error" : "warning"}`,
        String((errors[0] || mine[0]).message ?? "")
      ));
    } else if (summary) {
      words3.appendChild(summaryEl(said));
    }
    row.appendChild(words3);
    if (folded) row.appendChild(el("span", "twm-flow-outline__note", say(S, "stepsInside", stepsInside(item))));
    const run = stepRun(item.id);
    if (run) {
      const tone = run.tone || RUN_TONES2[run.state] || "skip";
      const pill = el(
        "span",
        `twm-flow-outline__run twm-flow-outline__run--${["ok", "warn", "fail", "skip", "running"].includes(tone) ? tone : "skip"}`,
        run.line ?? say(S, "runState", run.state)
      );
      row.appendChild(pill);
    }
    if (mine.length) row.appendChild(badge(mine));
    if (view) {
      const menu = el("button", "twm-flow-outline__menu");
      menu.type = "button";
      menu.tabIndex = -1;
      menu.setAttribute("aria-label", say(S, "menuFor", name));
      menu.setAttribute("aria-haspopup", "menu");
      menu.appendChild(icon("more_horiz"));
      menu.addEventListener("click", (ev) => {
        ev.stopPropagation();
        select(item.id);
        openMenu(item.id, menu);
      });
      row.appendChild(menu);
      row.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        select(item.id);
        openMenu(item.id, menu);
      });
    }
    row.addEventListener("click", () => select(item.id, { focus: true }));
    return { row, label: [name, type?.label !== name ? type?.label : null, summary].filter(Boolean).join(", ") };
  }
  const offArm = /* @__PURE__ */ new Set();
  function armGroup(label, depth, tone, container, filter, note = null, removable = null) {
    const group = el("div", "twm-flow-outline__arm");
    group.setAttribute("role", "group");
    const known = ["then", "else", "fail"].includes(tone) ? ` twm-flow-outline__row--${tone}` : "";
    const row = rowAt(`twm-flow-outline__row--arm${known}`, depth);
    row.appendChild(icon("subdirectory_arrow_right", "twm-flow-outline__arm-icon"));
    const words3 = el("span", "twm-flow-outline__arm-label", label);
    words3.id = uid("outline-arm");
    row.appendChild(words3);
    if (note) row.appendChild(el("span", "twm-flow-outline__arm-note", note));
    if (removable) {
      const x = el("button", "twm-flow-outline__arm-remove");
      x.type = "button";
      x.setAttribute("aria-label", say(S, "removeBranch", label));
      x.title = say(S, "removeBranch", label);
      x.appendChild(icon("close"));
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removable();
      });
      row.appendChild(x);
    }
    group.setAttribute("aria-labelledby", words3.id);
    group.appendChild(row);
    container.appendChild(group);
    return { group, row };
  }
  function footRow(depth, glyph, label, note, container) {
    const row = rowAt("twm-flow-outline__row--foot", depth);
    row.appendChild(icon(glyph, "twm-flow-outline__foot-icon"));
    row.appendChild(el("span", "twm-flow-outline__foot-label", label));
    if (note) row.appendChild(el("span", "twm-flow-outline__foot-note", note));
    container.appendChild(row);
    return row;
  }
  function addRow(depth, label, where, onPick = null) {
    if (!editable()) return null;
    if (!onPick && !where()) return null;
    const row = rowAt("twm-flow-outline__row--add", depth);
    if (depth === 0) row.classList.add("twm-flow-outline__row--add-top");
    const b = el("button", "twm-flow-outline__add");
    b.type = "button";
    b.appendChild(icon("add"));
    b.appendChild(el("span", "twm-flow-outline__add-label", label));
    b.addEventListener("click", () => {
      const w = where();
      if (onPick) onPick(b);
      else if (w) openPicker(b, w.seq, w.index);
    });
    row.appendChild(b);
    return row;
  }
  function armNote(owner, arm) {
    if (!overlay) return null;
    const r = portRun(owner, arm.port);
    if (!r) return null;
    if (r.count) return say(S, "runCount", r.count);
    return r.taken ? say(S, "runTaken") : say(S, "runNotTaken");
  }
  function markOff(seq) {
    for (const it of seq.items) for (const id of subtreeIds(it)) offArm.add(id);
  }
  function buildInside(item, depth, inside, filter, headRow) {
    const node = nodeOf(item.id);
    const d = depth + 1;
    const seqFoot = (arm, owner) => {
      if (filter) return;
      if (arm.seq.exit === "next") {
        const loop = ops.loopAround(view, arm.seq);
        footRow(d, "skip_next", map.loopSkip(nodeOf(loop)), portRun(owner, arm.port)?.count ? say(S, "runCount", portRun(owner, arm.port).count) : null, armInside(arm));
      } else if (arm.seq.exit === "open" && (item.kind === "branch" || arm.seq.items.length)) {
        footRow(d, "block", say(S, "armStops"), null, armInside(arm));
      }
    };
    const groups = /* @__PURE__ */ new Map();
    const armInside = (arm) => groups.get(arm);
    const drawArm = (arm, label, tone, removable = null) => {
      const visibleInFilter = !filter || arm.seq.items.some((x) => filter.show.has(x.id));
      if (!visibleInFilter) return;
      const perPort = item.kind !== "fanout";
      const note = perPort ? armNote(item.id, arm) : null;
      const r = perPort ? portRun(item.id, arm.port) : null;
      if (overlay && r && r.taken === false && !r.count) markOff(arm.seq);
      const { group, row } = armGroup(label, d, tone, inside, filter, note, removable);
      if (overlay && r && r.taken === false && !r.count) row.classList.add("twm-flow-outline__row--off");
      groups.set(arm, group);
      gap(row, arm.seq, 0, d);
      renderSeq(arm.seq, d, group, filter);
      seqFoot(arm, item.id);
    };
    if (item.kind === "loop") {
      const body2 = el("div", "twm-flow-outline__arm");
      body2.setAttribute("role", "group");
      body2.setAttribute("aria-label", nameOf2(item.id));
      inside.appendChild(body2);
      groups.set(item.body, body2);
      gap(headRow, item.body.seq, 0, d);
      renderSeq(item.body.seq, d, body2, filter);
      if (!filter) {
        const add = addRow(d, map.loopAddInside(node), () => addAnchor(item.body.seq));
        if (add) body2.appendChild(add);
        const count2 = portRun(item.id, map.loopPorts.next)?.count;
        footRow(d, "repeat", map.loopFoot(node), count2 ? say(S, "runCount", count2) : null, body2);
      }
      for (const arm of drawnArms(item)) drawArm(arm, map.armLabel(node, arm.port), map.armSetting(node, arm.port).tone);
      return;
    }
    if (item.kind === "fanout") {
      item.arms.forEach((arm, i) => {
        const removable = editable() && item.arms.length > 1 ? () => apply(ops.removeBranch(graph, item.id, i), "flow:branch:remove") : null;
        const first = arm.seq.items[0];
        if (overlay && first && isOff(first.id)) markOff(arm.seq);
        drawArm(arm, map.fanoutArmLabel(i + 1), "arm", removable);
      });
      if (!filter) {
        const add = addRow(d, map.fanoutAddArm(node), () => null, (anchorBtn) => openBranchPicker(anchorBtn, item.id));
        if (add) inside.appendChild(add);
        if (item.join) {
          const jn = nodeOf(item.join.id);
          footRow(d, "merge", map.joinFoot(jn, S), stepRun(item.join.id)?.line ?? null, inside);
        }
      }
      return;
    }
    if (item.kind === "branch") {
      item.arms.forEach((arm, i) => drawArm(arm, map.branchArmLabel(node, arm.port), map.branchArmTone(node, arm.port, i)));
      return;
    }
    for (const arm of drawnArms(item)) drawArm(arm, map.armLabel(node, arm.port), map.armSetting(node, arm.port).tone);
  }
  function gap(row, seq, index, depth) {
    if (!row || !editable() || !view || findText.trim()) return;
    if (!ops.isCanonical(view, seq, index)) return;
    const facts = ops.gapAt(view, seq, index);
    if (facts.afterEnd || !facts.arriving.length) return;
    const where = ops.gapWords(view, seq, index);
    const b = el("button", "twm-flow-outline__gap");
    b.type = "button";
    b.tabIndex = -1;
    b.style.setProperty("--twm-outline-depth", String(depth));
    b.setAttribute("aria-label", say(S, "addStepHere", where));
    b.title = say(S, "addStepHere", where);
    b.dataset.gap = JSON.stringify(ops.anchorOf(seq, index));
    const line = el("span", "twm-flow-outline__gap-line");
    line.setAttribute("aria-hidden", "true");
    b.append(line, icon("add", "twm-flow-outline__gap-plus"));
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openPicker(b, seq, index);
    });
    b.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    row.appendChild(b);
    gapEls.push({ el: b, row, seq, index, depth });
  }
  let gapEls = [];
  function applySelection() {
    const key = selected === null ? "flow" : selected;
    const current = itemEls.get(key) ?? itemEls.get("flow") ?? null;
    for (const li of itemEls.values()) {
      const on = li === current;
      const row = li.querySelector(":scope > .twm-flow-outline__row");
      li.setAttribute("aria-selected", String(on));
      row?.classList.toggle("twm-flow-outline__row--selected", on);
      if (on) row?.setAttribute("aria-current", "true");
      else row?.removeAttribute("aria-current");
    }
    for (const li of itemEls.values()) li.tabIndex = li === current ? 0 : -1;
    for (const b of tree.querySelectorAll(".twm-flow-outline__menu, .twm-flow-outline__gap")) {
      b.tabIndex = current && b.closest('[role="treeitem"]') === current ? 0 : -1;
    }
  }
  function select(id, { focus = false, silent = false } = {}) {
    const next = id === null || id === void 0 ? "flow" : id;
    const changed = next !== selected;
    selected = next;
    applySelection();
    if (changed) {
      showPanel();
      drawAside();
    }
    void silent;
    if (focus) itemEls.get(selected)?.focus({ preventScroll: false });
    if (changed) onSelect?.({ kind: selected === "flow" ? "flow" : "step", id: selected === "flow" ? null : selected });
  }
  function focusSelected() {
    const li = itemEls.get(selected) ?? itemEls.get("flow");
    if (li) li.focus({ preventScroll: true });
    else root.focus({ preventScroll: true });
  }
  function visibleItems() {
    return [...tree.querySelectorAll('[role="treeitem"]')].filter((li) => !li.parentElement.closest("[hidden]"));
  }
  function showPanel() {
    if (destroyed) return;
    panel.setReadOnly(editable() ? false : true);
    if (selected === "flow" || selected === null || !nodeOf(selected)) {
      const s = settings || {};
      const sid = startId();
      const st = sid ? typeOf(sid) : null;
      panel.show({
        step: null,
        type: null,
        title: s.title ?? map.startLabel(S),
        typeLabel: s.typeLabel ?? say(S, "startType"),
        where: s.where ?? "",
        description: s.description ?? "",
        idLine: s.idLine ?? null,
        icon: map.start.icon || st?.icon || "play_arrow",
        tone: map.start.tone || "blue",
        fields: s.schema ? fieldsFromSchema(s.schema) : [],
        value: s.value ?? {}
      });
      panel.setFindings(findings);
      return;
    }
    const node = nodeOf(selected);
    const type = catalogue.get(node.type);
    const place = view?.index.at.get(selected);
    const canEdit = editable();
    const dup = canEdit && view ? ops.duplicate(graph, selected) : null;
    panel.show({
      step: node,
      type,
      title: node.label ?? "",
      placeholderTitle: type?.label ?? node.id,
      rename: true,
      typeLabel: type?.label ?? node.type,
      where: view ? ops.whereText(view, selected) : "",
      description: type?.description ?? "",
      idLine: summariseReads?.(node, type) ?? null,
      icon: type?.icon ?? "",
      tone: catalogue.tone(node.type),
      value: node.config ?? {},
      extra: view && place ? extrasFor(place.item, node) : [],
      actions: view ? [
        {
          id: "duplicate",
          label: say(S, "duplicate"),
          icon: "content_copy",
          disabled: !dup?.ok,
          reason: dup && !dup.ok ? dup.reason : "",
          run: () => runOp(() => ops.duplicate(graph, selected), "flow:step:duplicate")
        },
        {
          id: "remove",
          label: say(S, "removeStep"),
          icon: "delete",
          danger: true,
          run: () => runOp(() => ops.remove(graph, selected), "flow:step:remove")
        }
      ] : []
    });
    panel.setFindings(findings);
  }
  function extrasFor(item, node) {
    const out = [];
    const note = map.note(item.kind, node);
    if (note) out.push({ note, at: "start" });
    if (item.kind === "step" || item.kind === "loop" && item.arms.length) {
      for (const arm of item.arms) {
        const words3 = map.armSetting(node, arm.port);
        const connected = !(arm.seq.exit === "open" && !arm.seq.items.length);
        const placed = words3.after ? { after: words3.after } : {};
        out.push({
          key: `__arm:${arm.port}`,
          ...placed,
          spec: {
            type: "string",
            title: words3.label,
            enum: ["open", "connected"],
            "x-ui-widget": "choice-cards",
            "x-ui-enum-labels": { open: words3.unconnected, connected: words3.connected }
          },
          value: connected ? "connected" : "open",
          set: (v) => runOp(
            () => ops.setArm(graph, item.id, arm.port, v === "connected"),
            "flow:arm",
            { keepPanel: true }
          )
        });
        const loop = ops.loopAround(view, view.index.at.get(item.id).seq);
        const cont = ops.gapAt(view, view.index.at.get(item.id).seq, view.index.at.get(item.id).index + 1).succ;
        if (connected && loop && cont && !(cont.id === loop && cont.port === map.loopPorts.next) && ["rejoin", "next"].includes(arm.seq.exit)) {
          out.push({
            key: `__exit:${arm.port}`,
            ...placed,
            spec: {
              type: "string",
              title: say(S, "armExitLabel"),
              enum: ["rejoin", "next"],
              "x-ui-widget": "choice-cards",
              "x-ui-enum-labels": { rejoin: say(S, "armExitRejoin", nameOf2(cont.id)), next: map.loopSkip(nodeOf(loop)) }
            },
            value: arm.seq.exit,
            set: (v) => runOp(() => ops.setArmExit(graph, item.id, arm.port, v), "flow:arm", { keepPanel: true })
          });
        }
      }
    }
    if (item.kind === "fanout" && item.join) {
      const jn = nodeOf(item.join.id);
      const field = map.joinField;
      const prop = catalogue.get(jn.type)?.config_schema?.properties?.[field] || {};
      const labels = prop["x-ui-enum-labels"] || {};
      out.push({
        key: "__join",
        spec: {
          type: "string",
          title: map.joinChoices.label ?? say(S, "joinSettingLabel"),
          enum: ["all", "any"],
          "x-ui-widget": "choice-cards",
          "x-ui-enum-labels": {
            all: map.joinChoices.all ?? labels.all ?? say(S, "joinAll"),
            any: map.joinChoices.any ?? labels.any ?? say(S, "joinAny")
          }
        },
        value: map.joinValue(jn),
        set: (v) => runOp(() => ops.setJoin(graph, item.id, v), "flow:arm", { keepPanel: true })
      });
    }
    return out;
  }
  function onPanelChange(stepId, key, value) {
    if (!editable()) return;
    if (stepId === null) {
      if (!settings) return;
      const next = { ...settings.value || {} };
      if (value === void 0) delete next[key];
      else next[key] = value;
      settings.value = next;
      commit("flow:settings", `settings:${key}`);
      refreshFlowRow();
      return;
    }
    const node = nodeOf(stepId);
    if (!node) return;
    const config = { ...node.config || {} };
    if (value === void 0) delete config[key];
    else config[key] = value;
    node.config = config;
    refreshRow(stepId);
    commit("flow:step:config", `config:${stepId}:${key}`);
  }
  function onRename(stepId, label) {
    if (!editable() || stepId === null) return;
    const node = nodeOf(stepId);
    if (!node) return;
    if (label) node.label = label;
    else delete node.label;
    refreshRow(stepId);
    commit("flow:step:label", `label:${stepId}`);
  }
  function swapRow(li, newRow, label) {
    const oldRow = li.querySelector(":scope > .twm-flow-outline__row");
    for (const g of oldRow.querySelectorAll(":scope > .twm-flow-outline__gap")) newRow.appendChild(g);
    for (const g of gapEls) if (g.row === oldRow) g.row = newRow;
    oldRow.replaceWith(newRow);
    if (label) li.setAttribute("aria-label", label);
    applySelection();
  }
  function refreshRow(id) {
    const li = itemEls.get(id);
    if (!li) return;
    const item = view?.index.at.get(id)?.item ?? { kind: "step", id, arms: [] };
    const { row, label } = stepRow(item, Number(li.getAttribute("aria-level")) - 1, findFilter());
    swapRow(li, row, label);
  }
  function refreshFlowRow() {
    const li = itemEls.get("flow");
    if (!li) return;
    const fresh = flowItem(findFilter());
    itemEls.set("flow", li);
    swapRow(li, fresh.querySelector(":scope > .twm-flow-outline__row"), fresh.getAttribute("aria-label"));
  }
  function drawAside() {
    aside.replaceChildren();
    if (selected !== "flow" && selected !== null && nodeOf(selected)) {
      if (typeof slots.stepPanel === "function") slots.stepPanel(aside, nodeOf(selected));
    } else if (typeof slots.flowPanel === "function") {
      slots.flowPanel(aside);
    }
    aside.hidden = aside.childNodes.length === 0;
  }
  function drawRunBanner() {
    runBanner.replaceChildren();
    const text = overlay?.banner;
    runBanner.hidden = !text;
    if (text) runBanner.append(icon("info", "twm-flow-outline__banner-icon"), el("span", "twm-flow-outline__banner-text", text));
  }
  function apply(result, action, { keepPanel = false } = {}) {
    if (!result || !result.ok) {
      announce(result?.reason || "");
      return false;
    }
    announce("");
    graph = result.graph;
    reread();
    if (result.select && nodeOf(result.select) && !keepPanel) selected = result.select;
    const held = tree.contains(root.ownerDocument.activeElement);
    render();
    showPanel();
    drawAside();
    commit(action);
    if (held) focusSelected();
    return true;
  }
  function runOp(fn, action, opts = {}) {
    if (!editable()) {
      announce(roReason());
      return false;
    }
    return apply(fn(), action, opts);
  }
  function insertAt(seq, index, entry) {
    const anchor = ops.anchorOf(seq, index);
    if (entry.paste) return runOp(() => ops.paste(graph, anchor, CLIPBOARD), "flow:step:paste");
    return runOp(() => ops.insert(graph, anchor, entry.id), "flow:step:add");
  }
  function entriesFor(dryRun) {
    const order = { branch: 0, loop: 1, fanout: 2, step: 3, end: 4 };
    const types = catalogue.list().filter((t) => !["start", "join"].includes(map.kindOf(t.type_id)));
    const cats = catalogue.categories.map((c) => c.id);
    types.sort((a, b) => cats.indexOf(a.category ?? "") - cats.indexOf(b.category ?? "") || order[map.kindOf(a.type_id)] - order[map.kindOf(b.type_id)] || String(a.label).localeCompare(String(b.label)));
    return types.map((t) => {
      const words3 = map.entryFor(t.type_id);
      const r = dryRun(t.type_id);
      return {
        id: t.type_id,
        label: words3.label,
        sub: words3.sub,
        description: words3.description,
        icon: t.icon,
        tone: catalogue.tone(t.type_id),
        category: t.category ?? "",
        refusal: r.ok ? null : r.reason
      };
    });
  }
  async function openPicker(anchor, seq, index) {
    if (!editable() || !view) return;
    const a = ops.anchorOf(seq, index);
    const pasteOk = CLIPBOARD ? ops.paste(graph, a, CLIPBOARD).ok : false;
    const picked = await openStepPicker({
      anchor,
      strings: S,
      categories: catalogue.categories,
      where: ops.gapWords(view, seq, index),
      paste: pasteOk ? { label: say(S, "pasteStep") } : null,
      entries: entriesFor((typeId) => ops.insert(graph, a, typeId))
    });
    if (!picked || destroyed) return;
    insertAt(seq, index, picked.paste ? { paste: true } : picked.entry);
  }
  async function openBranchPicker(anchor, fanoutId) {
    if (!editable() || !view) return;
    const picked = await openStepPicker({
      anchor,
      strings: S,
      categories: catalogue.categories,
      title: map.fanoutAddArm(nodeOf(fanoutId)),
      where: say(S, "insidePath", nameOf2(fanoutId)),
      entries: entriesFor((typeId) => ops.addBranch(graph, fanoutId, typeId))
    });
    if (!picked?.entry || destroyed) return;
    runOp(() => ops.addBranch(graph, fanoutId, picked.entry.id), "flow:branch:add");
  }
  function blockEntries() {
    return catalogue.list().filter((t) => ["branch", "loop", "fanout"].includes(map.kindOf(t.type_id)) && !t.unavailable);
  }
  function openMenu(id, anchor) {
    if (!view) return;
    const can = editable();
    const ro = can ? null : roReason() || say(S, "readOnlyRefusal");
    const why = (r) => ro ?? (r.ok ? null : r.reason);
    const place = view.index.at.get(id);
    const owner = place?.owner;
    const up = can ? ops.moveUp(graph, id) : null;
    const down = can ? ops.moveDown(graph, id) : null;
    const out = can ? ops.moveOut(graph, id) : null;
    const dup = can ? ops.duplicate(graph, id) : null;
    const paste = can ? CLIPBOARD ? ops.paste(graph, { after: id }, CLIPBOARD) : { ok: false, reason: say(S, "nothingCopied") } : null;
    const remove = can ? ops.remove(graph, id) : null;
    const wraps = blockEntries().map((t) => {
      const r = can ? ops.wrap(graph, id, t.type_id) : null;
      return {
        id: `wrap:${t.type_id}`,
        label: map.entryFor(t.type_id).label,
        icon: t.icon,
        tone: catalogue.tone(t.type_id),
        refusal: ro ?? (r.ok ? null : r.reason),
        run: () => runOp(() => ops.wrap(graph, id, t.type_id), "flow:step:wrap")
      };
    });
    const outLabel = owner && owner.kind !== "start" ? say(S, "moveOut", nameOf2(owner.id)) : say(S, "moveOutTop");
    openStepMenu({
      anchor,
      label: nameOf2(id),
      strings: S,
      items: [
        {
          id: "up",
          label: say(S, "moveUp"),
          keys: say(S, "keyMoveUp"),
          refusal: ro ?? (up.ok ? null : up.reason),
          run: () => runOp(() => ops.moveUp(graph, id), "flow:step:move")
        },
        {
          id: "down",
          label: say(S, "moveDown"),
          keys: say(S, "keyMoveDown"),
          refusal: ro ?? (down.ok ? null : down.reason),
          run: () => runOp(() => ops.moveDown(graph, id), "flow:step:move")
        },
        {
          id: "out",
          label: outLabel,
          keys: say(S, "keyMoveOut"),
          refusal: ro ?? (out.ok ? null : out.reason),
          run: () => runOp(() => ops.moveOut(graph, id), "flow:step:move")
        },
        { id: "wrap", label: say(S, "wrapIn"), items: wraps, refusal: wraps.every((w) => w.refusal) ? ro ?? wraps[0]?.refusal ?? null : null },
        { separator: true },
        {
          id: "duplicate",
          label: say(S, "duplicate"),
          keys: say(S, "keyDuplicate"),
          refusal: dup ? why(dup) : ro,
          run: () => runOp(() => ops.duplicate(graph, id), "flow:step:duplicate")
        },
        { id: "copy", label: say(S, "copy"), keys: say(S, "keyCopy"), run: () => copy(id) },
        { id: "cut", label: say(S, "cut"), keys: say(S, "keyCut"), refusal: remove ? why(remove) : ro, run: () => cut(id) },
        {
          id: "paste",
          label: say(S, "pasteAfter"),
          keys: say(S, "keyPaste"),
          refusal: paste ? why(paste) : ro,
          run: () => runOp(() => ops.paste(graph, { after: id }, CLIPBOARD), "flow:step:paste")
        },
        { separator: true },
        { id: "rename", label: say(S, "rename"), keys: say(S, "renameKey"), refusal: ro, run: () => rename(id) },
        { separator: true },
        {
          id: "remove",
          label: say(S, "removeStep"),
          keys: say(S, "keyRemove"),
          danger: true,
          refusal: remove ? why(remove) : ro,
          run: () => runOp(() => ops.remove(graph, id), "flow:step:remove")
        }
      ]
    });
  }
  function copy(id) {
    const c = ops.copy(graph, id);
    if (c) CLIPBOARD = c;
    return Boolean(c);
  }
  function cut(id) {
    if (!editable()) return false;
    const c = ops.copy(graph, id);
    const r = ops.remove(graph, id);
    if (!c || !r.ok) {
      announce(r.reason);
      return false;
    }
    CLIPBOARD = c;
    return apply(r, "flow:step:remove");
  }
  function rename(id) {
    select(id);
    const input = settingsHost.querySelector("[data-twm-flow-title]");
    if (input) {
      input.focus({ preventScroll: true });
      input.select?.();
    }
  }
  function reveal(id) {
    let unfolded = false;
    for (const step of view?.index.at.get(id)?.path || []) if (folds.delete(step.owner.id)) unfolded = true;
    if (unfolded) onFoldChange?.([...folds]);
    return unfolded;
  }
  function goTo(f) {
    const id = f?.node_id && nodeOf(f.node_id) ? f.node_id : "flow";
    if (reveal(id)) render();
    select(id, { focus: true });
    if (f?.field) panel.focusField(f.field);
  }
  function setFolds(ids) {
    folds.clear();
    for (const id of ids) folds.add(id);
    onFoldChange?.([...folds]);
    render();
  }
  function toggleFold(id) {
    if (folds.has(id)) folds.delete(id);
    else folds.add(id);
    onFoldChange?.([...folds]);
    render();
    itemEls.get(id)?.focus({ preventScroll: true });
  }
  const inTree = (ev) => tree.contains(ev.target);
  const stepSelected = () => selected !== "flow" && selected !== null && nodeOf(selected) && view ? selected : null;
  const onStep = (ev, fn) => {
    if (!inTree(ev) || !stepSelected()) return false;
    fn();
    return void 0;
  };
  const unbind = bindFlowKeys(root, {
    undo: () => {
      api.undo();
    },
    redo: () => {
      api.redo();
    },
    up: (ev) => inTree(ev) ? moveSelection(-1) : false,
    down: (ev) => inTree(ev) ? moveSelection(1) : false,
    left: (ev) => inTree(ev) ? leftKey() : false,
    right: (ev) => inTree(ev) ? rightKey() : false,
    open: (ev) => {
      if (!inTree(ev) || ev.target.closest("button")) return false;
      const f = settingsHost.querySelector('.twm-flow-panel__fields input, .twm-flow-panel__fields select, .twm-flow-panel__fields textarea, .twm-flow-panel__fields [contenteditable="true"], .twm-flow-panel__fields button') || settingsHost.querySelector("[data-twm-flow-title]");
      f?.focus({ preventScroll: false });
      return Boolean(f);
    },
    remove: (ev) => onStep(ev, () => runOp(() => ops.remove(graph, selected), "flow:step:remove")),
    duplicate: (ev) => onStep(ev, () => runOp(() => ops.duplicate(graph, selected), "flow:step:duplicate")),
    copy: (ev) => onStep(ev, () => copy(selected)),
    cut: (ev) => onStep(ev, () => cut(selected)),
    paste: (ev) => {
      if (!inTree(ev) || !view) return false;
      if (!CLIPBOARD) {
        announce(say(S, "nothingCopied"));
        return void 0;
      }
      const anchor = stepSelected() ? { after: selected } : { into: "top" };
      runOp(() => ops.paste(graph, anchor, CLIPBOARD), "flow:step:paste");
      return void 0;
    },
    rename: (ev) => onStep(ev, () => rename(selected)),
    moveUp: (ev) => onStep(ev, () => runOp(() => ops.moveUp(graph, selected), "flow:step:move")),
    moveDown: (ev) => onStep(ev, () => runOp(() => ops.moveDown(graph, selected), "flow:step:move")),
    moveOut: (ev) => onStep(ev, () => runOp(() => ops.moveOut(graph, selected), "flow:step:move")),
    escape: () => {
      if (drag) {
        endDrag(false);
        return void 0;
      }
      return false;
    }
  });
  tree.addEventListener("keydown", (ev) => {
    if ((ev.key === "ContextMenu" || ev.key === "F10" && ev.shiftKey) && stepSelected()) {
      ev.preventDefault();
      const m = itemEls.get(selected)?.querySelector(":scope > .twm-flow-outline__row .twm-flow-outline__menu");
      if (m) openMenu(selected, m);
    }
  });
  const pressDoc = root.ownerDocument;
  root.addEventListener("pointerdown", onPressStart, true);
  pressDoc.addEventListener("pointerup", onPressEnd, true);
  pressDoc.addEventListener("pointercancel", onPressEnd, true);
  pressDoc.defaultView?.addEventListener("blur", onPressEnd);
  function moveSelection(step) {
    const items = visibleItems();
    const cur = items.indexOf(itemEls.get(selected) ?? itemEls.get("flow"));
    const next = items[Math.max(0, Math.min(items.length - 1, cur + step))];
    if (next) select(next.dataset.step || "flow", { focus: true });
    return void 0;
  }
  function leftKey() {
    const li = itemEls.get(selected);
    if (!li) return false;
    if (li.getAttribute("aria-expanded") === "true") {
      toggleFold(selected);
      return void 0;
    }
    const parent = li.parentElement?.closest('[role="treeitem"]');
    if (parent) select(parent.dataset.step || "flow", { focus: true });
    return void 0;
  }
  function rightKey() {
    const li = itemEls.get(selected);
    if (!li) return false;
    if (li.getAttribute("aria-expanded") === "false") {
      toggleFold(selected);
      return void 0;
    }
    if (li.getAttribute("aria-expanded") === "true") {
      const child = li.querySelector('.twm-flow-outline__inside [role="treeitem"]');
      if (child) select(child.dataset.step, { focus: true });
    }
    return void 0;
  }
  function armDrag(ev, id) {
    if (ev.button !== 0 || !editable() || !view) return;
    ev.preventDefault();
    ev.stopPropagation();
    endDrag(false);
    drag = { id, x: ev.clientX, y: ev.clientY, started: false, ghost: null, line: null, target: null, cache: /* @__PURE__ */ new Map() };
    const doc = root.ownerDocument;
    doc.addEventListener("pointermove", onDragMove, true);
    doc.addEventListener("pointerup", onDragUp, true);
    doc.addEventListener("pointercancel", onDragCancel, true);
    doc.addEventListener("keydown", onDragKey, true);
    root.ownerDocument.defaultView?.addEventListener("blur", onDragCancel);
  }
  function startDrag() {
    const id = drag.id;
    const ghost = el("div", "twm-flow-outline__ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.appendChild(icon("drag_indicator", "twm-flow-outline__ghost-grip"));
    const chip = el("span", `twm-flow-outline__chip ${toneClass("twm-flow-outline__chip", catalogue.tone(nodeOf(id)?.type))}`);
    chip.appendChild(icon(typeOf(id)?.icon || ""));
    ghost.append(chip, el("span", "twm-flow-outline__ghost-title", nameOf2(id)));
    root.ownerDocument.body.appendChild(ghost);
    const line = el("div", "twm-flow-outline__drop");
    line.setAttribute("aria-hidden", "true");
    line.appendChild(el("span", "twm-flow-outline__drop-label"));
    line.hidden = true;
    tree.appendChild(line);
    drag.ghost = ghost;
    drag.line = line;
    drag.started = true;
    root.classList.add("twm-flow-outline--dragging");
    itemEls.get(id)?.querySelector(":scope > .twm-flow-outline__row")?.classList.add("twm-flow-outline__row--dragging");
    drag.targets = dropTargets(id);
  }
  function dropTargets(id) {
    const item = view.index.at.get(id)?.item;
    const inside = new Set(item ? subtreeIds(item) : [id]);
    const place = view.index.at.get(id);
    const out = [];
    for (const g of collectGaps()) {
      if (g.row.closest("[hidden]")) continue;
      const owner = view.index.seqs.find((x) => x.seq === g.seq)?.owner;
      if (owner && inside.has(owner.id)) continue;
      if (g.seq === place?.seq && (g.index === place.index || g.index === place.index + 1)) continue;
      out.push(g);
    }
    return out;
  }
  function collectGaps() {
    return gapEls.map((g) => ({ ...g }));
  }
  function onDragMove(ev) {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < DRAG_START_PX) return;
      startDrag();
    }
    ev.preventDefault();
    drag.ghost.style.left = `${Math.round(ev.clientX + 12)}px`;
    drag.ghost.style.top = `${Math.round(ev.clientY + 28)}px`;
    autoScroll(ev);
    pickTarget(ev);
  }
  function autoScroll(ev) {
    const box = scroller.scrollHeight > scroller.clientHeight ? scroller : body;
    const r = box.getBoundingClientRect();
    if (!r.height) return;
    if (ev.clientY < r.top + 24) box.scrollTop -= 12;
    else if (ev.clientY > r.bottom - 24) box.scrollTop += 12;
  }
  function pickTarget(ev) {
    let best = null;
    let bestScore = Infinity;
    for (const t of drag.targets) {
      const r = t.row.getBoundingClientRect();
      const y = r.bottom;
      const x = r.left + 8 + t.depth * OUTLINE_INDENT;
      const score = Math.abs(ev.clientY - y) * 4 + Math.abs(ev.clientX - x);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    drag.target = best;
    if (!best) {
      drag.line.hidden = true;
      return;
    }
    const key = JSON.stringify(ops.anchorOf(best.seq, best.index));
    if (!drag.cache.has(key)) drag.cache.set(key, ops.move(graph, drag.id, JSON.parse(key)));
    const verdict = drag.cache.get(key);
    const tr = tree.getBoundingClientRect();
    const rr = best.row.getBoundingClientRect();
    drag.line.hidden = false;
    drag.line.style.top = `${Math.round(rr.bottom - tr.top)}px`;
    drag.line.style.setProperty("--twm-outline-depth", String(best.depth));
    drag.line.classList.toggle("twm-flow-outline__drop--refused", !verdict.ok);
    drag.line.firstChild.textContent = verdict.ok ? ops.dropWords(view, best.seq, best.index) : verdict.reason;
  }
  function onDragUp(ev) {
    if (!drag) return;
    const wasDrag = drag.started;
    if (wasDrag) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    endDrag(wasDrag);
  }
  function onDragCancel() {
    endDrag(false);
  }
  function onDragKey(ev) {
    if (ev.key === "Escape" && drag) {
      ev.preventDefault();
      ev.stopPropagation();
      endDrag(false);
    }
  }
  function endDrag(drop) {
    if (!drag) return;
    const d = drag;
    drag = null;
    const doc = root.ownerDocument;
    doc.removeEventListener("pointermove", onDragMove, true);
    doc.removeEventListener("pointerup", onDragUp, true);
    doc.removeEventListener("pointercancel", onDragCancel, true);
    doc.removeEventListener("keydown", onDragKey, true);
    doc.defaultView?.removeEventListener("blur", onDragCancel);
    d.ghost?.remove();
    d.line?.remove();
    root.classList.remove("twm-flow-outline--dragging");
    tree.querySelector(".twm-flow-outline__row--dragging")?.classList.remove("twm-flow-outline__row--dragging");
    if (!drop || !d.started) return;
    const swallow = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    doc.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => doc.removeEventListener("click", swallow, true), 0);
    if (!d.target) {
      announce(say(S, "dropNowhere"));
      return;
    }
    const key = JSON.stringify(ops.anchorOf(d.target.seq, d.target.index));
    const verdict = d.cache.get(key) ?? ops.move(graph, d.id, JSON.parse(key));
    apply(verdict, "flow:step:move");
  }
  const api = {
    el: root,
    get history() {
      return history;
    },
    get selection() {
      return selected === "flow" ? { kind: "flow", id: null } : { kind: "step", id: selected };
    },
    /** Replace the content; a baseline clears both undo stacks. */
    load({ graph: g = null, flowSettings: fs = null } = {}, { baseline = true } = {}) {
      graph = g && typeof g === "object" ? structuredClone(g) : emptyGraph();
      if (!Array.isArray(graph.nodes)) graph.nodes = [];
      if (!Array.isArray(graph.connections)) graph.connections = [];
      if (fs) settings = { ...settings || {}, ...fs, value: structuredClone(fs.value ?? settings?.value ?? {}) };
      reread();
      if (selected !== "flow" && !nodeOf(selected)) selected = "flow";
      render();
      showPanel();
      drawAside();
      if (baseline) history.baseline(stateText());
      updateTools();
    },
    /** The current graph, as the consumer's own shape (a copy). */
    getGraph() {
      return structuredClone(graph);
    },
    /** Its byte-stable text (`serialise`). */
    serialise() {
      return serialise(graph);
    },
    /** The flow's own settings, or null. */
    getFlowSettings() {
      return settings ? structuredClone(settings.value) : null;
    },
    /** The outline as text (`describeOutline`), or null when the graph is not block-shaped. */
    describe() {
      return view ? describeOutline(view.tree) : null;
    },
    /** Why the graph cannot be drawn as an outline, or null. */
    get refusal() {
      return refusal ? { ...refusal } : null;
    },
    setFindings(list2) {
      findings = findingsList(list2);
      strip.set(findings);
      panel.setFindings(findings);
      renderSoon();
    },
    setRunOverlay(o) {
      overlay = o && typeof o === "object" ? o : null;
      root.classList.toggle("twm-flow-outline--run", Boolean(overlay));
      offArm.clear();
      renderSoon();
      drawAside();
    },
    setReadOnly(next) {
      consumerRO = next || false;
      drawReadOnly();
      renderSoon();
      showPanel();
    },
    setActionState(id, state = {}) {
      actionState.set(id, { ...actionState.get(id) || {}, ...state });
      updateTools();
    },
    setStatus(text) {
      statusEl.textContent = text ?? "";
    },
    /** Select a step (unfolding the blocks around it, so it is on the screen), the flow, or nothing. */
    select(id) {
      const want = id === null || id === void 0 ? "flow" : id;
      if (want !== "flow" && reveal(want)) render();
      select(want);
    },
    focus() {
      focusSelected();
    },
    undo() {
      if (editable() && history.undo()) emit("undo");
    },
    redo() {
      if (editable() && history.redo()) emit("redo");
    },
    /** The folded blocks' ids. */
    get folds() {
      return [...folds];
    },
    setFolds(ids) {
      setFolds(Array.isArray(ids) ? ids : []);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      endDrag(false);
      closeFlowPopovers();
      unbind();
      root.removeEventListener("pointerdown", onPressStart, true);
      pressDoc.removeEventListener("pointerup", onPressEnd, true);
      pressDoc.removeEventListener("pointercancel", onPressEnd, true);
      pressDoc.defaultView?.removeEventListener("blur", onPressEnd);
      panel.destroy();
      strip.destroy();
      root.remove();
    }
  };
  if (options.graph) api.load({ graph: options.graph });
  else {
    updateTools();
    showPanel();
  }
  return api;
}

// src/flow/lanes/layout.js
var LANE_GEOMETRY = Object.freeze({
  /** The lane editor. `x = left + column·(width + gap)`, `laneTop = lane·(height + 2·lanePad + laneGap)`. */
  regular: Object.freeze({
    name: "regular",
    width: 200,
    height: 62,
    gap: 30,
    lanePad: 12,
    laneGap: 26,
    left: 12,
    right: 12,
    notch: 12,
    tipInset: 4,
    wireIn: 12,
    radius: 10,
    portDot: true
  }),
  /** The lane editor in a narrower host (two lines a card). */
  small: Object.freeze({
    name: "small",
    width: 160,
    height: 50,
    gap: 24,
    lanePad: 8,
    laneGap: 18,
    left: 10,
    right: 10,
    notch: 10,
    tipInset: 4,
    wireIn: 10,
    radius: 10,
    portDot: true
  }),
  /** The compact strip: a title a card, nothing to press. */
  strip: Object.freeze({
    name: "strip",
    width: 92,
    height: 26,
    gap: 10,
    lanePad: 0,
    laneGap: 14,
    left: 0,
    right: 0,
    notch: 8,
    tipInset: 2,
    wireIn: 6,
    radius: 10,
    portDot: false
  })
});
var CW = LANE_GEOMETRY.regular.width;
var CH = LANE_GEOMETRY.regular.height;
var GAP2 = LANE_GEOMETRY.regular.gap;
var LANE_PAD = LANE_GEOMETRY.regular.lanePad;
var LANE_GAP = LANE_GEOMETRY.regular.laneGap;
var LAYOUT_STRINGS = Object.freeze({
  lanes_two_inputs: (name) => `\u2018${name}\u2019 takes its lane from two steps at once, so the flow cannot be drawn as lanes.`,
  lanes_cycle: (name) => `\u2018${name}\u2019 leads back to itself through the steps after it, so the flow cannot be drawn as lanes.`,
  lanes_duplicate_step: (id) => `Two steps are called \u2018${id}\u2019, so the flow cannot be drawn as lanes.`
});
var isObject2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function unique(list) {
  return [...new Set(list)];
}
function stepPorts(catalogue, node, connections = []) {
  const type = catalogue?.get?.(node?.type) ?? null;
  const conns = Array.isArray(connections) ? connections : [];
  let inputs;
  let outputs;
  if (type) {
    inputs = catalogue.inputs(node.type, { flow: true }).map((p) => p.name);
    outputs = catalogue.outputs(node.type, { flow: true }).map((p) => p.name);
  } else {
    inputs = unique(conns.filter((c) => c.targetId === node?.id).map((c) => String(c.targetPort ?? "in")));
    outputs = unique(conns.filter((c) => c.sourceId === node?.id).map((c) => String(c.sourcePort ?? "out")));
  }
  return {
    known: Boolean(type),
    role: type ? type.role || "transform" : null,
    laneInput: inputs[0] ?? null,
    inputs,
    continuation: outputs[0] ?? null,
    outputs
  };
}
function nameOf(catalogue, node) {
  return node?.label || catalogue?.get?.(node?.type)?.label || String(node?.id ?? "");
}
function layoutLanes(pipeline, catalogue, { strings = null } = {}) {
  const S = { ...LAYOUT_STRINGS, ...isObject2(strings) ? strings : {} };
  const problems = [];
  const nodes = [];
  const byId = /* @__PURE__ */ new Map();
  for (const n of Array.isArray(pipeline?.nodes) ? pipeline.nodes : []) {
    if (!isObject2(n)) continue;
    const id = String(n.id);
    if (byId.has(id)) {
      if (!problems.some((p) => p.code === "lanes_duplicate_step" && p.node_id === id)) {
        problems.push({ code: "lanes_duplicate_step", node_id: id, message: S.lanes_duplicate_step(id) });
      }
      continue;
    }
    byId.set(id, n);
    nodes.push(n);
  }
  const order = new Map(nodes.map((n, i) => [String(n.id), i]));
  const ids = nodes.map((n) => String(n.id));
  const conns = [];
  (Array.isArray(pipeline?.connections) ? pipeline.connections : []).forEach((c, index) => {
    if (!isObject2(c)) return;
    const source = String(c.sourceId);
    const target = String(c.targetId);
    if (!byId.has(source) || !byId.has(target)) return;
    conns.push({
      index,
      id: c.id ?? null,
      source,
      target,
      sourcePort: String(c.sourcePort ?? "out"),
      targetPort: String(c.targetPort ?? "in"),
      ignored: false
    });
  });
  const rawConns = conns.map((c) => ({
    id: c.id,
    sourceId: c.source,
    targetId: c.target,
    sourcePort: c.sourcePort,
    targetPort: c.targetPort
  }));
  const ports = new Map(nodes.map((n) => [String(n.id), stepPorts(catalogue, n, rawConns)]));
  const incoming = new Map(ids.map((id) => [id, []]));
  const outgoing = new Map(ids.map((id) => [id, []]));
  for (const c of conns) {
    incoming.get(c.target).push(c);
    outgoing.get(c.source).push(c);
  }
  const indeg = new Map(ids.map((id) => [id, incoming.get(id).length]));
  const topo = [];
  const done = /* @__PURE__ */ new Set();
  const ready = ids.filter((id) => indeg.get(id) === 0);
  const release = (id) => {
    done.add(id);
    topo.push(id);
    for (const c of outgoing.get(id)) {
      if (c.ignored) continue;
      indeg.set(c.target, indeg.get(c.target) - 1);
      if (indeg.get(c.target) === 0 && !done.has(c.target)) ready.push(c.target);
    }
  };
  while (topo.length < ids.length) {
    if (ready.length) {
      const id = ready.shift();
      if (!done.has(id)) release(id);
      continue;
    }
    const first = ids.find((id) => !done.has(id));
    for (const c of incoming.get(first)) {
      if (!done.has(c.source) && !c.ignored) {
        c.ignored = true;
        indeg.set(first, indeg.get(first) - 1);
      }
    }
    problems.push({ code: "lanes_cycle", node_id: first, message: S.lanes_cycle(nameOf(catalogue, byId.get(first))) });
    if (indeg.get(first) === 0) ready.push(first);
  }
  const laneFeed = /* @__PURE__ */ new Map();
  for (const id of ids) {
    const lane = ports.get(id).laneInput;
    if (lane === null) continue;
    const into = incoming.get(id).filter((c) => c.targetPort === lane);
    if (into.length > 1) {
      problems.push({
        code: "lanes_two_inputs",
        node_id: id,
        message: S.lanes_two_inputs(nameOf(catalogue, byId.get(id)))
      });
    }
    const feed = into.find((c) => !c.ignored);
    if (feed) laneFeed.set(id, feed);
  }
  const successors = new Map(ids.map((id) => [id, []]));
  for (const [target, c] of [...laneFeed.entries()].sort((a, b) => a[1].index - b[1].index)) {
    successors.get(c.source).push(target);
  }
  const laneOf = /* @__PURE__ */ new Map();
  const created = [];
  const build = (root, forkOf) => {
    const lane = {
      steps: [],
      feeds: [],
      forkOf,
      parent: null,
      kind: forkOf === null ? "root" : "fork",
      unconnected: ports.get(root).laneInput !== null && !laneFeed.has(root)
    };
    created.push(lane);
    const forks = [];
    let current = root;
    while (current !== null && !laneOf.has(current)) {
      laneOf.set(current, lane);
      lane.steps.push(current);
      const next = successors.get(current).filter((t) => !laneOf.has(t));
      for (const f of next.slice(1)) forks.push([current, f]);
      current = next[0] ?? null;
    }
    for (const [from, to] of forks) if (!laneOf.has(to)) build(to, from);
  };
  for (const id of ids) if (!laneFeed.has(id) && !laneOf.has(id)) build(id, null);
  for (const id of ids) if (!laneOf.has(id)) build(id, null);
  const feedsInto = /* @__PURE__ */ new Map();
  for (const c of conns) {
    if (laneFeed.get(c.target) === c) continue;
    laneOf.get(c.source).feeds.push({ from: c.source, to: c.target, port: c.targetPort, index: c.index });
    if (!feedsInto.has(c.target)) feedsInto.set(c.target, []);
    feedsInto.get(c.target).push(c);
  }
  for (const lane of created) {
    if (lane.forkOf !== null) {
      lane.parent = laneOf.get(lane.forkOf);
      continue;
    }
    const out = lane.feeds.find((f) => laneOf.get(f.to) !== lane);
    if (out) {
      lane.parent = laneOf.get(out.to);
      lane.kind = "feeder";
    }
  }
  const preds = new Map(ids.map((id) => [id, incoming.get(id).filter((c) => !c.ignored).map((c) => c.source)]));
  const settle = (floor2) => {
    const col2 = /* @__PURE__ */ new Map();
    for (const id of topo) {
      let c = floor2.get(id) ?? 0;
      for (const p of preds.get(id)) c = Math.max(c, col2.get(p) + 1);
      col2.set(id, c);
    }
    return col2;
  };
  let floor = /* @__PURE__ */ new Map();
  let col = settle(floor);
  let moved = true;
  for (let pass = 0; moved && pass <= ids.length + 1; pass += 1) {
    moved = false;
    for (const lane of created) {
      const out = lane.feeds.filter((f) => laneOf.get(f.to) !== lane && !isIgnored(conns, f));
      if (!out.length) continue;
      let want = Infinity;
      for (const f of out) want = Math.min(want, col.get(f.to) - 1 - col.get(f.from));
      for (let shift = want; shift >= 1; shift -= 1) {
        const trial = new Map(floor);
        for (const id of lane.steps) trial.set(id, col.get(id) + shift);
        const next = settle(trial);
        if (out.every((f) => next.get(f.to) === col.get(f.to))) {
          floor = trial;
          col = next;
          moved = true;
          break;
        }
      }
    }
  }
  const created_ = new Map(created.map((l, i) => [l, i]));
  const children = new Map(created.map((l) => [l, []]));
  for (const l of created) if (l.parent && l.parent !== l) children.get(l.parent).push(l);
  const attach = (l) => {
    if (l.kind === "fork") return col.get(l.forkOf);
    const f = l.feeds.find((x) => laneOf.get(x.to) === l.parent);
    return f ? col.get(f.to) : 0;
  };
  const ordered2 = [];
  const placed = /* @__PURE__ */ new Set();
  const visit = (lane) => {
    if (placed.has(lane)) return;
    placed.add(lane);
    ordered2.push(lane);
    const kids = children.get(lane).slice().sort((a, b) => (a.kind === "fork") - (b.kind === "fork") || attach(a) - attach(b) || created_.get(a) - created_.get(b));
    for (const k of kids) visit(k);
  };
  for (const l of created) if (!l.parent) visit(l);
  for (const l of created) if (!placed.has(l)) visit(l);
  const indexOf = new Map(ordered2.map((l, i) => [l, i]));
  const at = {};
  const lanes = ordered2.map((l, index) => {
    l.steps.forEach((id, position) => {
      at[id] = { lane: index, column: col.get(id), position };
    });
    return {
      index,
      steps: l.steps.map((id) => ({ id, column: col.get(id) })),
      feeds: l.feeds.map((f) => ({ from: f.from, to: f.to, port: f.port })),
      forkOf: l.forkOf,
      unconnected: l.unconnected,
      parent: l.parent && l.parent !== l ? indexOf.get(l.parent) : null,
      kind: l.kind
    };
  });
  const wires = [];
  for (const c of conns) {
    const base = { from: c.source, to: c.target, toPort: c.targetPort, connection: c.id };
    if (laneFeed.get(c.target) === c) {
      const a = at[c.source];
      const b = at[c.target];
      const next = a.lane === b.lane && b.position === a.position + 1;
      wires.push({ kind: next ? "lane" : "fork", ...base });
      continue;
    }
    const others = ports.get(c.target).inputs.filter((p) => p !== ports.get(c.target).laneInput);
    for (const x of feedsInto.get(c.target) || []) if (!others.includes(x.targetPort)) others.push(x.targetPort);
    const slot = Math.max(0, others.indexOf(c.targetPort));
    wires.push({ kind: "join", ...base, slot, slots: Math.max(1, others.length), ...c.ignored ? { cycle: true } : {} });
  }
  const columns = ids.length ? Math.max(...ids.map((id) => col.get(id))) + 1 : 0;
  return { lanes, wires, at, columns, problems };
}
function isIgnored(conns, feed) {
  return conns.some((c) => c.ignored && c.index === feed.index);
}
var num = (v) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
function roundedPath(points, radius = 10) {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  if (!pts.length) return "";
  let d = `M${num(pts[0].x)} ${num(pts[0].y)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i];
    const prev = pts[i - 1];
    const next = pts[i + 1];
    if (!next) {
      d += p.x === prev.x ? `V${num(p.y)}` : p.y === prev.y ? `H${num(p.x)}` : `L${num(p.x)} ${num(p.y)}`;
      break;
    }
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ux = Math.sign(p.x - prev.x);
    const uy = Math.sign(p.y - prev.y);
    const vx = Math.sign(next.x - p.x);
    const vy = Math.sign(next.y - p.y);
    const a = { x: p.x - ux * r, y: p.y - uy * r };
    const b = { x: p.x + vx * r, y: p.y + vy * r };
    d += a.x === prev.x ? `V${num(a.y)}` : a.y === prev.y ? `H${num(a.x)}` : `L${num(a.x)} ${num(a.y)}`;
    d += `Q${num(p.x)} ${num(p.y)} ${num(b.x)} ${num(b.y)}`;
    pts[i] = b;
  }
  return d;
}
function placeLanes(layout, geometry = "regular") {
  const g = typeof geometry === "string" ? LANE_GEOMETRY[geometry] ?? LANE_GEOMETRY.regular : { ...LANE_GEOMETRY.regular, ...isObject2(geometry) ? geometry : {} };
  const band = g.height + 2 * g.lanePad;
  const colX = (c) => g.left + c * (g.width + g.gap);
  const laneTop = (l) => l * (band + g.laneGap);
  const cardY = (l) => laneTop(l) + g.lanePad;
  const mid = (l) => cardY(l) + g.height / 2;
  const bands = layout.lanes.map((l) => ({
    index: l.index,
    top: laneTop(l.index),
    height: band,
    unconnected: l.unconnected
  }));
  const cards = [];
  for (const l of layout.lanes) {
    for (const s of l.steps) {
      cards.push({
        id: s.id,
        lane: l.index,
        column: s.column,
        x: colX(s.column),
        y: cardY(l.index),
        w: g.width,
        h: g.height
      });
    }
  }
  const crossesACard = (points, ends) => cards.some((c) => {
    if (ends.includes(c.id)) return false;
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i - 1];
      const q = points[i];
      const x1 = Math.min(p.x, q.x);
      const x2 = Math.max(p.x, q.x);
      const y1 = Math.min(p.y, q.y);
      const y2 = Math.max(p.y, q.y);
      if (x2 > c.x && x1 < c.x + c.w && y2 > c.y && y1 < c.y + c.h) return true;
    }
    return false;
  });
  const gapBeside = (l, side) => side > 0 ? laneTop(l) + band + g.laneGap / 2 : laneTop(l) - g.laneGap / 2;
  const wires = layout.wires.map((w) => {
    const a = layout.at[w.from];
    const b = layout.at[w.to];
    const ends = [w.from, w.to];
    let points;
    let port = null;
    if (w.kind === "lane") {
      points = [
        { x: colX(a.column) + g.width - g.tipInset, y: mid(a.lane) },
        { x: colX(b.column) + g.wireIn, y: mid(b.lane) }
      ];
    } else if (w.kind === "fork") {
      const fx = colX(a.column) + g.width / 2;
      const down = b.lane > a.lane;
      const fy = down ? cardY(a.lane) + g.height : cardY(a.lane);
      points = [{ x: fx, y: fy }, { x: fx, y: mid(b.lane) }, { x: colX(b.column) + g.wireIn, y: mid(b.lane) }];
      if (b.column > a.column && crossesACard(points, ends)) {
        const gy = gapBeside(a.lane, down ? 1 : -1);
        const gx = colX(b.column) - g.gap / 2;
        points = [
          { x: fx, y: fy },
          { x: fx, y: gy },
          { x: gx, y: gy },
          { x: gx, y: mid(b.lane) },
          { x: colX(b.column) + g.wireIn, y: mid(b.lane) }
        ];
      }
    } else {
      const tx = colX(b.column) + g.width * (w.slot + 1) / (w.slots + 1);
      const sx = colX(a.column) + g.width - g.tipInset;
      if (a.lane !== b.lane && tx > sx) {
        const below = a.lane > b.lane;
        port = { x: tx, y: below ? cardY(b.lane) + g.height : cardY(b.lane) };
        points = [{ x: sx, y: mid(a.lane) }, { x: tx, y: mid(a.lane) }, port];
        if (crossesACard(points, ends)) {
          const gx = colX(a.column) + g.width + g.gap / 2;
          const gy = gapBeside(b.lane, below ? 1 : -1);
          points = [
            { x: sx, y: mid(a.lane) },
            { x: gx, y: mid(a.lane) },
            { x: gx, y: gy },
            { x: tx, y: gy },
            port
          ];
        }
      } else {
        const gy = laneTop(a.lane) + band + g.laneGap / 2;
        const fx = colX(a.column) + g.width / 2;
        port = { x: tx, y: b.lane > a.lane ? cardY(b.lane) : cardY(b.lane) + g.height };
        points = [{ x: fx, y: cardY(a.lane) + g.height }, { x: fx, y: gy }, { x: tx, y: gy }, port];
      }
    }
    return { ...w, points, d: roundedPath(points, g.radius), port: g.portDot ? port : null };
  });
  const width = layout.columns ? colX(layout.columns - 1) + g.width + g.right : 0;
  const height = layout.lanes.length ? laneTop(layout.lanes.length - 1) + band : 0;
  return { geometry: g, width, height, bands, cards, wires };
}

// src/flow/lanes/pipeline.js
var pipeline_exports = {};
__export(pipeline_exports, {
  LANE_ACTIONS: () => LANE_ACTIONS,
  PARAMETER_NAME: () => PARAMETER_NAME,
  addSource: () => addSource,
  addStepAfter: () => addStepAfter,
  downstreamOf: () => downstreamOf,
  emptyPipeline: () => emptyPipeline,
  inputCandidates: () => inputCandidates,
  inputOf: () => inputOf,
  laneFeedOf: () => laneFeedOf,
  mayFeed: () => mayFeed,
  nextConnectionId: () => nextConnectionId,
  nextStepId: () => nextStepId,
  normalisePipeline: () => normalisePipeline,
  portsOf: () => portsOf,
  removeParameter: () => removeParameter,
  removeStep: () => removeStep,
  serialisePipeline: () => serialisePipeline,
  setInput: () => setInput,
  setParameter: () => setParameter,
  upstreamOf: () => upstreamOf
});
var LANE_ACTIONS = Object.freeze([
  "flow:step:add",
  "flow:step:remove",
  "flow:step:label",
  "flow:step:config",
  "flow:join:set",
  "flow:source:add",
  "flow:parameter:add",
  "flow:parameter:change",
  "flow:parameter:remove",
  "flow:settings"
]);
var PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
var ID_OK2 = /^[A-Za-z0-9_-]{1,64}$/;
var isObject3 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var clone2 = (v) => v === void 0 ? void 0 : structuredClone(v);
var NODE_KEYS = ["id", "type", "label", "config", "position"];
var CONN_KEYS = ["id", "sourceId", "sourcePort", "targetId", "targetPort"];
var PARAM_KEYS = ["type", "default", "description"];
var TOP_KEYS = ["nodes", "connections", "parameters"];
function emptyPipeline() {
  return { nodes: [], connections: [], parameters: {} };
}
function normalisePipeline(pipeline) {
  const p = isObject3(pipeline) ? pipeline : emptyPipeline();
  const out = {
    nodes: (Array.isArray(p.nodes) ? p.nodes : []).filter(isObject3).map((n) => {
      const node = { id: String(n.id), type: String(n.type ?? "") };
      if (n.label !== void 0 && n.label !== null && String(n.label) !== "") node.label = String(n.label);
      node.config = isObject3(n.config) ? clone2(n.config) : {};
      if (n.position !== void 0 && n.position !== null) node.position = clone2(n.position);
      for (const k of Object.keys(n)) if (!NODE_KEYS.includes(k)) node[k] = clone2(n[k]);
      return node;
    }),
    connections: (Array.isArray(p.connections) ? p.connections : []).filter(isObject3).map((c) => {
      const conn = {};
      if (c.id !== void 0 && c.id !== null) conn.id = String(c.id);
      conn.sourceId = String(c.sourceId);
      conn.sourcePort = String(c.sourcePort ?? "out");
      conn.targetId = String(c.targetId);
      conn.targetPort = String(c.targetPort ?? "in");
      for (const k of Object.keys(c)) if (!CONN_KEYS.includes(k)) conn[k] = clone2(c[k]);
      return conn;
    }),
    parameters: isObject3(p.parameters) ? clone2(p.parameters) : {}
  };
  for (const k of Object.keys(p)) if (!TOP_KEYS.includes(k)) out[k] = clone2(p[k]);
  return out;
}
function sortedKeys3(value) {
  if (Array.isArray(value)) return value.map(sortedKeys3);
  if (isObject3(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortedKeys3(value[k])]));
  return value;
}
function ordered(obj, known, transform = {}) {
  const out = {};
  for (const k of known) {
    if (obj[k] === void 0) continue;
    out[k] = transform[k] ? transform[k](obj[k]) : obj[k];
  }
  for (const k of Object.keys(obj).filter((x) => !known.includes(x)).sort()) out[k] = sortedKeys3(obj[k]);
  return out;
}
function serialisePipeline(pipeline) {
  const p = normalisePipeline(pipeline);
  const top = {
    nodes: p.nodes.map((n) => ordered(n, NODE_KEYS, { config: sortedKeys3, position: sortedKeys3 })),
    connections: p.connections.map((c) => ordered(c, CONN_KEYS)),
    parameters: Object.fromEntries(Object.entries(p.parameters).map(([k, v]) => [k, isObject3(v) ? ordered(v, PARAM_KEYS, { default: sortedKeys3 }) : sortedKeys3(v)]))
  };
  for (const k of Object.keys(p).filter((x) => !TOP_KEYS.includes(x)).sort()) top[k] = sortedKeys3(p[k]);
  return JSON.stringify(top);
}
function nextConnectionId(pipeline) {
  const taken = new Set((pipeline?.connections || []).map((c) => String(c.id)));
  for (let i = 1; ; i += 1) if (!taken.has(`c${i}`)) return `c${i}`;
}
function nextStepId(pipeline, typeId, catalogue = null) {
  const base = catalogue?.idBase ? catalogue.idBase(typeId) : String(typeId || "step").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40) || "step";
  const taken = new Set((pipeline?.nodes || []).map((n) => String(n.id)));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i += 1) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
var findNode = (p, id) => p.nodes.find((n) => n.id === id) ?? null;
function portsOf(pipeline, catalogue, id) {
  const node = findNode(pipeline, id);
  return node ? stepPorts(catalogue, node, pipeline.connections) : null;
}
function laneFeedOf(pipeline, catalogue, id) {
  const ports = portsOf(pipeline, catalogue, id);
  if (!ports || ports.laneInput === null) return null;
  return pipeline.connections.find((c) => c.targetId === id && c.targetPort === ports.laneInput) ?? null;
}
function inputOf(pipeline, id, port) {
  return pipeline.connections.find((c) => c.targetId === id && c.targetPort === port) ?? null;
}
function downstreamOf(pipeline, id) {
  const seen = /* @__PURE__ */ new Set();
  const todo = [id];
  while (todo.length) {
    const at = todo.shift();
    for (const c of pipeline.connections) {
      if (c.sourceId !== at || seen.has(c.targetId)) continue;
      seen.add(c.targetId);
      todo.push(c.targetId);
    }
  }
  return seen;
}
function upstreamOf(pipeline, id) {
  const dist = /* @__PURE__ */ new Map();
  const todo = [[id, 0]];
  while (todo.length) {
    const [at, d] = todo.shift();
    for (const c of pipeline.connections) {
      if (c.targetId !== at || dist.has(c.sourceId) || c.sourceId === id) continue;
      dist.set(c.sourceId, d + 1);
      todo.push([c.sourceId, d + 1]);
    }
  }
  const order = new Map(pipeline.nodes.map((n, i) => [n.id, i]));
  return [...dist.keys()].sort((a, b) => dist.get(a) - dist.get(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
function newNode(pipeline, catalogue, typeId, { id = null, label = null, config = null } = {}) {
  const nid = id && ID_OK2.test(id) && !findNode(pipeline, id) ? id : nextStepId(pipeline, typeId, catalogue);
  return {
    id: nid,
    type: typeId,
    ...label ? { label: String(label) } : {},
    config: isObject3(config) ? clone2(config) : {}
  };
}
function addStepAfter(pipeline, catalogue, afterId, typeId, opts = {}) {
  const after = findNode(pipeline, afterId);
  if (!after) return null;
  const node = newNode(pipeline, catalogue, typeId, opts);
  pipeline.nodes.push(node);
  const a = stepPorts(catalogue, after, pipeline.connections);
  const n = stepPorts(catalogue, node, pipeline.connections);
  if (a.continuation === null || n.laneInput === null) return node;
  const outs = pipeline.connections.filter((c) => c.sourceId === afterId && c.sourcePort === a.continuation);
  const isLaneFeed = (c) => laneFeedOf(pipeline, catalogue, c.targetId) === c;
  const splice = n.continuation === null ? null : outs.find(isLaneFeed) ?? outs[0] ?? null;
  const join = {
    id: nextConnectionId(pipeline),
    sourceId: afterId,
    sourcePort: a.continuation,
    targetId: node.id,
    targetPort: n.laneInput
  };
  if (splice) {
    const at = pipeline.connections.indexOf(splice);
    splice.sourceId = node.id;
    splice.sourcePort = n.continuation;
    pipeline.connections.splice(at, 0, join);
  } else {
    pipeline.connections.push(join);
  }
  return node;
}
function addSource(pipeline, catalogue, typeId, opts = {}) {
  const node = newNode(pipeline, catalogue, typeId, opts);
  pipeline.nodes.push(node);
  return node;
}
function removeStep(pipeline, catalogue, id) {
  if (!findNode(pipeline, id)) return false;
  const feed = laneFeedOf(pipeline, catalogue, id);
  const kept = [];
  for (const c of pipeline.connections) {
    if (c.targetId === id) continue;
    if (c.sourceId === id) {
      if (!feed || feed.sourceId === c.targetId) continue;
      const twin = kept.some((k) => k.sourceId === feed.sourceId && k.sourcePort === feed.sourcePort && k.targetId === c.targetId && k.targetPort === c.targetPort);
      if (twin) continue;
      c.sourceId = feed.sourceId;
      c.sourcePort = feed.sourcePort;
    }
    kept.push(c);
  }
  pipeline.connections = kept;
  pipeline.nodes = pipeline.nodes.filter((n) => n.id !== id);
  return true;
}
function mayFeed(pipeline, stepId, sourceId) {
  if (!sourceId || sourceId === stepId) return false;
  return !downstreamOf(pipeline, stepId).has(sourceId);
}
function setInput(pipeline, catalogue, stepId, port, sourceId) {
  if (!findNode(pipeline, stepId)) return false;
  const existing = pipeline.connections.filter((c) => c.targetId === stepId && c.targetPort === port);
  if (!sourceId) {
    if (!existing.length) return false;
    pipeline.connections = pipeline.connections.filter((c) => !existing.includes(c));
    return true;
  }
  const source = findNode(pipeline, sourceId);
  if (!source || !mayFeed(pipeline, stepId, sourceId)) return false;
  const out = stepPorts(catalogue, source, pipeline.connections).continuation ?? "out";
  if (existing.length === 1 && existing[0].sourceId === sourceId && existing[0].sourcePort === out) return false;
  if (existing.length) {
    existing[0].sourceId = sourceId;
    existing[0].sourcePort = out;
    pipeline.connections = pipeline.connections.filter((c) => c === existing[0] || !existing.includes(c));
  } else {
    pipeline.connections.push({
      id: nextConnectionId(pipeline),
      sourceId,
      sourcePort: out,
      targetId: stepId,
      targetPort: port
    });
  }
  return true;
}
function inputCandidates(pipeline, catalogue, layout, stepId) {
  const below = downstreamOf(pipeline, stepId);
  const ok = (id) => id !== stepId && !below.has(id) && portsOf(pipeline, catalogue, id)?.continuation !== null;
  const out = [];
  for (const lane of layout?.lanes || []) {
    for (const s of lane.steps) if (ok(s.id)) out.push({ id: s.id, lane: lane.index, column: s.column });
  }
  return out;
}
function setParameter(pipeline, name, definition, { rename = null } = {}) {
  const def = {};
  if (definition?.type !== void 0) def.type = definition.type;
  if (definition?.default !== void 0) def.default = clone2(definition.default);
  if (definition?.description !== void 0 && definition.description !== "") def.description = definition.description;
  const from = rename ?? name;
  const entries = Object.entries(pipeline.parameters || {});
  const at = entries.findIndex(([k]) => k === from);
  if (at >= 0) entries.splice(at, 1, [name, def]);
  else entries.push([name, def]);
  pipeline.parameters = Object.fromEntries(entries.filter(([k], i) => k !== name || entries.findIndex(([x]) => x === k) === i));
  return pipeline.parameters[name];
}
function removeParameter(pipeline, name) {
  if (!pipeline.parameters || !(name in pipeline.parameters)) return false;
  const { [name]: _gone, ...rest } = pipeline.parameters;
  pipeline.parameters = rest;
  return true;
}

// src/flow/lanes/preview.js
function createPreviewRunner({
  preview = null,
  describe = null,
  delayMs = 800,
  request,
  onAnswer = null,
  onError = null,
  onState = null,
  onDropped = null,
  clock = null
} = {}) {
  const timers = {
    set: clock?.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
    clear: clock?.clearTimeout ?? ((h) => clearTimeout(h))
  };
  const providers = [["preview", preview], ["describe", describe]].filter(([, fn]) => typeof fn === "function");
  let timer = null;
  let seq = 0;
  let live = null;
  let destroyed = false;
  const state = () => ({
    enabled: providers.length > 0,
    waiting: timer !== null,
    busy: Boolean(live && live.pending.size > 0),
    seq
  });
  const told = () => onState?.(state());
  function send() {
    timer = null;
    if (destroyed) return;
    const mine = seq;
    const controller = new AbortController();
    const pending = new Set(providers.map(([kind]) => kind));
    live = { seq: mine, controller, pending };
    const input = { ...request?.() ?? {}, signal: controller.signal, seq: mine };
    told();
    for (const [kind, fn] of providers) {
      let answer;
      try {
        answer = Promise.resolve(fn(input));
      } catch (err) {
        answer = Promise.reject(err);
      }
      const stale = () => destroyed || mine !== seq || controller.signal.aborted;
      answer.then((value) => {
        if (stale()) {
          onDropped?.({ kind, seq: mine });
          return;
        }
        pending.delete(kind);
        onAnswer?.({ kind, answer: value, seq: mine });
        told();
      }, (error) => {
        if (stale()) {
          onDropped?.({ kind, seq: mine });
          return;
        }
        pending.delete(kind);
        onError?.({ kind, error, seq: mine });
        told();
      });
    }
  }
  return {
    get enabled() {
      return providers.length > 0;
    },
    get seq() {
      return seq;
    },
    get state() {
      return state();
    },
    /** An edit: everything asked before it is stale; ask again `delayMs` after the last one. */
    schedule({ immediate = false } = {}) {
      if (destroyed || !providers.length) return;
      seq += 1;
      if (live) {
        live.controller.abort();
        live = null;
      }
      if (timer !== null) timers.clear(timer);
      timer = timers.set(send, immediate ? 0 : delayMs);
      told();
    },
    /** Ask now, without waiting for the debounce. */
    now() {
      if (destroyed || !providers.length) return;
      seq += 1;
      if (live) {
        live.controller.abort();
        live = null;
      }
      if (timer !== null) timers.clear(timer);
      timer = null;
      send();
    },
    destroy() {
      destroyed = true;
      if (timer !== null) timers.clear(timer);
      timer = null;
      live?.controller.abort();
      live = null;
    }
  };
}

// src/flow/lanes/strings.js
var count = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : String(n);
var plural3 = (n, one, many) => Number(n) === 1 ? one : many.replace("{n}", count(n));
var LANE_STRINGS = Object.freeze({
  // ── the lanes ──────────────────────────────────────────────────────
  lanesLabel: "The flow, left to right",
  laneName: (n, title) => `Lane ${n}: ${title}`,
  laneNameUnconnected: (n, title) => `Lane ${n}: ${title} \u2014 not connected`,
  notConnected: "Not connected",
  cardLabel: (kind, title, status) => status ? `${kind}: ${title}, ${status}` : `${kind}: ${title}`,
  addAfter: (title) => `Add a step after ${title}`,
  addSourceTitle: "Add a source",
  startsLane: "starts a new lane",
  afterStep: (title) => `after ${title}`,
  addHint: "\u201C+\u201D on a step adds the next one. A join takes its other input from another lane; the lines are drawn for you, never by hand.",
  emptyFlow: "Nothing here yet. A source starts the first lane.",
  stepMenu: (title) => `${title}: what to do`,
  openSettings: "Open its settings",
  addStepAfter: "Add a step after it",
  // ── the toolbar ────────────────────────────────────────────────────
  toolbar: "Flow",
  readOnlyTitle: "This flow is open to read only.",
  // ── parameters ─────────────────────────────────────────────────────
  parameters: "Parameters",
  addParameter: "Add parameter",
  parameterTitle: "Parameter",
  parameterLine: (type, value) => value === void 0 ? String(type ?? "") : `${type ?? ""} \xB7 default ${value}`,
  parameterAria: (name, line) => `Parameter ${name}: ${line}`,
  parameterHelp: (ref) => `Steps read it as ${ref}.`,
  parameterSupplied: "Whatever starts the flow supplies it.",
  parameterName: "Name",
  parameterType: "Type",
  parameterDefault: "Default",
  parameterNoDefault: "No default",
  parameterDescription: "Description",
  parameterSave: "Save",
  parameterCancel: "Cancel",
  parameterRemove: "Remove parameter",
  parameterNameRule: "A name starts with a letter or _ and goes on with letters, digits or _.",
  parameterNameTaken: (name) => `There is already a parameter called ${name}.`,
  parameterNotNumber: "The default must be a number.",
  parameterNotInteger: "The default must be a whole number.",
  // ── a step's settings ──────────────────────────────────────────────
  thisLane: "This lane",
  thisLaneHelp: "The step before it, in its own lane.",
  connectIt: "Choose the step it follows.",
  joinedWith: "Joined with",
  joinedWithPort: (label) => `Joined with (${label})`,
  joinedWithHelp: "Any step in another lane, to the left of this one.",
  laneRelation: (delta, lane) => delta === 0 ? "this lane" : delta === 1 ? "the lane below" : delta === -1 ? "the lane above" : `lane ${lane}`,
  candidate: (title, relation) => `${title} \u2014 ${relation}`,
  chooseStep: "Choose a step to see its settings.",
  flowTab: "The flow",
  flowTitle: "The flow",
  flowType: "Settings",
  stepsLabel: "Steps",
  // ── the dock ───────────────────────────────────────────────────────
  dataLabel: "What this step gives",
  previewTab: "Preview",
  columnsTab: (n) => `Columns \xB7 ${count(n)}`,
  rejectsTab: (n) => `Would be rejected \xB7 ${count(n)}`,
  previewOn: (ms) => `Preview on \xB7 refreshed ${count(ms)} ms after your last change`,
  previewing: "Previewing\u2026",
  previewFailed: "The preview could not be read.",
  previewOff: "No preview here.",
  noPreview: "Nothing previewed for this step yet.",
  previewCaption: (shown, total) => `First ${count(shown)} of ${count(total)} previewed rows.`,
  columnsFromDescription: (n) => `${plural3(n, "1 column", "{n} columns")}, from the step\u2019s description \u2014 no run needed.`,
  columnsFromPreview: (n) => `${plural3(n, "1 column", "{n} columns")}, from the preview.`,
  columnsUnknown: "No columns known for this step yet.",
  columnNew: "new",
  columnChanged: "changed",
  rejectsCaption: (n) => `${plural3(n, "1 of the previewed rows would be rejected.", "{n} of the previewed rows would be rejected.")}`,
  noRejects: "No previewed row would be rejected.",
  rejectReason: (column, reason) => column ? `${column}: ${reason}` : String(reason ?? ""),
  noRows: "No rows.",
  // ── what a card's status line says ─────────────────────────────────
  rows: (n) => plural3(n, "1 row", "{n} rows"),
  rejected: (n) => `${count(n)} rejected`,
  skipped: "skipped",
  stepFailed: "failed in the preview",
  notRun: "Not in the last run",
  noRun: "No run to show",
  pending: "\u2026"
});

// src/flow/lanes/editor.js
var SVG2 = "http://www.w3.org/2000/svg";
var ROLES = ["source", "transform", "operation", "sink"];
var LINE_TONES = ["ok", "warning", "error", "muted", "info"];
var RUN_TONES = Object.freeze({
  success: "ok",
  cached: "muted",
  error: "error",
  skipped: "muted",
  cancelled: "muted",
  running: "info"
});
var PARAMETER_TYPES = Object.freeze(["text", "number", "integer", "boolean", "date"]);
var isObject4 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var clone3 = (v) => v === void 0 ? void 0 : structuredClone(v);
var lineTone = (t) => t === "warn" ? "warning" : LINE_TONES.includes(t) ? t : "muted";
function sortedKeys4(value) {
  if (Array.isArray(value)) return value.map(sortedKeys4);
  if (isObject4(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortedKeys4(value[k])]));
  return value;
}
function createLaneEditor(host, options = {}) {
  if (!host) throw new Error("createLaneEditor needs a host element.");
  const S = createStrings(LANE_STRINGS, options.strings);
  const compact = Boolean(options.compact);
  const size = compact ? options.compact?.size === "small" ? "small" : "strip" : options.size === "small" ? "small" : "regular";
  const catalogue = Array.isArray(options.catalogue) ? createStepCatalogue(options.catalogue, { categories: options.categories }) : options.catalogue;
  if (!catalogue?.get) throw new Error("createLaneEditor needs a step catalogue (createStepCatalogue()).");
  const widgets = options.widgets ?? createWidgetRegistry();
  const references = options.references ?? {};
  const slots = options.slots ?? {};
  const showTabs = !compact && options.stepTabs !== false;
  const showParams = !compact && options.parameters !== false;
  const parameterTypes = (Array.isArray(options.parameterTypes) && options.parameterTypes.length ? options.parameterTypes : PARAMETER_TYPES).map((t) => isObject4(t) ? { id: String(t.id), label: t.label ?? String(t.id) } : { id: String(t), label: String(t) });
  const delayMs = Number.isFinite(options.previewDelayMs) ? options.previewDelayMs : 800;
  let pipeline = emptyPipeline();
  let flowSchema = isObject4(options.flowSettings?.schema) ? options.flowSettings.schema : null;
  let flowValue = isObject4(options.flowSettings?.value) ? clone3(options.flowSettings.value) : flowSchema ? {} : null;
  let layout = layoutLanes(pipeline, catalogue);
  let placed = placeLanes(layout, size);
  let selected = null;
  let readOnlyOpt = options.readOnly || false;
  let findings = [];
  let byNode = /* @__PURE__ */ new Map();
  let runOverlay = null;
  let mode = "preview";
  let previewNodes = {};
  let previewError = null;
  let describeNodes = {};
  let previewState = { enabled: false, waiting: false, busy: false };
  let dockTab = "preview";
  let table = null;
  let lastRunAsk = null;
  let destroyed = false;
  let travelling = null;
  let shownColumns = "";
  let panelReadOnly = false;
  const node = (id) => pipeline.nodes.find((n) => n.id === id) ?? null;
  const typeOf = (n) => catalogue.get(n?.type) ?? null;
  const typeLabel = (n) => typeOf(n)?.label ?? String(n?.type ?? "");
  const titleOf2 = (id) => {
    const n = node(id);
    return n ? n.label || typeLabel(n) : String(id);
  };
  const roleOf2 = (n) => {
    const r = typeOf(n)?.role;
    return ROLES.includes(r) ? r : "transform";
  };
  const problems = () => layout.problems;
  const isReadOnly = () => compact || Boolean(readOnlyOpt) || problems().length > 0;
  const readOnlyReason = () => {
    const lines = [];
    if (readOnlyOpt && typeof readOnlyOpt === "object" && readOnlyOpt.reason) lines.push(String(readOnlyOpt.reason));
    for (const p of problems()) lines.push(p.message);
    if (!lines.length && readOnlyOpt) lines.push(say(S, "readOnlyTitle"));
    return lines;
  };
  const stepOrder = () => placed.cards.slice().sort((a, b) => a.column - b.column || a.lane - b.lane).map((c) => c.id);
  const root = el("div", `twm-flow-lanes twm-flow-lanes--${size}${compact ? " twm-flow-lanes--compact" : ""}${options.height === "auto" ? " twm-flow-lanes--auto" : ""}`);
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", options.label ?? say(S, "lanesLabel"));
  const banner = el("div", "twm-flow-lanes__readonly");
  banner.setAttribute("role", "status");
  banner.hidden = true;
  let toolbar = null;
  let undoBtn = null;
  let redoBtn = null;
  let statusEl = null;
  let showPreviewBtn = null;
  let showRunBtn = null;
  const actionButtons = /* @__PURE__ */ new Map();
  if (!compact) {
    toolbar = el("div", "twm-flow-lanes__toolbar");
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", say(S, "toolbar"));
    if (typeof slots.toolbarStart === "function") {
      const box = el("div", "twm-flow-lanes__toolbar-slot");
      slots.toolbarStart(box);
      toolbar.appendChild(box);
    }
    undoBtn = button({ label: say(S, "undo"), icon: "undo", title: say(S, "undoTitle"), onClick: () => undo() });
    redoBtn = button({ label: say(S, "redo"), icon: "redo", title: say(S, "redoTitle"), onClick: () => redo() });
    undoBtn.dataset.action = "undo";
    redoBtn.dataset.action = "redo";
    toolbar.append(undoBtn, redoBtn);
    const verbs = Array.isArray(options.actions) ? options.actions : [];
    if (verbs.length) {
      const sep = el("span", "twm-flow-lanes__toolbar-sep");
      sep.setAttribute("aria-hidden", "true");
      toolbar.appendChild(sep);
      const box = el("div", "twm-flow-lanes__actions");
      for (const a of verbs) {
        const wrap = el("span", "twm-flow-lanes__action");
        const b = button({
          label: a.label ?? a.id,
          icon: a.icon || null,
          primary: Boolean(a.primary),
          onClick: () => {
            if (!b.disabled) a.run?.({ editor: api });
          }
        });
        b.dataset.action = String(a.id);
        const why = el("span", "twm-flow-lanes__refusal");
        why.hidden = true;
        wrap.append(b, why);
        box.appendChild(wrap);
        actionButtons.set(String(a.id), { wrap, b, why });
      }
      toolbar.appendChild(box);
    }
    statusEl = el("span", "twm-flow-lanes__status");
    statusEl.setAttribute("aria-live", "polite");
    toolbar.appendChild(statusEl);
    toolbar.appendChild(el("span", "twm-flow-lanes__spacer"));
    const showId = uid("lanes-show");
    const showLabel = el("span", "twm-flow-lanes__show-label", say(S, "stepsShow"));
    showLabel.id = showId;
    const show = el("div", "twm-flow-lanes__show");
    show.setAttribute("role", "group");
    show.setAttribute("aria-labelledby", showId);
    showPreviewBtn = el("button", "twm-flow-lanes__show-btn", say(S, "thePreview"));
    showRunBtn = el("button", "twm-flow-lanes__show-btn", say(S, "theLastRun"));
    for (const [b, m] of [[showPreviewBtn, "preview"], [showRunBtn, "run"]]) {
      b.type = "button";
      b.dataset.mode = m;
      b.addEventListener("click", () => setStepsShow(m));
      show.appendChild(b);
    }
    toolbar.append(showLabel, show);
    if (typeof slots.toolbarEnd === "function") {
      const box = el("div", "twm-flow-lanes__toolbar-slot");
      slots.toolbarEnd(box);
      toolbar.appendChild(box);
    }
  }
  const strip = compact ? null : createFindingsStrip({
    strings: S,
    nameOf: (id) => id ? titleOf2(id) : say(S, "theFlow"),
    onGoTo: (f) => goTo(f)
  });
  const params = showParams ? el("div", "twm-flow-lanes__params") : null;
  const flow = el("section", "twm-flow-lanes__flow");
  flow.setAttribute("aria-label", say(S, "lanesLabel"));
  const runBanner = el("p", "twm-flow-lanes__banner");
  runBanner.hidden = true;
  const scroller = el("div", "twm-flow-lanes__scroller");
  const surface = el("div", "twm-flow-lanes__surface");
  scroller.appendChild(surface);
  const empty = el("p", "twm-flow-lanes__empty", say(S, "emptyFlow"));
  empty.hidden = true;
  flow.append(runBanner, scroller, empty);
  let addSourceBtn = null;
  if (!compact) {
    const foot = el("div", "twm-flow-lanes__foot");
    addSourceBtn = el("button", "twm-flow-lanes__add-source");
    addSourceBtn.type = "button";
    addSourceBtn.setAttribute("aria-haspopup", "dialog");
    addSourceBtn.append(icon("add"), el("span", "", say(S, "addSource")));
    addSourceBtn.addEventListener("click", () => pickSource());
    foot.append(addSourceBtn, el("span", "twm-flow-lanes__hint", say(S, "addHint")));
    flow.appendChild(foot);
  }
  let tabs = null;
  let dock = null;
  let settingsCol = null;
  let settingsHint = null;
  let dataCol = null;
  let dataTabs = null;
  let dataState = null;
  let dataBody = null;
  let panel = null;
  const dockId = uid("lanes-dock");
  if (!compact) {
    if (showTabs) {
      tabs = el("div", "twm-flow-lanes__tabs");
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", say(S, "stepsLabel"));
    }
    dock = el("div", "twm-flow-lanes__dock");
    dock.id = dockId;
    if (showTabs) dock.setAttribute("role", "tabpanel");
    if (options.height === "auto") dock.style.height = `${Number(options.dockHeight) || 360}px`;
    settingsCol = el("div", "twm-flow-lanes__settings");
    settingsHint = el("p", "twm-flow-lanes__settings-hint", say(S, "chooseStep"));
    settingsHint.hidden = true;
    settingsCol.appendChild(settingsHint);
    dataCol = el("section", "twm-flow-lanes__data");
    dataCol.setAttribute("aria-label", say(S, "dataLabel"));
    dataTabs = el("div", "twm-flow-lanes__datatabs");
    dataState = el("span", "twm-flow-lanes__datastate");
    dataState.setAttribute("aria-live", "polite");
    dataBody = el("div", "twm-flow-lanes__databody");
    dataCol.append(dataTabs, dataBody);
    dock.append(settingsCol, dataCol);
    panel = createSettingsPanel({
      widgets,
      references,
      strings: S,
      services: options.services ?? null,
      readOnly: false,
      onChange: (stepId, key, value) => changeSetting(stepId, key, value),
      onRename: (stepId, label) => rename(stepId, label),
      onFocusLost: () => focusCard(selected),
      values: typeof options.values === "function" ? (q) => options.values({
        pipeline: getGraph(),
        graph: getGraph(),
        stepId: q.stepId,
        field: q.field,
        key: q.key,
        upstream: q.stepId ? upstreamOf(pipeline, q.stepId) : [],
        parameters: clone3(pipeline.parameters)
      }) : null,
      valuesNote: options.valuesNote ?? null,
      columns: (step) => step ? inputColumns(step.id) : null,
      host: settingsCol
    });
  }
  root.append(banner);
  if (toolbar) root.appendChild(toolbar);
  if (strip) root.appendChild(strip.el);
  if (params) root.appendChild(params);
  root.appendChild(flow);
  if (tabs) root.appendChild(tabs);
  if (dock) root.appendChild(dock);
  host.appendChild(root);
  const snapshot = () => JSON.stringify([serialisePipeline(pipeline), flowValue === null ? null : sortedKeys4(flowValue)]);
  const history = new FlowHistory({
    actions: LANE_ACTIONS,
    restore: (state) => restore(state),
    onState: () => paintToolbar(),
    limit: options.history?.limit ?? 100,
    mergeMs: options.history?.mergeMs ?? 1e3,
    ...typeof options.history?.now === "function" ? { now: options.history.now } : {}
  });
  const runner = createPreviewRunner({
    preview: compact ? null : options.preview,
    describe: compact ? null : options.describe,
    delayMs,
    clock: options.clock ?? null,
    request: () => ({ pipeline: getGraph(), text: serialisePipeline(pipeline), parameters: clone3(pipeline.parameters) }),
    onAnswer: ({ kind, answer }) => {
      if (kind === "preview") {
        previewNodes = isObject4(answer?.nodes) ? answer.nodes : {};
        previewError = null;
      } else {
        describeNodes = isObject4(answer?.nodes) ? answer.nodes : {};
      }
      paintCards();
      paintDock();
      reshowForColumns();
    },
    onError: ({ kind, error }) => {
      if (error?.name === "AbortError") return;
      if (kind === "preview") previewError = String(error?.message || say(S, "previewFailed"));
      paintDock();
    },
    onState: (s) => {
      previewState = s;
      paintDataState();
    }
  });
  previewState = runner.state;
  function report(action, key = null) {
    options.onChange?.({
      graph: getGraph(),
      pipeline: getGraph(),
      flowSettings: flowValue === null ? null : clone3(flowValue),
      text: serialisePipeline(pipeline),
      action,
      key
    });
  }
  function commit(action, key = null, { preview = true } = {}) {
    const moved = history.commit(snapshot(), action, key);
    if (!moved) return false;
    report(action, key);
    if (preview) runner.schedule();
    return true;
  }
  function restore(state) {
    let text = null;
    let settings = null;
    try {
      [text, settings] = JSON.parse(state);
    } catch {
      return;
    }
    pipeline = normalisePipeline(JSON.parse(text));
    flowValue = settings === null ? null : settings;
    relayout();
    if (selected && selected !== "flow" && !node(selected)) selected = firstStep();
    paintAll();
    runner.schedule();
    report(travelling ?? "undo");
  }
  function undo() {
    if (isReadOnly() || !history.canUndo) return false;
    travelling = "undo";
    try {
      return history.undo();
    } finally {
      travelling = null;
    }
  }
  function redo() {
    if (isReadOnly() || !history.canRedo) return false;
    travelling = "redo";
    try {
      return history.redo();
    } finally {
      travelling = null;
    }
  }
  function relayout() {
    layout = layoutLanes(pipeline, catalogue, { strings: options.strings });
    placed = placeLanes(layout, size);
    byNode = groupFindings(findings, { graph: pipeline });
  }
  function firstStep() {
    return stepOrder()[0] ?? null;
  }
  function rovingStep() {
    return selected && selected !== "flow" && layout.at[selected] ? selected : firstStep();
  }
  function statusOf(id) {
    const fs = byNode.get(id) || [];
    if (fs.length) {
      const err = fs.find((f) => f.severity !== "warning");
      return { text: String((err ?? fs[0]).message ?? ""), tone: err ? "error" : "warning" };
    }
    if (mode === "run") {
      if (!runOverlay) return { text: say(S, "noRun"), tone: "muted" };
      const s = runOverlay.steps?.[id];
      if (!s) return { text: say(S, "notRun"), tone: "muted" };
      return { text: String(s.line ?? s.state ?? ""), tone: lineTone(s.tone ?? RUN_TONES[s.state]) };
    }
    if (!runner.enabled) return { text: "", tone: "muted" };
    const n = previewNodes[id];
    if (!n) return { text: say(S, "pending"), tone: "muted" };
    if (n.status === "error") return { text: String(n.error?.message || say(S, "stepFailed")), tone: "error" };
    if (n.status === "skipped") return { text: say(S, "skipped"), tone: "muted" };
    const rejected = Array.isArray(n.rejects) ? n.rejects.length : 0;
    if (rejected) return { text: say(S, "rejected", rejected), tone: "warning" };
    if (n.rows !== void 0 && n.rows !== null) return { text: say(S, "rows", n.rows), tone: "ok" };
    return { text: "", tone: "muted" };
  }
  function subOf(n) {
    const type = typeOf(n);
    const line = typeof options.summarise === "function" ? options.summarise(n, type) : typeLabel(n);
    const title = n.label || typeLabel(n);
    return line && line !== title ? String(line) : "";
  }
  function canAddAfter(id) {
    const n = node(id);
    if (!n || isReadOnly() || roleOf2(n) === "sink") return false;
    return stepPorts(catalogue, n, pipeline.connections).continuation !== null;
  }
  function heldInSurface() {
    const a = root.ownerDocument.activeElement;
    if (!a || !surface.contains(a)) return null;
    const holder = a.closest("[data-step]");
    if (!holder) return null;
    return { step: holder.dataset.step, add: a.classList.contains("twm-flow-lanes__add") };
  }
  function paintLanes() {
    const held = heldInSurface();
    surface.replaceChildren();
    surface.style.width = `${placed.width}px`;
    surface.style.height = `${placed.height}px`;
    empty.hidden = placed.cards.length > 0;
    scroller.hidden = placed.cards.length === 0;
    const svg = document.createElementNS(SVG2, "svg");
    svg.setAttribute("class", "twm-flow-lanes__wires");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", String(placed.width));
    svg.setAttribute("height", String(placed.height));
    svg.setAttribute("viewBox", `0 0 ${placed.width} ${placed.height}`);
    for (const w of placed.wires) {
      const path = document.createElementNS(SVG2, "path");
      path.setAttribute("class", `twm-flow-lanes__wire${w.cycle ? " twm-flow-lanes__wire--cycle" : ""}`);
      path.dataset.kind = w.kind;
      path.setAttribute("d", w.d);
      path.dataset.from = w.from;
      path.dataset.to = w.to;
      path.dataset.port = w.toPort;
      svg.appendChild(path);
    }
    for (const w of placed.wires) {
      if (!w.port) continue;
      const dot = document.createElementNS(SVG2, "circle");
      dot.setAttribute("class", "twm-flow-lanes__port");
      dot.setAttribute("cx", String(w.port.x));
      dot.setAttribute("cy", String(w.port.y));
      dot.setAttribute("r", "5");
      dot.dataset.to = w.to;
      dot.dataset.port = w.toPort;
      svg.appendChild(dot);
    }
    const bands = placed.bands.map((b) => {
      const lane = el("div", `twm-flow-lanes__lane${b.unconnected ? " twm-flow-lanes__lane--unconnected" : ""}`);
      lane.style.top = `${b.top}px`;
      lane.style.height = `${b.height}px`;
      lane.dataset.lane = String(b.index);
      const first = layout.lanes[b.index].steps[0]?.id;
      lane.setAttribute("role", "group");
      lane.setAttribute("aria-label", say(
        S,
        b.unconnected ? "laneNameUnconnected" : "laneName",
        b.index + 1,
        first ? titleOf2(first) : ""
      ));
      if (b.unconnected && !compact) lane.appendChild(el("span", "twm-flow-lanes__flag", say(S, "notConnected")));
      return lane;
    });
    surface.append(...bands, svg);
    const roving = rovingStep();
    for (const c of placed.cards) {
      const n = node(c.id);
      if (!n) continue;
      bands[c.lane].appendChild(compact ? stripCard(n, c) : card(n, c, roving));
    }
    paintCards();
    if (held && !destroyed) {
      const target = surface.querySelector(`[data-step="${cssEscape(held.step)}"] ${held.add ? ".twm-flow-lanes__add" : ".twm-flow-lanes__card"}`) || surface.querySelector(`[data-step="${cssEscape(held.step)}"] .twm-flow-lanes__card`);
      if (target) target.focus({ preventScroll: true });
      else focusCard(selected);
    }
  }
  function card(n, c, roving) {
    const role = roleOf2(n);
    const tone = toneOf(catalogue.tone(n.type));
    const wrap = el("div", `twm-flow-lanes__node twm-flow-lanes__node--${role} twm-flow-lanes__node--${tone}`);
    wrap.dataset.step = n.id;
    wrap.style.left = `${c.x}px`;
    wrap.style.top = `${c.y - placed.bands[c.lane].top}px`;
    const b = el("button", "twm-flow-lanes__card");
    b.type = "button";
    b.setAttribute("data-twm-flow-item", "");
    b.tabIndex = n.id === roving ? 0 : -1;
    const body = el("span", "twm-flow-lanes__body");
    const glyph = el("span", "twm-flow-lanes__icon");
    glyph.setAttribute("aria-hidden", "true");
    glyph.appendChild(icon(typeOf(n)?.icon || ""));
    const sep = el("span", "twm-flow-lanes__sep");
    sep.setAttribute("aria-hidden", "true");
    const text = el("span", "twm-flow-lanes__text");
    text.append(el("span", "twm-flow-lanes__title"), el("span", "twm-flow-lanes__sub"), el("span", "twm-flow-lanes__line"));
    body.append(glyph, sep, text);
    b.appendChild(body);
    b.addEventListener("click", () => select(n.id));
    b.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      select(n.id);
      openMenu(n.id, b);
    });
    wrap.appendChild(b);
    if (canAddAfter(n.id)) {
      const add = el("button", "twm-flow-lanes__add");
      add.type = "button";
      add.setAttribute("aria-haspopup", "dialog");
      add.tabIndex = n.id === roving ? 0 : -1;
      add.appendChild(icon("add"));
      add.addEventListener("click", () => pickAfter(n.id, add));
      wrap.appendChild(add);
    }
    return wrap;
  }
  function stripCard(n, c) {
    const role = roleOf2(n);
    const tone = toneOf(catalogue.tone(n.type));
    const wrap = el("div", `twm-flow-lanes__node twm-flow-lanes__node--${role} twm-flow-lanes__node--${tone}`);
    wrap.dataset.step = n.id;
    wrap.style.left = `${c.x}px`;
    wrap.style.top = `${c.y - placed.bands[c.lane].top}px`;
    wrap.setAttribute("role", "img");
    const body = el("span", "twm-flow-lanes__body");
    const text = el("span", "twm-flow-lanes__text");
    text.append(el("span", "twm-flow-lanes__title"), el("span", "twm-flow-lanes__line"));
    body.appendChild(text);
    wrap.appendChild(body);
    return wrap;
  }
  function paintCards() {
    const roving = rovingStep();
    for (const wrap of surface.querySelectorAll(".twm-flow-lanes__node")) {
      const id = wrap.dataset.step;
      const n = node(id);
      if (!n) continue;
      const title = n.label || typeLabel(n);
      const status = compact ? { text: "", tone: "muted" } : statusOf(id);
      wrap.querySelector(".twm-flow-lanes__title").textContent = title;
      const sub = wrap.querySelector(".twm-flow-lanes__sub");
      if (sub) {
        const s = subOf(n);
        sub.textContent = s;
        sub.hidden = !s;
      }
      const line = wrap.querySelector(".twm-flow-lanes__line");
      line.textContent = size === "small" && !compact ? [typeLabel(n), status.text].filter(Boolean).join(" \xB7 ") : status.text;
      line.className = `twm-flow-lanes__line twm-flow-lanes__line--${status.tone}`;
      if (compact) line.hidden = !line.textContent;
      const fs = byNode.get(id) || [];
      wrap.classList.toggle("twm-flow-lanes__node--error", fs.some((f) => f.severity !== "warning"));
      wrap.classList.toggle("twm-flow-lanes__node--warning", fs.length > 0 && fs.every((f) => f.severity === "warning"));
      const on = id === selected;
      wrap.classList.toggle("twm-flow-lanes__node--selected", on);
      const label = say(S, "cardLabel", typeLabel(n), title, status.text);
      if (compact) {
        wrap.setAttribute("aria-label", label);
        continue;
      }
      const b = wrap.querySelector(".twm-flow-lanes__card");
      b.setAttribute("aria-label", label);
      b.setAttribute("aria-current", on ? "true" : "false");
      b.tabIndex = id === roving ? 0 : -1;
      const add = wrap.querySelector(".twm-flow-lanes__add");
      if (add) {
        add.tabIndex = id === roving ? 0 : -1;
        add.setAttribute("aria-label", say(S, "addAfter", title));
        add.title = say(S, "addAfter", title);
      }
    }
  }
  function paintTabs() {
    if (!tabs) return;
    const focused = tabs.contains(root.ownerDocument.activeElement);
    tabs.replaceChildren();
    const make = (id, label, tone) => {
      const t = el("button", `twm-flow-lanes__tab twm-flow-lanes__tab--${tone}`);
      t.type = "button";
      t.id = `${dockId}-tab-${id}`;
      t.setAttribute("role", "tab");
      t.setAttribute("data-twm-flow-item", "");
      t.setAttribute("aria-controls", dockId);
      t.dataset.tab = id;
      const dot = el("span", "twm-flow-lanes__tab-dot");
      dot.setAttribute("aria-hidden", "true");
      t.append(dot, el("span", "twm-flow-lanes__tab-label", label));
      t.addEventListener("click", () => select(id));
      tabs.appendChild(t);
    };
    if (flowSchema) make("flow", say(S, "flowTab"), "grey");
    for (const id of stepOrder()) {
      const n = node(id);
      if (n) make(id, n.label || typeLabel(n), toneOf(catalogue.tone(n.type)));
    }
    paintTabState();
    if (focused) tabs.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
  }
  function paintTabState() {
    if (!tabs) return;
    const list = [...tabs.querySelectorAll('[role="tab"]')];
    const current = list.find((t) => t.dataset.tab === selected) ?? null;
    for (const t of list) {
      const on = t === current;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on || !current && t === list[0] ? 0 : -1;
      const n = node(t.dataset.tab);
      if (n) t.querySelector(".twm-flow-lanes__tab-label").textContent = n.label || typeLabel(n);
    }
    if (dock) {
      if (current) dock.setAttribute("aria-labelledby", current.id);
      else dock.removeAttribute("aria-labelledby");
    }
  }
  function paintBanner() {
    const lines = isReadOnly() && !compact ? readOnlyReason() : [];
    banner.replaceChildren(...lines.map((l) => el("p", "twm-flow-lanes__readonly-line", l)));
    banner.hidden = lines.length === 0;
    root.classList.toggle("twm-flow-lanes--readonly", isReadOnly() && !compact);
    if (addSourceBtn) addSourceBtn.hidden = isReadOnly();
    const runText = mode === "run" && runOverlay?.banner ? String(runOverlay.banner) : "";
    runBanner.textContent = runText;
    runBanner.hidden = !runText;
  }
  function paintToolbar() {
    if (!toolbar) return;
    const ro = isReadOnly();
    undoBtn.disabled = ro || !history.canUndo;
    redoBtn.disabled = ro || !history.canRedo;
    showPreviewBtn.setAttribute("aria-pressed", mode === "preview" ? "true" : "false");
    showRunBtn.setAttribute("aria-pressed", mode === "run" ? "true" : "false");
  }
  function paintParams() {
    if (!params) return;
    const focused = root.ownerDocument.activeElement;
    const heldName = focused && params.contains(focused) ? focused.dataset.parameter ?? (focused.dataset.add ? "+" : null) : null;
    params.replaceChildren();
    params.appendChild(el("span", "twm-flow-lanes__params-title", say(S, "parameters")));
    const names = Object.keys(pipeline.parameters || {});
    for (const name of names) {
      const def = isObject4(pipeline.parameters[name]) ? pipeline.parameters[name] : {};
      const line = say(S, "parameterLine", def.type, def.default === void 0 ? void 0 : typeof def.default === "string" ? def.default : JSON.stringify(def.default));
      const chip = el("button", "twm-flow-lanes__param");
      chip.type = "button";
      chip.dataset.parameter = name;
      chip.setAttribute("aria-haspopup", "dialog");
      chip.setAttribute("aria-label", say(S, "parameterAria", name, line));
      chip.append(el("span", "twm-flow-lanes__param-name", name), el("span", "twm-flow-lanes__param-line", line));
      chip.addEventListener("click", () => editParameter(name, chip));
      params.appendChild(chip);
    }
    if (!isReadOnly()) {
      const add = el("button", "twm-flow-lanes__param-add");
      add.type = "button";
      add.dataset.add = "1";
      add.setAttribute("aria-haspopup", "dialog");
      add.append(icon("add"), el("span", "", say(S, "addParameter")));
      add.addEventListener("click", () => editParameter(null, add));
      params.appendChild(add);
    }
    if (names.length) {
      const syntax = references.parameter;
      const ref = syntax?.format ? syntax.format(names[0]) : `{{${names[0]}}}`;
      params.appendChild(el(
        "span",
        "twm-flow-lanes__params-help",
        `${say(S, "parameterHelp", ref)} ${say(S, "parameterSupplied")}`
      ));
    }
    if (heldName) {
      const again = heldName === "+" ? params.querySelector("[data-add]") : [...params.querySelectorAll("[data-parameter]")].find((c) => c.dataset.parameter === heldName);
      (again || params.querySelector("button"))?.focus({ preventScroll: true });
    }
  }
  function stepPanelSpec(n) {
    const type = typeOf(n);
    const ports = portsOf(pipeline, catalogue, n.id);
    const extra = [];
    const inputs = ports?.inputs ?? [];
    if (ports && ports.laneInput !== null && (inputs.length > 1 || !laneFeedOf(pipeline, catalogue, n.id))) {
      extra.push(inputField(n, ports.laneInput, true, inputs));
    }
    for (const port of inputs.slice(1)) extra.push(inputField(n, port, false, inputs));
    const ro = isReadOnly();
    return {
      step: n,
      type,
      value: n.config,
      title: n.label ?? "",
      placeholderTitle: typeLabel(n),
      rename: true,
      typeLabel: typeLabel(n),
      description: type?.description ?? "",
      idLine: typeof options.summariseReads === "function" ? options.summariseReads(n, type) : null,
      icon: type?.icon ?? "",
      tone: toneOf(catalogue.tone(n.type)),
      extra,
      actions: [{
        id: "remove",
        label: say(S, "removeStep"),
        icon: "delete",
        danger: true,
        disabled: ro,
        reason: ro ? readOnlyReason()[0] ?? "" : "",
        run: () => remove(n.id)
      }],
      slots: { after: typeof slots.stepPanel === "function" ? (box) => slots.stepPanel(box, n) : null }
    };
  }
  function inputField(n, port, lane, inputs) {
    const here = layout.at[n.id]?.lane ?? 0;
    const candidates = inputCandidates(pipeline, catalogue, layout, n.id);
    const labels = {};
    for (const c of candidates) labels[c.id] = say(S, "candidate", titleOf2(c.id), say(S, "laneRelation", c.lane - here, c.lane + 1));
    const current = inputOf(pipeline, n.id, port)?.sourceId;
    const portDef = catalogue.port(n.type, port, "input");
    const title = lane ? say(S, "thisLane") : inputs.length > 2 ? say(S, "joinedWithPort", portDef?.label ?? port) : say(S, "joinedWith");
    return {
      key: `__input:${port}`,
      spec: { type: "string", title, description: lane ? current ? say(S, "thisLaneHelp") : say(S, "connectIt") : say(S, "joinedWithHelp"), enum: candidates.map((c) => c.id), "x-ui-enum-labels": labels },
      required: lane || Boolean(portDef?.required),
      value: current,
      at: "start",
      set: (v) => setJoin(n.id, port, v ?? null)
    };
  }
  function paintPanel() {
    if (!panel) return;
    if (panelReadOnly !== isReadOnly()) {
      panelReadOnly = isReadOnly();
      panel.setReadOnly(panelReadOnly ? { reason: "" } : false);
    }
    const n = selected && selected !== "flow" ? node(selected) : null;
    settingsHint.hidden = true;
    if (n) {
      panel.show(stepPanelSpec(n));
      shownColumns = JSON.stringify(inputColumns(n.id));
    } else if (selected === "flow" && flowSchema) {
      panel.show({
        title: say(S, "flowTitle"),
        typeLabel: say(S, "flowType"),
        description: options.flowSettings?.description ?? "",
        icon: "tune",
        tone: "grey",
        fields: fieldsFromSchema(flowSchema),
        value: flowValue ?? {},
        slots: { after: typeof slots.flowPanel === "function" ? (box) => slots.flowPanel(box) : null }
      });
      shownColumns = "";
    } else {
      panel.clear();
      settingsHint.hidden = false;
      shownColumns = "";
    }
    panel.setFindings(findings);
  }
  function reshowForColumns() {
    if (!panel || !selected || selected === "flow" || !node(selected)) return;
    const now = JSON.stringify(inputColumns(selected));
    if (now === shownColumns) return;
    if (panel.el.contains(root.ownerDocument.activeElement)) return;
    paintPanel();
  }
  function availableDataTabs() {
    const n = selected && selected !== "flow" ? node(selected) : null;
    if (!n) return [];
    const out = [];
    if (typeof options.preview === "function") out.push("preview");
    if (typeof options.preview === "function" || typeof options.describe === "function") out.push("columns");
    if (typeof options.preview === "function" && roleOf2(n) === "sink") out.push("rejects");
    return out;
  }
  function columnsOf(id) {
    const d = describeNodes[id];
    if (Array.isArray(d?.columns)) return { from: "describe", list: d.columns };
    const p = previewNodes[id];
    if (Array.isArray(p?.columns)) return { from: "preview", list: p.columns };
    return { from: null, list: [] };
  }
  function paintDataState() {
    if (!dataState) return;
    const s = previewState;
    dataState.replaceChildren();
    if (!s.enabled) {
      dataState.hidden = true;
      return;
    }
    dataState.hidden = false;
    const tone = previewError ? "error" : s.waiting || s.busy ? "busy" : "ok";
    dataState.className = `twm-flow-lanes__datastate twm-flow-lanes__datastate--${tone}`;
    const dot = el("span", "twm-flow-lanes__datastate-dot");
    dot.setAttribute("aria-hidden", "true");
    dataState.append(dot, el(
      "span",
      "twm-flow-lanes__datastate-text",
      tone === "busy" ? say(S, "previewing") : say(S, "previewOn", delayMs)
    ));
  }
  function paintDock() {
    if (!dock) return;
    const active = root.ownerDocument.activeElement;
    const heldTab = active && dataTabs.contains(active) ? active.dataset.data ?? null : null;
    table?.dispose?.();
    table = null;
    dataTabs.replaceChildren();
    dataBody.replaceChildren();
    const id = selected && selected !== "flow" ? selected : null;
    const avail = availableDataTabs();
    dataCol.hidden = avail.length === 0;
    if (!avail.length || !id) return;
    if (!avail.includes(dockTab)) dockTab = avail[0];
    const p = previewNodes[id];
    const cols = columnsOf(id);
    const rejects = Array.isArray(p?.rejects) ? p.rejects : [];
    const words3 = {
      preview: say(S, "previewTab"),
      columns: say(S, "columnsTab", cols.list.length),
      rejects: say(S, "rejectsTab", rejects.length)
    };
    for (const t of avail) {
      const b = el("button", "twm-flow-lanes__datatab", words3[t]);
      b.type = "button";
      b.dataset.data = t;
      b.setAttribute("aria-pressed", t === dockTab ? "true" : "false");
      b.addEventListener("click", () => {
        dockTab = t;
        paintDock();
      });
      dataTabs.appendChild(b);
    }
    dataTabs.appendChild(el("span", "twm-flow-lanes__spacer"));
    dataTabs.appendChild(dataState);
    paintDataState();
    if (heldTab) dataTabs.querySelector(`[data-data="${heldTab}"]`)?.focus({ preventScroll: true });
    if (previewError && dockTab !== "columns") dataBody.appendChild(el("p", "twm-flow-lanes__error", previewError));
    if (dockTab === "preview") {
      if (!p) {
        dataBody.appendChild(el("p", "twm-flow-lanes__nodata", say(S, "noPreview")));
        return;
      }
      if (p.status === "error") {
        dataBody.appendChild(el("p", "twm-flow-lanes__error", String(p.error?.message || say(S, "stepFailed"))));
        return;
      }
      const head = Array.isArray(p.head) ? p.head : [];
      const columns = Array.isArray(p.columns) ? p.columns : [];
      dataBody.appendChild(el(
        "p",
        "twm-flow-lanes__caption",
        p.caption ?? say(S, "previewCaption", head.length, p.rows ?? head.length)
      ));
      const box = el("div", "twm-flow-lanes__table");
      dataBody.appendChild(box);
      const marks = columns.map((c) => describeNodes[id]?.columns?.find((d) => d.name === c.name)?.change ?? null);
      table = new DataTable(box, {
        headers: columns.map((c) => String(c.name)),
        rows: head.map((r) => Array.isArray(r) ? r : columns.map((c) => r?.[c.name])),
        pagination: false,
        selectable: false,
        readonly: true,
        copyable: true,
        sortable: false,
        mode: "compact",
        firstColumn: "plain",
        columnFit: "content",
        nullDisplay: "",
        emptyState: say(S, "noRows"),
        cellClass: (_v, colIdx) => marks[colIdx] ? `twm-flow-lanes__cell--${marks[colIdx] === "new" ? "new" : "changed"}` : null
      });
      table.render();
    } else if (dockTab === "columns") {
      if (!cols.list.length) {
        dataBody.appendChild(el("p", "twm-flow-lanes__nodata", say(S, "columnsUnknown")));
        return;
      }
      dataBody.appendChild(el("p", "twm-flow-lanes__caption", say(S, cols.from === "describe" ? "columnsFromDescription" : "columnsFromPreview", cols.list.length)));
      const list = el("ul", "twm-flow-lanes__columns");
      for (const c of cols.list) {
        const change = c.change === "new" || c.change === "changed" ? c.change : null;
        const li = el("li", `twm-flow-lanes__column${change ? ` twm-flow-lanes__column--${change}` : ""}`);
        const type = [c.type, change ? say(S, change === "new" ? "columnNew" : "columnChanged") : null].filter(Boolean).join(" \xB7 ");
        li.append(
          el("span", "twm-flow-lanes__column-name", String(c.name)),
          el("span", "twm-flow-lanes__column-type", type),
          el("span", "twm-flow-lanes__column-origin", c.origin ?? "")
        );
        list.appendChild(li);
      }
      dataBody.appendChild(list);
    } else {
      dataBody.appendChild(el("p", "twm-flow-lanes__caption", rejects.length ? p?.rejectsCaption ?? say(S, "rejectsCaption", rejects.length) : say(S, "noRejects")));
      const list = el("ul", "twm-flow-lanes__rejects");
      for (const r of rejects) {
        const li = el("li", "twm-flow-lanes__reject");
        const row = Array.isArray(r.row) ? r.row : [];
        if (row.length) li.appendChild(el("span", "twm-flow-lanes__reject-key", String(row[0])));
        if (row.length > 1) li.appendChild(el("span", "twm-flow-lanes__reject-value", String(row[1])));
        li.appendChild(el("span", "twm-flow-lanes__reject-reason", say(S, "rejectReason", r.column, r.reason)));
        list.appendChild(li);
      }
      dataBody.appendChild(list);
    }
  }
  function paintAll() {
    paintBanner();
    paintToolbar();
    paintParams();
    paintLanes();
    paintTabs();
    paintPanel();
    paintDock();
  }
  function select(id, { notify = true } = {}) {
    const next = id === "flow" ? flowSchema ? "flow" : null : id && node(id) ? id : null;
    if (next === selected) return;
    selected = next;
    paintCards();
    paintTabState();
    paintPanel();
    paintDock();
    if (notify) options.onSelect?.({ kind: selected === null ? null : selected === "flow" ? "flow" : "step", id: selected });
  }
  function cardEl(id) {
    if (!id) return null;
    return [...surface.querySelectorAll(".twm-flow-lanes__node")].find((w) => w.dataset.step === id)?.querySelector(".twm-flow-lanes__card") ?? null;
  }
  function focusCard(id) {
    const b = cardEl(id && id !== "flow" ? id : rovingStep());
    if (b) {
      b.focus({ preventScroll: true });
      b.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      return true;
    }
    (addSourceBtn && !addSourceBtn.hidden ? addSourceBtn : root).focus?.({ preventScroll: true });
    return false;
  }
  function goTo(f) {
    if (f?.node_id && node(f.node_id)) {
      select(f.node_id);
      if (!(f.field && panel?.focusField(f.field))) focusCard(f.node_id);
      return;
    }
    if (flowSchema) {
      select("flow");
      if (f?.field) panel?.focusField(f.field);
    }
  }
  function neighbour(id, dir) {
    const at = layout.at[id];
    if (!at) return null;
    const lane = layout.lanes[at.lane];
    if (dir === "left") return lane.steps[at.position - 1]?.id ?? null;
    if (dir === "right") return lane.steps[at.position + 1]?.id ?? null;
    const other = layout.lanes[at.lane + (dir === "down" ? 1 : -1)];
    if (!other || !other.steps.length) return null;
    let best = other.steps[0];
    for (const s of other.steps) {
      const d = Math.abs(s.column - at.column);
      const bd = Math.abs(best.column - at.column);
      if (d < bd || d === bd && s.column < best.column) best = s;
    }
    return best.id;
  }
  function afterShapeChange(focusId = null) {
    relayout();
    paintAll();
    if (focusId) focusCard(focusId);
  }
  async function pickAfter(id, anchor) {
    if (isReadOnly() || !node(id)) return;
    const entries = catalogue.list().filter((t) => t.role !== "source").map((t) => ({
      id: t.type_id,
      label: t.label,
      sub: "",
      description: t.description,
      icon: t.icon,
      tone: catalogue.tone(t.type_id),
      category: t.category ?? "",
      refusal: t.unavailable || void 0
    }));
    const picked = await openStepPicker({
      anchor,
      entries,
      categories: pickerCategories(),
      where: say(S, "afterStep", titleOf2(id)),
      strings: S
    });
    if (destroyed || !picked?.entry || isReadOnly()) return;
    const created = addStepAfter(pipeline, catalogue, id, picked.entry.id);
    if (!created) return;
    selected = created.id;
    commit("flow:step:add");
    afterShapeChange(created.id);
    options.onSelect?.({ kind: "step", id: created.id });
  }
  async function pickSource() {
    if (isReadOnly() || !addSourceBtn) return;
    const entries = catalogue.list().filter((t) => t.role === "source").map((t) => ({
      id: t.type_id,
      label: t.label,
      description: t.description,
      icon: t.icon,
      tone: catalogue.tone(t.type_id),
      category: t.category ?? "",
      refusal: t.unavailable || void 0
    }));
    const picked = await openStepPicker({
      anchor: addSourceBtn,
      entries,
      categories: pickerCategories(),
      title: say(S, "addSourceTitle"),
      where: say(S, "startsLane"),
      strings: S
    });
    if (destroyed || !picked?.entry || isReadOnly()) return;
    const created = addSource(pipeline, catalogue, picked.entry.id);
    selected = created.id;
    commit("flow:source:add");
    afterShapeChange(created.id);
    options.onSelect?.({ kind: "step", id: created.id });
  }
  function pickerCategories() {
    return catalogue.categories.map((c) => ({ id: c.id, label: c.label, layout: c.layout }));
  }
  function remove(id) {
    if (isReadOnly() || !node(id)) return false;
    const at = layout.at[id];
    const lane = at ? layout.lanes[at.lane] : null;
    const fallback = lane ? lane.steps[at.position - 1]?.id ?? lane.steps[at.position + 1]?.id ?? null : null;
    const hadFocus = root.contains(root.ownerDocument.activeElement);
    removeStep(pipeline, catalogue, id);
    if (selected === id) selected = fallback && node(fallback) ? fallback : null;
    commit("flow:step:remove");
    relayout();
    if (!selected) selected = firstStep();
    paintAll();
    if (hadFocus) focusCard(selected);
    options.onSelect?.({ kind: selected ? "step" : null, id: selected });
    return true;
  }
  function changeSetting(stepId, key, value) {
    if (isReadOnly()) return;
    if (stepId === null) {
      flowValue = { ...flowValue ?? {} };
      if (value === void 0) delete flowValue[key];
      else flowValue[key] = clone3(value);
      commit("flow:settings", `settings:${key}`);
      return;
    }
    const n = node(stepId);
    if (!n) return;
    if (value === void 0) delete n.config[key];
    else n.config[key] = clone3(value);
    commit("flow:step:config", `config:${stepId}:${key}`);
    paintCards();
  }
  function rename(stepId, label) {
    if (isReadOnly()) return;
    const n = node(stepId);
    if (!n) return;
    if (String(label ?? "").trim()) n.label = String(label);
    else delete n.label;
    commit("flow:step:label", `label:${stepId}`, { preview: false });
    paintCards();
    paintTabState();
  }
  function setJoin(stepId, port, sourceId) {
    if (isReadOnly()) return;
    if (!setInput(pipeline, catalogue, stepId, port, sourceId)) return;
    commit("flow:join:set", null);
    afterShapeChange();
  }
  function editParameter(name, anchor) {
    if (!params) return;
    const editing = name !== null;
    const def = editing && isObject4(pipeline.parameters[name]) ? pipeline.parameters[name] : {};
    const ro = isReadOnly();
    const form = el("form", "twm-flow-lanes__form");
    form.noValidate = true;
    form.appendChild(el("div", "twm-flow-lanes__form-title", editing ? say(S, "parameterTitle") : say(S, "addParameter")));
    const row = (label, control) => {
      const r = el("label", "twm-flow-lanes__form-row");
      r.append(el("span", "twm-flow-lanes__form-label", label), control);
      form.appendChild(r);
      return control;
    };
    const nameBox = row(say(S, "parameterName"), el("input", "twm-flow-input"));
    nameBox.type = "text";
    nameBox.value = name ?? "";
    nameBox.spellcheck = false;
    nameBox.dataset.field = "name";
    const typeBox = row(say(S, "parameterType"), el("select", "twm-flow-input twm-flow-input--select"));
    typeBox.dataset.field = "type";
    for (const t of parameterTypes) typeBox.appendChild(new Option(t.label, t.id));
    if (def.type !== void 0 && !parameterTypes.some((t) => t.id === def.type)) typeBox.appendChild(new Option(String(def.type), String(def.type)));
    typeBox.value = def.type !== void 0 ? String(def.type) : parameterTypes[0].id;
    const defaultHolder = el("span", "twm-flow-lanes__form-control");
    row(say(S, "parameterDefault"), defaultHolder);
    let defaultBox = null;
    const drawDefault = () => {
      const was = defaultBox ? defaultBox.value : def.default === void 0 ? "" : typeof def.default === "string" ? def.default : JSON.stringify(def.default);
      defaultHolder.replaceChildren();
      if (typeBox.value === "boolean") {
        defaultBox = el("select", "twm-flow-input twm-flow-input--select");
        defaultBox.append(new Option(say(S, "parameterNoDefault"), ""), new Option("true", "true"), new Option("false", "false"));
        defaultBox.value = ["true", "false"].includes(was) ? was : "";
      } else {
        defaultBox = el("input", "twm-flow-input");
        defaultBox.type = "text";
        defaultBox.value = was;
      }
      defaultBox.dataset.field = "default";
      defaultBox.disabled = ro;
      defaultHolder.appendChild(defaultBox);
    };
    drawDefault();
    typeBox.addEventListener("change", drawDefault);
    const descBox = row(say(S, "parameterDescription"), el("input", "twm-flow-input"));
    descBox.type = "text";
    descBox.value = def.description ?? "";
    descBox.dataset.field = "description";
    for (const b of [nameBox, typeBox, descBox]) b.disabled = ro;
    const refusal = el("p", "twm-flow-lanes__form-refusal");
    refusal.setAttribute("role", "alert");
    refusal.hidden = true;
    form.appendChild(refusal);
    const acts = el("div", "twm-flow-lanes__form-actions");
    let handle = null;
    const save = button({ label: say(S, "parameterSave"), primary: true, type: "submit" });
    const cancel = button({ label: say(S, "parameterCancel"), onClick: () => handle?.close("cancel") });
    save.disabled = ro;
    acts.appendChild(save);
    if (editing) {
      const del = button({ label: say(S, "parameterRemove"), danger: true, onClick: () => {
        if (isReadOnly()) return;
        removeParameter(pipeline, name);
        handle?.close("removed");
        commit("flow:parameter:remove");
        paintParams();
        params.querySelector("[data-add]")?.focus({ preventScroll: true });
      } });
      del.disabled = ro;
      acts.appendChild(del);
    }
    acts.appendChild(cancel);
    form.appendChild(acts);
    const refuse = (text, box) => {
      refusal.textContent = text;
      refusal.hidden = false;
      box?.focus();
    };
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (isReadOnly()) return;
      const next = nameBox.value.trim();
      if (!PARAMETER_NAME.test(next)) return refuse(say(S, "parameterNameRule"), nameBox);
      if (next !== name && Object.prototype.hasOwnProperty.call(pipeline.parameters, next)) {
        return refuse(say(S, "parameterNameTaken", next), nameBox);
      }
      const type = typeBox.value;
      const raw = defaultBox.value;
      let value;
      if (raw !== "") {
        if (type === "number" || type === "integer") {
          const v = Number(raw);
          if (!Number.isFinite(v)) return refuse(say(S, "parameterNotNumber"), defaultBox);
          if (type === "integer" && !Number.isInteger(v)) return refuse(say(S, "parameterNotInteger"), defaultBox);
          value = v;
        } else if (type === "boolean") {
          value = raw === "true";
        } else {
          value = raw;
        }
      }
      setParameter(pipeline, next, { type, default: value, description: descBox.value.trim() }, { rename: name });
      handle?.close("saved");
      commit(editing ? "flow:parameter:change" : "flow:parameter:add");
      paintParams();
      [...params.querySelectorAll("[data-parameter]")].find((c) => c.dataset.parameter === next)?.focus({ preventScroll: true });
      return void 0;
    });
    handle = openPopover({
      anchor,
      content: form,
      label: editing ? say(S, "parameterTitle") : say(S, "addParameter"),
      className: "twm-flow-lanes__popover",
      focus: ro ? cancel : nameBox
    });
  }
  function openMenu(id, anchor) {
    if (compact || !node(id)) return;
    const menu = el("div", "twm-flow-lanes__menu");
    menu.setAttribute("role", "menu");
    let handle = null;
    const item = (label, glyph, run, { danger = false, disabled = false } = {}) => {
      const b = el("button", `twm-flow-lanes__menu-item${danger ? " twm-flow-lanes__menu-item--danger" : ""}`);
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.disabled = disabled;
      b.append(icon(glyph), el("span", "", label));
      b.addEventListener("click", () => {
        handle?.close("chosen");
        run();
      });
      menu.appendChild(b);
      return b;
    };
    const first = item(say(S, "openSettings"), "tune", () => openSettingsOf(id));
    if (canAddAfter(id)) {
      item(say(S, "addStepAfter"), "add", () => {
        const add = [...surface.querySelectorAll(".twm-flow-lanes__node")].find((w) => w.dataset.step === id)?.querySelector(".twm-flow-lanes__add");
        if (add) pickAfter(id, add);
      });
    }
    if (!isReadOnly()) item(say(S, "removeStep"), "delete", () => remove(id), { danger: true });
    menu.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
      ev.preventDefault();
      const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
      const at = items.indexOf(root.ownerDocument.activeElement);
      const next = items[(at + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      next?.focus();
    });
    handle = openPopover({
      anchor,
      content: menu,
      label: say(S, "stepMenu", titleOf2(id)),
      className: "twm-flow-lanes__popover",
      focus: first
    });
  }
  function openSettingsOf(id) {
    if (id && node(id)) select(id);
    if (!panel) return;
    const controls = 'input, select, textarea, [contenteditable="true"], button';
    const target = [...panel.el.querySelectorAll(".twm-flow-panel__fields *")].find((c) => c.matches(controls) && !c.disabled) ?? panel.el.querySelector("[data-twm-flow-title]") ?? panel.el.querySelector(controls);
    target?.focus({ preventScroll: true });
  }
  const inSurface = (ev) => surface.contains(ev.target);
  const inTabs = (ev) => Boolean(tabs && tabs.contains(ev.target));
  const stepAt = (ev) => (inSurface(ev) ? ev.target.closest?.("[data-step]")?.dataset.step : inTabs(ev) ? ev.target.closest?.('[role="tab"]')?.dataset.tab : null) ?? null;
  const unbindKeys = compact ? () => {
  } : bindFlowKeys(root, {
    undo: () => {
      if (isReadOnly()) return false;
      undo();
      return true;
    },
    redo: () => {
      if (isReadOnly()) return false;
      redo();
      return true;
    },
    remove: (ev) => {
      if (!(inSurface(ev) || inTabs(ev)) || isReadOnly()) return false;
      const id = stepAt(ev) ?? selected;
      if (!id || id === "flow" || !node(id)) return false;
      remove(id);
      return true;
    },
    rename: () => {
      if (!selected || selected === "flow" || !panel) return false;
      const t = panel.el.querySelector("[data-twm-flow-title]");
      if (!t) return false;
      t.focus();
      t.select?.();
      return true;
    },
    left: (ev) => arrow(ev, "left"),
    right: (ev) => arrow(ev, "right"),
    up: (ev) => arrow(ev, "up"),
    down: (ev) => arrow(ev, "down"),
    open: (ev) => {
      if (!(inSurface(ev) || inTabs(ev))) return false;
      const id = stepAt(ev);
      if (id) select(id);
      openSettingsOf(selected && selected !== "flow" ? selected : null);
      return true;
    },
    escape: (ev) => {
      if (!dock?.contains(ev.target) || settingsCol.contains(ev.target)) return false;
      return focusCard(selected);
    }
  });
  const onPanelKey = (ev) => {
    if (ev.key !== "Escape" || ev.defaultPrevented || ev.isComposing) return;
    if (focusCard(selected)) ev.preventDefault();
  };
  settingsCol?.addEventListener("keydown", onPanelKey);
  function arrow(ev, dir) {
    if (inTabs(ev)) {
      if (dir !== "left" && dir !== "right") return false;
      const list = [...tabs.querySelectorAll('[role="tab"]')];
      const at = list.indexOf(ev.target.closest('[role="tab"]'));
      const next = list[at + (dir === "right" ? 1 : -1)];
      if (!next) return true;
      select(next.dataset.tab);
      next.focus({ preventScroll: true });
      return true;
    }
    if (!inSurface(ev) || !ev.target.closest(".twm-flow-lanes__card")) return false;
    const from = ev.target.closest("[data-step]")?.dataset.step;
    const to = from ? neighbour(from, dir) : null;
    if (!to) return true;
    select(to);
    focusCard(to);
    return true;
  }
  function setStepsShow(next) {
    const m = next === "run" ? "run" : "preview";
    if (m === mode) return;
    mode = m;
    paintToolbar();
    paintBanner();
    paintCards();
    options.onStepsShow?.(mode);
    if (mode === "run" && !runOverlay && typeof options.lastRun === "function") {
      lastRunAsk?.abort();
      const controller = new AbortController();
      lastRunAsk = controller;
      Promise.resolve(options.lastRun({ pipeline: getGraph(), signal: controller.signal })).then((overlay) => {
        if (destroyed || controller.signal.aborted || lastRunAsk !== controller) return;
        lastRunAsk = null;
        if (overlay) api.setRunOverlay(overlay);
      }, () => {
        if (lastRunAsk === controller) lastRunAsk = null;
      });
    }
  }
  function getGraph() {
    return normalisePipeline(pipeline);
  }
  function inputColumns(stepId, port = null) {
    const ports = portsOf(pipeline, catalogue, stepId);
    const at = port ?? ports?.laneInput;
    if (!at) return null;
    const c = inputOf(pipeline, stepId, at);
    if (!c) return null;
    const cols = columnsOf(c.sourceId);
    return cols.from ? cols.list.map((x) => ({ ...x })) : null;
  }
  function cssEscape(v) {
    return String(v).replace(/["\\]/g, "\\$&");
  }
  const api = {
    el: root,
    /** Replace the content. A baseline (the default) clears both undo stacks. */
    load({ graph = null, pipeline: given = null, flowSettings } = {}, { baseline = true } = {}) {
      pipeline = normalisePipeline(given ?? graph ?? emptyPipeline());
      if (flowSettings !== void 0) {
        flowSchema = isObject4(flowSettings?.schema) ? flowSettings.schema : null;
        flowValue = isObject4(flowSettings?.value) ? clone3(flowSettings.value) : flowSchema ? {} : null;
      }
      previewNodes = {};
      describeNodes = {};
      previewError = null;
      relayout();
      if (!(selected && (selected === "flow" ? flowSchema : node(selected)))) {
        selected = options.select !== void 0 && (options.select === "flow" ? flowSchema : node(options.select)) ? options.select : compact ? null : firstStep();
      }
      paintAll();
      if (baseline) history.baseline(snapshot());
      runner.schedule({ immediate: true });
    },
    getGraph,
    /** The flow's byte-stable text. */
    serialise: () => serialisePipeline(pipeline),
    getFlowSettings: () => flowValue === null ? null : clone3(flowValue),
    /** The current layout (`layoutLanes`) and its coordinates (`placeLanes`). */
    get layout() {
      return layout;
    },
    get placed() {
      return placed;
    },
    setFindings(list) {
      findings = findingsList(list);
      byNode = groupFindings(findings, { graph: pipeline });
      strip?.set(findings);
      paintCards();
      panel?.setFindings(findings);
    },
    setRunOverlay(overlay) {
      runOverlay = isObject4(overlay) ? overlay : null;
      paintBanner();
      paintCards();
    },
    setStepsShow,
    get stepsShow() {
      return mode;
    },
    setReadOnly(next) {
      readOnlyOpt = next || false;
      paintAll();
    },
    get readOnly() {
      return isReadOnly();
    },
    setActionState(id, { disabled = false, reason = "", busy = false } = {}) {
      const a = actionButtons.get(String(id));
      if (!a) return;
      a.b.disabled = Boolean(disabled || busy);
      a.b.setAttribute("aria-busy", busy ? "true" : "false");
      a.wrap.classList.toggle("twm-flow-lanes__action--busy", Boolean(busy));
      a.why.textContent = disabled && reason ? String(reason) : "";
      a.why.hidden = !(disabled && reason);
    },
    setStatus(text) {
      if (statusEl) statusEl.textContent = String(text ?? "");
    },
    select(id) {
      select(id);
    },
    get selected() {
      return selected;
    },
    focus() {
      focusCard(selected);
    },
    undo,
    redo,
    history,
    /** Ask the providers now, without waiting for the debounce. */
    refreshPreview() {
      runner.now();
    },
    inputColumns,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      runner.destroy();
      lastRunAsk?.abort();
      unbindKeys();
      settingsCol?.removeEventListener("keydown", onPanelKey);
      closeFlowPopovers();
      table?.dispose?.();
      table = null;
      panel?.destroy();
      strip?.destroy();
      root.remove();
    }
  };
  if (isObject4(options.graph) || isObject4(options.pipeline)) {
    api.load({ graph: options.graph ?? options.pipeline });
  } else {
    relayout();
    paintAll();
    history.baseline(snapshot());
  }
  return api;
}
export {
  CANVAS_ACTIONS,
  CANVAS_NODE,
  CANVAS_STRINGS,
  DEFAULT_LOOP_PORTS,
  DEFAULT_WIDGET_REFERENCES,
  FLOW_STRINGS,
  FORMULA_REFERENCES,
  FlowHistory,
  GENERIC_WIDGETS,
  ID_OK,
  LANE_ACTIONS,
  CH as LANE_CH,
  GAP2 as LANE_COLUMN_GAP,
  CW as LANE_CW,
  LANE_GAP,
  LANE_GEOMETRY,
  LAYOUT_STRINGS as LANE_LAYOUT_STRINGS,
  LANE_PAD,
  LANE_STRINGS,
  LOGIC_GRAPH_STRINGS,
  OUTLINE_ACTIONS,
  OUTLINE_INDENT,
  OUTLINE_STRINGS,
  PARAMETER_REFERENCES,
  SETTINGS_SCHEMA_ANNOTATIONS,
  SETTINGS_SCHEMA_KEYWORDS,
  SETTINGS_SCHEMA_TYPES,
  TEMPLATE_REFERENCES,
  TONES,
  UI_HINTS,
  addNode,
  admittedTypes,
  alwaysBefore,
  layoutGraph as arrangeCanvasGraph,
  bindFlowKeys,
  button,
  canConnect,
  nodeBottom as canvasNodeBottom,
  portAnchor as canvasPortAnchor,
  checkSettingsSchema,
  closeFlowPopovers,
  connect,
  createCanvasEditor,
  createChipInput,
  createFindingsStrip,
  createLaneEditor,
  createPreviewRunner as createLanePreviewRunner,
  createBlockMapping as createOutlineBlocks,
  createOutlineEditor,
  createOutlineOperations,
  createReferenceSyntax,
  createSettingsPanel,
  createStepCatalogue,
  createStrings,
  createWidgetRegistry,
  defaultIdBase,
  describeOutline,
  describeReference,
  disconnect,
  el,
  emptyGraph,
  emptyPipeline,
  enclosingArms,
  enclosingLoops,
  enumLabel,
  fieldVisible,
  fieldsFromSchema,
  findReferences,
  findingsList,
  fitToText,
  flowStructure,
  graphFromOutline,
  groupFindings,
  icon,
  indexTree as indexOutline,
  inputNamesOf,
  isReturnEdge as isCanvasReturnEdge,
  isOwnControl,
  isPathPrefix,
  isTextField,
  pipeline_exports as lanePipeline,
  stepPorts as laneStepPorts,
  layoutLanes,
  matchFindingField,
  moveNode,
  nextId,
  nextOption,
  normalise,
  normalisePipeline,
  openFlowPopover,
  openStepMenu as openOutlineStepMenu,
  openPopover,
  openStepPicker,
  openValuePicker,
  flatRunOrder as outlineFlatOrder,
  outlineFromGraph,
  sameGraphAsSets as outlineGraphsEqual,
  runOrder as outlineRunOrder,
  displayName as outlineStepName,
  ownsUndo,
  pathSegments,
  placeLanes,
  primaryType,
  pyRepr,
  removeNode,
  renderField,
  resolveSyntaxes,
  sameEdge,
  say,
  serialise,
  serialisePipeline,
  shownValue,
  titleOf,
  tokenize,
  toneClass,
  toneOf,
  typedValue,
  uid,
  visibleFields,
  whenKeys
};
//# sourceMappingURL=flow.js.map
