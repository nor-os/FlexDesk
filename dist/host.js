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
    optional: Object.freeze(["startNativeDrag"])
  }),
  dialogs: Object.freeze({ required: Object.freeze(["saveFile"]), optional: Object.freeze([]) }),
  state: Object.freeze({ required: Object.freeze(["read", "write"]), optional: Object.freeze([]) })
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
export {
  HOST_CONTRACT,
  NULL_HOST,
  createHost,
  createPywebviewHost,
  usesCustomWindowChrome,
  validateCapability
};
//# sourceMappingURL=host.js.map
