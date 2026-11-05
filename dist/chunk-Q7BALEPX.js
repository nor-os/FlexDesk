// src/ui/utils/modal_host.js
var host = null;
function setModalHost(el2) {
  host = el2 || null;
}
function modalHost() {
  return host;
}

// src/ui/components/anchored_layer.js
var EDGE_MARGIN = 8;
var GAP = 8;
var NO_BOX = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
function positionAnchored(anchor, panel, { align = "start", gap = GAP, margin = EDGE_MARGIN, matchWidth = false } = {}) {
  if (!panel) return;
  Object.assign(panel.style, {
    position: "fixed",
    top: "auto",
    bottom: "auto",
    left: "auto",
    right: "auto",
    maxHeight: "",
    overflowY: ""
  });
  const box = anchor?.getBoundingClientRect?.() || NO_BOX;
  if (matchWidth) panel.style.minWidth = `${Math.round(box.width)}px`;
  const size = panel.getBoundingClientRect();
  const doc = anchor?.ownerDocument || document;
  const view = doc.defaultView || window;
  const vw = doc.documentElement.clientWidth || view.innerWidth;
  const vh = doc.documentElement.clientHeight || view.innerHeight;
  const spaceBelow = vh - box.bottom - gap - margin;
  const spaceAbove = box.top - gap - margin;
  let top;
  let maxHeight;
  if (size.height <= spaceBelow) {
    top = box.bottom + gap;
    maxHeight = spaceBelow;
  } else if (size.height <= spaceAbove) {
    top = box.top - gap - size.height;
    maxHeight = spaceAbove;
  } else if (spaceBelow >= spaceAbove) {
    top = box.bottom + gap;
    maxHeight = spaceBelow;
  } else {
    maxHeight = spaceAbove;
    top = margin;
  }
  let left;
  if (align === "end") {
    left = box.right - size.width;
    if (left < margin) left = box.left;
  } else {
    left = box.left;
    if (left + size.width > vw - margin) left = box.right - size.width;
  }
  left = Math.max(margin, Math.min(left, vw - size.width - margin));
  Object.assign(panel.style, {
    position: "fixed",
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
    overflowY: "auto"
  });
}
var FOREIGN_FLOATS = ".twm-action-dropdown-menu, .twm-category-picker, .twm-context-menu";
var FOREIGN_ESCAPE = ".twm-action-dropdown-menu:not([hidden]), .twm-category-picker:not([hidden])";
var MODAL_WINDOW = ".twm-managed-window--modal";
var LAYERS = [];
var holds = (node, target) => !!node && typeof node.contains === "function" && node.contains(target);
var shownModals = (doc) => [...doc.querySelectorAll(MODAL_WINDOW)].filter((win) => win.style.display !== "none");
var isInAnchoredLayer = (node) => LAYERS.some((layer) => holds(layer.el, node));
function openAnchoredLayer({
  anchor = null,
  el: el2,
  align = "start",
  gap = GAP,
  matchWidth = false,
  inside = null,
  returnFocus = true,
  onClose = null
}) {
  if (anchor && anchor.isConnected === false) return null;
  while (LAYERS.length && !LAYERS[LAYERS.length - 1].owns(anchor)) LAYERS[LAYERS.length - 1].close("replaced");
  const doc = anchor?.ownerDocument || document;
  const view = doc.defaultView || window;
  (modalHost() || doc.body).appendChild(el2);
  const modalsUnder = new Set(shownModals(doc));
  let closed = false;
  const place = () => {
    if (closed) return;
    if (anchor && anchor.isConnected === false) {
      layer.close("detached");
      return;
    }
    positionAnchored(anchor, el2, { align, gap, matchWidth });
  };
  const owns = (target) => {
    if (holds(el2, target)) return true;
    for (let i = LAYERS.indexOf(layer) + 1; i < LAYERS.length; i += 1) if (holds(LAYERS[i].el, target)) return true;
    if (typeof target?.closest !== "function") return false;
    if (target.closest(FOREIGN_FLOATS)) return true;
    const modal = target.closest(MODAL_WINDOW);
    if (modal && !modalsUnder.has(modal)) return true;
    return !!inside && !!target.closest(inside);
  };
  const onPress = (ev) => {
    if (!holds(anchor, ev.target) && !owns(ev.target)) layer.close("outside");
  };
  const onDocKey = (ev) => {
    if (!holds(el2, ev.target)) onKey(ev);
  };
  const onKey = (ev) => {
    if (ev.key !== "Escape" || ev.isComposing || ev.defaultPrevented) return;
    if (LAYERS[LAYERS.length - 1] !== layer) return;
    if (doc.querySelector(FOREIGN_ESCAPE)) return;
    if (shownModals(doc).some((win) => !modalsUnder.has(win))) return;
    ev.preventDefault();
    ev.stopPropagation();
    layer.close("escape");
  };
  const onScroll = (ev) => {
    if (!holds(el2, ev.target)) place();
  };
  const sized = typeof ResizeObserver === "function" ? new ResizeObserver(() => place()) : null;
  const layer = {
    el: el2,
    anchor,
    place,
    owns,
    close(reason = "closed") {
      if (closed) return;
      while (LAYERS[LAYERS.length - 1] !== layer) LAYERS[LAYERS.length - 1].close("parent");
      closed = true;
      const active = doc.activeElement;
      const held = holds(el2, active) || active === doc.body;
      doc.removeEventListener("pointerdown", onPress, true);
      doc.removeEventListener("mousedown", onPress, true);
      doc.removeEventListener("keydown", onDocKey, true);
      el2.removeEventListener("keydown", onKey);
      view.removeEventListener("resize", place);
      view.removeEventListener("scroll", onScroll, true);
      sized?.disconnect();
      el2.remove();
      LAYERS.pop();
      if (returnFocus && held && reason !== "blur" && anchor?.isConnected) anchor.focus?.({ preventScroll: true });
      onClose?.(reason);
    }
  };
  LAYERS.push(layer);
  setTimeout(() => {
    if (closed) return;
    doc.addEventListener("pointerdown", onPress, true);
    doc.addEventListener("mousedown", onPress, true);
  }, 0);
  doc.addEventListener("keydown", onDocKey, true);
  el2.addEventListener("keydown", onKey);
  view.addEventListener("resize", place);
  view.addEventListener("scroll", onScroll, true);
  sized?.observe(el2);
  place();
  return layer;
}

// src/ui/components/choice_controls.js
var shownValue = (v) => v === void 0 ? "" : typeof v === "string" ? v : JSON.stringify(v);
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== void 0 && text !== null) n.textContent = String(text);
  return n;
}
var isGroup = (o) => o !== null && typeof o === "object" && Array.isArray(o.options) && "group" in o;
function choiceOption(o) {
  if (o === null || typeof o !== "object") {
    return {
      value: o,
      label: shownValue(o),
      description: null,
      disabled: false,
      reason: null,
      icon: null,
      hint: null,
      keywords: null,
      source: o
    };
  }
  return {
    value: o.value,
    label: o.label != null ? String(o.label) : shownValue(o.value),
    description: o.description != null ? String(o.description) : null,
    disabled: Boolean(o.disabled),
    reason: o.reason != null && o.reason !== "" ? String(o.reason) : null,
    icon: o.icon ? String(o.icon) : null,
    hint: o.hint != null && o.hint !== "" ? String(o.hint) : null,
    keywords: o.keywords != null ? String(o.keywords) : null,
    source: o
  };
}
function flatChoices(options) {
  const out = [];
  for (const o of options || []) {
    if (isGroup(o)) for (const inner of o.options) out.push(choiceOption(inner));
    else out.push(choiceOption(o));
  }
  return out;
}
function choiceSections(options) {
  const out = [];
  for (const o of options || []) {
    if (isGroup(o)) {
      if (o.options.length) out.push({ heading: String(o.group ?? ""), items: o.options.map(choiceOption) });
    } else if (out.length && out[out.length - 1].heading === null) {
      out[out.length - 1].items.push(choiceOption(o));
    } else {
      out.push({ heading: null, items: [choiceOption(o)] });
    }
  }
  return out;
}
function optionMatches(option, text) {
  const needle = String(text ?? "").trim().toLowerCase();
  if (!needle) return true;
  return [option.label, shownValue(option.value), option.description, option.keywords].some((part) => String(part ?? "").toLowerCase().includes(needle));
}
function filterSections(sections, text) {
  return sections.map((s) => ({ heading: s.heading, items: s.items.filter((o) => optionMatches(o, text)) })).filter((s) => s.items.length);
}
function groupHeads(options) {
  const heads = /* @__PURE__ */ new Map();
  let at = 0;
  for (const o of options || []) {
    if (!isGroup(o)) {
      at += 1;
      continue;
    }
    if (o.options.length) heads.set(at, String(o.group ?? ""));
    at += o.options.length;
  }
  return heads;
}
var groupHeading = (text) => el("div", "twm-choice__group", text);
function sameChoice(v, value, loose = false) {
  if (v === value) return true;
  if (!loose || v === void 0 || value === void 0 || v === null || value === null) return false;
  return String(v) === String(value);
}
function choiceIndex(list, v, loose = false, from = 0) {
  for (let i = from; i < list.length; i += 1) if (list[i].value === v) return i;
  if (!loose) return -1;
  for (let i = from; i < list.length; i += 1) if (sameChoice(list[i].value, v, true)) return i;
  return -1;
}
function findChoice(list, v, loose = false) {
  const i = choiceIndex(list, v, loose);
  return i >= 0 ? list[i] : void 0;
}
var optionText = (o) => o.disabled && o.reason ? `${o.label} \u2014 ${o.reason}` : o.label;
function selectBox(options, value, {
  empty = null,
  label = "",
  notFound = (v) => `${v} (not found)`,
  keepMissing = true,
  valueAttr = "index",
  loose = false,
  className = "twm-flow-input twm-flow-input--select"
} = {}) {
  const box = el("select", className);
  if (label) box.setAttribute("aria-label", label);
  let entries = [];
  const add = (parent, o) => {
    const attr = valueAttr === "index" ? String(entries.length) : o.value === void 0 ? "" : String(o.value);
    const opt = el("option", "", optionText(o));
    opt.value = attr;
    if (o.disabled) {
      opt.disabled = true;
      if (o.reason) opt.title = o.reason;
    }
    parent.appendChild(opt);
    entries.push(o);
  };
  const firstEnabled = () => {
    const i = entries.findIndex((e) => !e.disabled);
    return i >= 0 ? i : 0;
  };
  const select = (v) => {
    const start = empty !== null ? 1 : 0;
    const at = choiceIndex(entries, v, loose, start);
    if (at < 0 || entries[at].disabled || entries[at].stray) return false;
    box.selectedIndex = at;
    return true;
  };
  const place = (v) => {
    if (select(v)) return;
    if (keepMissing && v !== void 0 && v !== null && v !== "") {
      add(box, {
        value: v,
        label: notFound(shownValue(v)),
        description: null,
        disabled: false,
        reason: null,
        stray: true
      });
      box.selectedIndex = entries.length - 1;
      return;
    }
    box.selectedIndex = empty !== null ? 0 : firstEnabled();
  };
  const fill = (opts, v) => {
    box.replaceChildren();
    entries = [];
    if (empty !== null) add(box, {
      value: void 0,
      label: String(empty),
      description: null,
      disabled: false,
      reason: null
    });
    for (const o of opts || []) {
      if (isGroup(o)) {
        const g = el("optgroup");
        g.label = String(o.group ?? "");
        for (const inner of o.options) add(g, choiceOption(inner));
        box.appendChild(g);
      } else {
        add(box, choiceOption(o));
      }
    }
    place(v);
  };
  const entry = () => box.selectedIndex < 0 ? null : entries[box.selectedIndex] ?? null;
  const valueOf = () => entry()?.value;
  fill(options, value);
  return {
    box,
    valueOf,
    entry,
    select,
    setOptions(opts, v = valueOf()) {
      fill(opts, v);
    }
  };
}
function toggleChips({
  options,
  value,
  label,
  readOnly,
  onChange,
  notFound = (v) => `${v} (not found)`,
  keepMissing = true,
  loose = false
}) {
  const root = el("div", "twm-flow-togglechips");
  root.setAttribute("role", "group");
  if (label) root.setAttribute("aria-label", label);
  let shown = [];
  let list = [];
  let chosen = /* @__PURE__ */ new Set();
  let strays = [];
  const emit = () => {
    const out = valueOf();
    onChange?.(out.length ? out : void 0);
  };
  const chipFor = (text, pressed, toggle, { stray = false, reason = null, disabled = false } = {}) => {
    const b = el("button", `twm-flow-togglechip${stray ? " twm-flow-togglechip--missing" : ""}`, text);
    b.type = "button";
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.disabled = Boolean(readOnly) || disabled;
    if (reason) {
      b.title = reason;
      b.appendChild(el("span", "twm-choice__reason", reason));
    }
    b.addEventListener("click", () => {
      const on = toggle();
      b.setAttribute("aria-pressed", on ? "true" : "false");
      emit();
    });
    return b;
  };
  const draw = (opts, stored) => {
    shown = opts || [];
    list = flatChoices(shown);
    const heads = groupHeads(shown);
    const wanted = Array.isArray(stored) ? stored : [];
    const offered = (v) => {
      const o = findChoice(list, v, loose);
      return o && !o.disabled ? o : void 0;
    };
    chosen = new Set(wanted.map(offered).filter(Boolean).map((o) => o.value));
    strays = keepMissing ? wanted.filter((v) => !offered(v)) : [];
    root.replaceChildren();
    list.forEach((o, i) => {
      if (heads.has(i)) root.appendChild(groupHeading(heads.get(i)));
      root.appendChild(chipFor(o.label, chosen.has(o.value), () => {
        if (o.disabled) return false;
        if (chosen.has(o.value)) chosen.delete(o.value);
        else chosen.add(o.value);
        return chosen.has(o.value);
      }, { disabled: o.disabled, reason: o.disabled ? o.reason : null }));
    });
    for (const v of [...strays]) {
      root.appendChild(chipFor(notFound(shownValue(v)), true, () => {
        const i = strays.indexOf(v);
        if (i >= 0) {
          strays.splice(i, 1);
          return false;
        }
        strays.push(v);
        return true;
      }, { stray: true }));
    }
  };
  const valueOf = () => [...list.filter((o) => chosen.has(o.value)).map((o) => o.value), ...strays];
  draw(options, value);
  return {
    el: root,
    valueOf,
    setValue: (stored) => draw(shown, stored),
    setOptions: (opts) => draw(opts, valueOf())
  };
}
function choiceList({
  options,
  value,
  name,
  label,
  readOnly,
  onChange,
  notFound = (v) => `${v} (not found)`,
  keepMissing = true,
  loose = false
}) {
  const root = el("div", "twm-flow-choices");
  root.setAttribute("role", "radiogroup");
  if (label) root.setAttribute("aria-label", label);
  let list = [];
  let radios = [];
  const draw = (opts, current) => {
    list = flatChoices(opts);
    const heads = groupHeads(opts);
    radios = [];
    root.replaceChildren();
    const named = choiceIndex(list, current, loose);
    const at = named >= 0 && !list[named].disabled ? named : -1;
    list.forEach((o, i) => {
      if (heads.has(i)) root.appendChild(groupHeading(heads.get(i)));
      const row = el("label", `twm-flow-choice${o.disabled ? " twm-choice--disabled" : ""}`);
      const radio = el("input", "twm-flow-choice__radio");
      radio.type = "radio";
      radio.name = name;
      radio.checked = i === at;
      radio.disabled = Boolean(readOnly) || o.disabled;
      radio.addEventListener("change", () => {
        if (radio.checked) onChange?.(o.value);
      });
      radios.push(radio);
      const words = el("span", "twm-flow-choice__words");
      words.appendChild(el("span", "twm-flow-choice__label", o.label));
      if (o.description !== null) words.appendChild(el("span", "twm-flow-choice__sub", o.description));
      if (o.disabled && o.reason) words.appendChild(el("span", "twm-choice__reason", o.reason));
      row.append(radio, words);
      root.appendChild(row);
    });
    if (keepMissing && current !== void 0 && named < 0) {
      root.appendChild(el("p", "twm-flow-field__note", notFound(shownValue(current))));
    }
  };
  const checkedAt = () => radios.findIndex((r) => r.checked);
  const entry = () => list[checkedAt()] ?? null;
  const api = {
    el: root,
    focus: () => (radios.find((r) => r.checked && !r.disabled) || radios.find((r) => !r.disabled))?.focus({ preventScroll: true }),
    entry,
    valueOf: () => entry()?.value,
    select(v) {
      const named = choiceIndex(list, v, loose);
      const at = named >= 0 && !list[named].disabled ? named : -1;
      radios.forEach((r, i) => {
        r.checked = i === at;
      });
      return at >= 0;
    },
    setOptions(opts) {
      draw(opts, api.valueOf());
    }
  };
  draw(options, value);
  return api;
}

// src/ui/utils/focusable.js
function collectFocusable(root) {
  if (!root) return [];
  const sel = [
    "a[href]",
    "button:not([disabled])",
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])'
  ].join(",");
  return Array.from(root.querySelectorAll(sel)).filter((el2) => {
    if (el2.hidden) return false;
    if (el2.closest("[hidden]")) return false;
    const r = el2.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  });
}

export {
  setModalHost,
  modalHost,
  positionAnchored,
  isInAnchoredLayer,
  openAnchoredLayer,
  collectFocusable,
  shownValue,
  flatChoices,
  choiceSections,
  filterSections,
  findChoice,
  selectBox,
  toggleChips,
  choiceList
};
//# sourceMappingURL=chunk-Q7BALEPX.js.map
