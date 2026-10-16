import "./chunk-JYWURG5T.js";

// src/host/host.js
var HOST_CONTRACT = Object.freeze({
  window: Object.freeze({
    required: Object.freeze([
      "chrome",
      "minimize",
      "close",
      "isMaximized",
      "setMaximized",
      "isFullscreen",
      "toggleFullscreen",
      "getBounds",
      "setBounds"
    ]),
    // `chrome()` answers 'native' or 'custom', or a promise of one.
    optional: Object.freeze(["startNativeDrag", "startNativeResize"])
  }),
  dialogs: Object.freeze({ required: Object.freeze(["saveFile"]), optional: Object.freeze([]) }),
  state: Object.freeze({ required: Object.freeze(["read", "write"]), optional: Object.freeze([]) }),
  // `openExternal(url)` hands a web address to the OS's default browser and
  // resolves true when it did. See external_links.js.
  shell: Object.freeze({ required: Object.freeze(["openExternal"]), optional: Object.freeze([]) })
});
function validateCapability(name, cap) {
  const spec = HOST_CONTRACT[name];
  if (!spec) return { ok: false, missing: [`unknown capability '${name}'`] };
  if (!cap || typeof cap !== "object") return { ok: false, missing: [...spec.required] };
  const missing = spec.required.filter((m) => typeof cap[m] !== "function");
  return { ok: missing.length === 0, missing };
}
function createHost(caps = {}) {
  const host = {};
  for (const name of Object.keys(HOST_CONTRACT)) {
    const cap = caps[name];
    if (cap == null) continue;
    const v = validateCapability(name, cap);
    if (!v.ok) {
      throw new Error(`Host capability '${name}' is incomplete: missing ${v.missing.join(", ")}`);
    }
    host[name] = Object.freeze(cap);
  }
  return Object.freeze(host);
}
var NULL_HOST = createHost({});

// src/host/pywebview_host.js
var FRAMELESS_BACKENDS = /* @__PURE__ */ new Set(["edgechromium", "mshtml"]);
function usesCustomWindowChrome() {
  try {
    if (new URLSearchParams(window.location.search).get("frameless") === "1") {
      return true;
    }
  } catch (_) {
  }
  const platform = window.pywebview && window.pywebview.platform;
  return !!platform && FRAMELESS_BACKENDS.has(platform);
}
function createPywebviewHost({ bridgeRef = null, resolvePath = (k) => `${k}.json`, logger = console } = {}) {
  const api = () => bridgeRef?.current ?? window.pywebview?.api ?? null;
  const call = async (name, args = []) => {
    const a = api();
    if (!a || typeof a[name] !== "function") return null;
    try {
      return await a[name](...args);
    } catch (e) {
      logger.warn?.("[host] call failed", name, e);
      return null;
    }
  };
  const okMax = (r) => Boolean(r && r.ok && r.maximized === true);
  const okFs = (r) => Boolean(r && r.ok && r.fullscreen);
  return createHost({
    window: {
      chrome: () => usesCustomWindowChrome() ? "custom" : "native",
      minimize: () => {
        void call("window_minimize");
      },
      close: () => {
        void call("window_close");
      },
      isMaximized: async () => okMax(await call("window_is_maximized")),
      setMaximized: async (on) => okMax(await call("window_set_maximized", [on])),
      isFullscreen: async () => okFs(await call("window_is_fullscreen")),
      toggleFullscreen: async () => okFs(await call("window_toggle_fullscreen")),
      async getBounds() {
        const r = await call("window_get_bounds");
        if (!r || !r.ok) return null;
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      },
      // POSITIONAL on the wire — both transports depend on it. Not async:
      // this is a rAF hot path during a window drag/resize; nobody awaits.
      setBounds({ x = null, y = null, width = null, height = null } = {}) {
        void call("window_set_bounds", [x, y, width, height]);
      },
      startNativeDrag: async () => Boolean((await call("window_start_native_drag"))?.ok)
    },
    dialogs: {
      // Resolves to null when the transport has no save_file_dialog behind it.
      // Per host.js that is the contract for "unavailable", and every caller
      // treats it exactly like an absent `dialogs` capability: fall back to a
      // Blob download, never report a failed save. Covered by
      // tests/ui/test_host_save_fallback.mjs.
      saveFile: ({ data, filename, kind }) => call("save_file_dialog", [data, filename, kind])
    },
    state: {
      async read(key) {
        const blob = await call("workspace_state_read", [{ path: resolvePath(key) }]);
        if (!blob) return null;
        try {
          return typeof blob === "string" ? JSON.parse(blob) : blob;
        } catch (e) {
          logger.warn?.("[host] bad JSON for state key", key, e);
          return null;
        }
      },
      async write(key, value) {
        const r = await call(
          "workspace_state_write",
          [{ path: resolvePath(key), data: JSON.stringify(value) }]
        );
        return r !== null;
      }
    }
  });
}

// src/host/photino_host.js
function isPhotinoWindow(ext = typeof window !== "undefined" ? window.external : void 0) {
  return !!ext && typeof ext.sendMessage === "function" && typeof ext.receiveMessage === "function";
}
function createPhotinoTransport({ external, timeoutMs = 1e4, onEvent = null, logger = console }) {
  const pending = /* @__PURE__ */ new Map();
  let seq = 0;
  external.receiveMessage((text) => {
    let m;
    try {
      m = typeof text === "string" ? JSON.parse(text) : text;
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    if (m.id == null) {
      if (typeof m.event === "string" && onEvent) {
        try {
          onEvent(m.event, m.value);
        } catch (e) {
          logger.warn?.("[host] photino event handler failed", m.event, e);
        }
      }
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.value === void 0 ? null : m.value);
    else p.reject(new Error(m.error || `${p.what}: refused by the host`));
  });
  const request = (cap, op, args = [], { wait = timeoutMs } = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const what = `${cap}.${op}`;
    const timer = wait > 0 ? setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${what}: no answer from the host within ${wait} ms`));
    }, wait) : null;
    pending.set(id, { resolve, reject, timer, what });
    try {
      external.sendMessage(JSON.stringify({ id, cap, op, args }));
    } catch (e) {
      pending.delete(id);
      clearTimeout(timer);
      reject(e);
    }
  });
  const call = (cap, op, ...args) => request(cap, op, args);
  return { call, request, pending: () => pending.size };
}
function createPhotinoHost(opts = {}) {
  const {
    external = typeof window !== "undefined" ? window.external : void 0,
    timeoutMs = 1e4,
    onEvent = null,
    logger = console,
    chrome = "auto"
  } = opts;
  if (!isPhotinoWindow(external)) return NULL_HOST;
  const { call, request } = createPhotinoTransport({ external, timeoutMs, onEvent, logger });
  const warn = (cap, op, e) => logger.warn?.("[host] photino call failed", `${cap}.${op}`, e);
  const soft = async (fallback, cap, op, ...args) => {
    try {
      return await call(cap, op, ...args);
    } catch (e) {
      warn(cap, op, e);
      return fallback;
    }
  };
  const fire = (cap, op, ...args) => {
    void soft(null, cap, op, ...args);
  };
  let frame = chrome === "custom" || chrome === "native" ? chrome : null;
  let asking = null;
  const askFrame = () => {
    if (frame) return frame;
    asking ??= request("host", "describe", [], { wait: 3e3 }).then((d) => d && d.frame === "custom" ? "custom" : "native", () => "native").then((f) => {
      frame = f;
      return f;
    });
    return asking;
  };
  const gesture = async (op, ...args) => {
    try {
      await request("window", op, args, { wait: 0 });
      return true;
    } catch (e) {
      return false;
    }
  };
  const defaults = {
    window: {
      // 'native' (the OS draws the frame: FlexDesk's own buttons would be
      // a second set) or 'custom' (the native side made the window
      // frameless). A promise until the native side has said which.
      chrome: () => askFrame(),
      minimize: () => {
        fire("window", "minimize");
      },
      close: () => {
        fire("window", "close");
      },
      isMaximized: async () => await soft(false, "window", "isMaximized") === true,
      setMaximized: async (on) => await soft(false, "window", "setMaximized", !!on) === true,
      isFullscreen: async () => await soft(false, "window", "isFullscreen") === true,
      toggleFullscreen: async () => await soft(false, "window", "toggleFullscreen") === true,
      async getBounds() {
        const b = await soft(null, "window", "getBounds");
        if (!b || typeof b !== "object") return null;
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      },
      startNativeDrag: () => gesture("startDrag"),
      startNativeResize: (edge) => gesture("startResize", String(edge || "")),
      // Not async, like pywebview's: a rAF hot path during a drag; nobody awaits.
      setBounds({ x = null, y = null, width = null, height = null } = {}) {
        fire("window", "setBounds", { x, y, width, height });
      }
    },
    dialogs: {
      // `{ok: true, path}` | `{ok: false, cancelled: true}` | `{ok: false, error}`,
      // or null when the host refused: fall back to a download. NO TIMEOUT —
      // the dialog is open for as long as the user takes, and giving up on it
      // would download the file a second time behind the dialog.
      async saveFile({ data, filename, kind } = {}) {
        let r = null;
        try {
          r = await request("dialogs", "saveFile", [{ data, filename, kind }], { wait: 0 });
        } catch (e) {
          warn("dialogs", "saveFile", e);
        }
        return r && typeof r === "object" ? r : null;
      }
    },
    shell: {
      // True when the native side opened it in the system browser; false
      // when it refused (a scheme it won't open, an older native side
      // without the op): the caller falls back to window.open.
      openExternal: async (url) => await soft(false, "shell", "openExternal", String(url || "")) === true
    },
    state: {
      async read(key) {
        const v = await soft(null, "state", "read", key);
        if (typeof v !== "string") return v ?? null;
        try {
          return JSON.parse(v);
        } catch (e) {
          logger.warn?.("[host] bad JSON for state key", key, e);
          return null;
        }
      },
      async write(key, value) {
        return await soft(false, "state", "write", key, value) !== false;
      }
    }
  };
  const caps = {};
  for (const name of Object.keys(defaults)) {
    if (!(name in opts)) caps[name] = defaults[name];
    else if (opts[name] != null) caps[name] = opts[name];
  }
  return createHost(caps);
}

// src/host/external_links.js
var SCHEMES = /* @__PURE__ */ new Set(["http:", "https:", "mailto:"]);
function outbound(href, base) {
  let url;
  try {
    url = new URL(String(href), base);
  } catch {
    return null;
  }
  return SCHEMES.has(url.protocol) ? url : null;
}
function routeExternalLinks({ host, root, win } = {}) {
  const w = win ?? (typeof window !== "undefined" ? window : null);
  const r = root ?? (typeof document !== "undefined" ? document : null);
  const shell = host?.shell;
  if (!shell || typeof shell.openExternal !== "function" || !w || !r) return { dispose() {
  } };
  const base = () => w.location?.href;
  const origin = () => {
    try {
      return new URL(base()).origin;
    } catch {
      return null;
    }
  };
  const nativeOpen = w.open;
  const fallback = (href) => {
    try {
      nativeOpen?.call(w, href, "_blank", "noopener");
    } catch {
    }
  };
  const send = (href) => {
    Promise.resolve().then(() => shell.openExternal(href)).then((opened) => {
      if (opened !== true) fallback(href);
    }, () => fallback(href));
  };
  const onClick = (e) => {
    if (e.defaultPrevented) return;
    if (e.type === "click" ? e.button !== 0 : e.button !== 1) return;
    const a = e.target?.closest?.("a[href]");
    if (!a || a.hasAttribute("download")) return;
    const url = outbound(a.getAttribute("href"), base());
    if (!url) return;
    const leaves = url.protocol === "mailto:" || (a.getAttribute("target") || "").toLowerCase() === "_blank" || url.origin !== origin() || e.button === 1;
    if (!leaves) return;
    e.preventDefault();
    send(url.href);
  };
  const routedOpen = function open(href, target, features) {
    const url = href == null ? null : outbound(href, base());
    if (url && (url.protocol === "mailto:" || url.origin !== origin())) {
      send(url.href);
      return null;
    }
    return nativeOpen.call(w, href, target, features);
  };
  r.addEventListener("click", onClick);
  r.addEventListener("auxclick", onClick);
  w.open = routedOpen;
  return {
    dispose() {
      r.removeEventListener("click", onClick);
      r.removeEventListener("auxclick", onClick);
      if (w.open === routedOpen) w.open = nativeOpen;
    }
  };
}
export {
  HOST_CONTRACT,
  NULL_HOST,
  createHost,
  createPhotinoHost,
  createPhotinoTransport,
  createPywebviewHost,
  isPhotinoWindow,
  routeExternalLinks,
  usesCustomWindowChrome,
  validateCapability
};
//# sourceMappingURL=host.js.map
