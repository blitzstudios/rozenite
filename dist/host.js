import * as r from "/rozenite/ui/legacy/legacy.js";
import * as a from "/rozenite/core/sdk/sdk.js";
import "/rozenite/models/react_native/react_native.js";
const D = async (i) => (await fetch(i + "/rozenite.json")).json(), z = (i) => {
  const e = new URL(location.href);
  return e.search = "", e.pathname = "/rozenite/plugins/" + i.replace("/", "_"), e.toString();
}, v = async (i, e) => {
  const t = await D(i), n = e ?? t.name;
  return console.groupCollapsed(`📦 Plugin: ${t.name}`), console.log("Version:", t.version), console.log("Description:", t.description), console.log("Panels:", t.panels.map((s) => s.name).join(", ")), console.groupEnd(), {
    id: n,
    name: t.name,
    description: t.description,
    version: t.version,
    panels: t.panels.map((s) => ({
      id: `${n}:${s.name}`,
      name: s.name,
      source: i + s.source
    }))
  };
}, p = async (i) => v(z(i), i), C = "http://localhost:8888", w = async () => {
  try {
    const i = await v(C);
    return console.group("🔧 Rozenite Dev Mode"), console.log("We detected that you are developing a plugin."), console.log("This plugin will be automatically loaded with hot reload."), console.groupEnd(), i;
  } catch {
    return null;
  }
}, c = () => globalThis.__ROZENITE__, R = "typeof window !== 'undefined' && typeof window.document !== 'undefined'", u = "rozenite", E = "main", g = "__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__";
class M extends a.SDKModel.SDKModel {
  messagingBindingName = null;
  enabled = !1;
  fuseboxDispatcherIsInitialized = !1;
  messageQueue = [];
  messageListeners = /* @__PURE__ */ new Set();
  targetIsWeb = null;
  /**
   * Whether the connected target is a browser, as reported by the device
   * itself — `null` until the probe has answered, or if it failed.
   *
   * Half of the target's integration. The other half is the host, which is
   * always `react-native` on this path: the Fusebox-embedded shell is only
   * ever served by a React Native dev server (a Lynx one never registers
   * `/rn_fusebox.html`), so unlike the standalone app there is nothing to
   * fetch. `null` means "unknown", never "not web" — a wrong answer here
   * would be indistinguishable from a right one.
   */
  getTargetIsWeb() {
    return this.targetIsWeb;
  }
  /**
   * Asks the device whether it is a browser by evaluating
   * `IS_WEB_TARGET_EXPRESSION` in its own runtime.
   *
   * The device is the only party that knows for certain, and one Rozenite
   * controls — so it is asked, rather than inferred from React Native's
   * `ReactNativeApplication.metadataUpdated`, an event we neither emit nor
   * can order against anything a host does.
   *
   * Never throws: this is advisory metadata, and `enable()` must not fail
   * (taking every Rozenite panel with it) because one extra evaluate did.
   */
  async probeTargetIsWeb() {
    const e = this.target().model(a.RuntimeModel.RuntimeModel);
    if (e)
      try {
        const t = await e.agent.invoke_evaluate({
          expression: R,
          returnByValue: !0
        });
        if (t.exceptionDetails)
          throw new Error(t.exceptionDetails.text);
        if (typeof t.result.value != "boolean")
          throw new Error(`Expected a boolean, got ${typeof t.result.value}.`);
        this.targetIsWeb = t.result.value;
      } catch (t) {
        console.warn("[rozenite] Could not determine whether the target is a browser.", t);
      }
  }
  dispose() {
    this.messageQueue = [];
    const e = this.target().model(a.RuntimeModel.RuntimeModel);
    e?.removeEventListener("BindingCalled", this.bindingCalled, this), e?.removeEventListener(
      "ExecutionContextCreated",
      this.onExecutionContextCreated,
      this
    ), e?.removeEventListener(
      "ExecutionContextDestroyed",
      this.onExecutionContextDestroyed,
      this
    );
  }
  bindingCalled(e) {
    if (this.messagingBindingName === null || e.data.name !== this.messagingBindingName)
      return;
    const t = e.data.payload;
    if (!t.includes(u))
      return;
    let n = null;
    try {
      n = JSON.parse(t);
    } catch {
      throw new Error("Failed to parse bindingCalled event payload");
    }
    if (n) {
      const s = n.domain;
      if (n.domain !== u)
        return;
      if (this.fuseboxDispatcherIsInitialized) {
        if (!this.isDomainMessagesQueueEmpty())
          throw new Error(
            `Attempted to send a message to domain ${s} while queue is not empty`
          );
        this.dispatchMessageToDomainEventListeners(n.message);
      } else
        this.queueMessage(n.message);
    }
  }
  queueMessage(e) {
    this.messageQueue.push(e);
  }
  flushOutDomainMessagesQueues() {
    for (const e of this.messageQueue)
      this.dispatchMessageToDomainEventListeners(e);
    this.messageQueue = [];
  }
  isDomainMessagesQueueEmpty() {
    return this.messageQueue.length === 0;
  }
  subscribeToDomainMessages(e) {
    this.messageListeners.add(e);
  }
  unsubscribeFromDomainMessages(e) {
    this.messageListeners.delete(e);
  }
  dispatchMessageToDomainEventListeners(e) {
    const t = this.messageListeners, n = [];
    for (const s of t)
      try {
        s(e);
      } catch (o) {
        n.push(o);
      }
    if (n.length > 0)
      throw new Error("Error occurred in RozeniteBindingsModel while calling event listeners");
  }
  async initializeDomain() {
    const e = this.target().model(a.RuntimeModel.RuntimeModel);
    if (!e)
      throw new Error(
        "Failed to initialize domain for RozeniteBindingsModel: runtime model is not available"
      );
    const t = await e.agent.invoke_evaluate({
      expression: `(() => { try { ${g}.initializeDomain('${u}'); return true; } catch (e) { return String(e && e.message || e); } })()`,
      returnByValue: !0
    });
    if (t.result?.value !== !0)
      throw new Error(
        `Failed to initialize the ${u} domain: ` + String(t.result?.value ?? t.exceptionDetails?.text)
      );
    this.fuseboxDispatcherIsInitialized = !0, this.flushOutDomainMessagesQueues();
  }
  async sendMessage(e) {
    if (!this.fuseboxDispatcherIsInitialized)
      return;
    const t = this.target().model(a.RuntimeModel.RuntimeModel);
    if (!t)
      throw new Error(
        "Failed to send message from RozeniteBindingsModel: runtime model is not available"
      );
    const n = JSON.stringify(e), s = JSON.stringify(n);
    await t.agent.invoke_evaluate({
      expression: `void (() => { try { ${g}.sendMessage('${u}', ${s}); } catch (e) {} })()`
    });
  }
  async enable() {
    if (this.enabled)
      throw new Error("RozeniteBindingsModel is already enabled");
    const e = this.target().model(a.RuntimeModel.RuntimeModel);
    if (!e)
      throw new Error("Failed to enable RozeniteBindingsModel: runtime model is not available");
    await this.waitForFuseboxDispatcherToBeInitialized().then(() => this.probeTargetIsWeb()).then(
      () => e.agent.invoke_evaluate({
        expression: `${g}.BINDING_NAME`
      })
    ).then((t) => {
      if (t.exceptionDetails)
        throw new Error(
          "Failed to get binding name for RozeniteBindingsModel on a global: " + t.exceptionDetails.text
        );
      if (t.result.value === null || t.result.value === void 0)
        throw new Error(
          "Failed to get binding name for RozeniteBindingsModel on a global: returned value is " + String(t.result.value)
        );
      if (t.result.value === "")
        throw new Error(
          "Failed to get binding name for ReactDevToolsBindingsModel on a global: returned value is an empty string"
        );
      return t.result.value;
    }).then((t) => (this.messagingBindingName = t, e.addEventListener("BindingCalled", this.bindingCalled, this), e.agent.invoke_addBinding({ name: t }))).then((t) => {
      const n = t.getError();
      if (n)
        throw new Error("Failed to add binding for ReactDevToolsBindingsModel: " + n);
      this.enabled = !0, this.initializeExecutionContextListeners();
    });
  }
  isEnabled() {
    return this.enabled;
  }
  initializeExecutionContextListeners() {
    const e = this.target().model(a.RuntimeModel.RuntimeModel);
    if (!e)
      throw new Error(
        "Failed to initialize execution context listeners for RozeniteBindingsModel: runtime model is not available"
      );
    e.addEventListener("ExecutionContextCreated", this.onExecutionContextCreated, this), e.addEventListener(
      "ExecutionContextDestroyed",
      this.onExecutionContextDestroyed,
      this
    );
  }
  onExecutionContextCreated({
    data: e
  }) {
    e.name === E && this.waitForFuseboxDispatcherToBeInitialized().then(() => {
      this.dispatchEventToListeners("BackendExecutionContextCreated");
    }).catch(
      (t) => this.dispatchEventToListeners("BackendExecutionContextUnavailable", t.message)
    );
  }
  onExecutionContextDestroyed({
    data: e
  }) {
    e.name === E && (this.fuseboxDispatcherIsInitialized = !1, this.dispatchEventToListeners("BackendExecutionContextDestroyed"));
  }
  async waitForFuseboxDispatcherToBeInitialized(e = 1) {
    if (e >= 20)
      throw new Error("Failed to wait for initialization: it took too long");
    const t = this.target().model(a.RuntimeModel.RuntimeModel);
    if (!t)
      throw new Error(
        "Failed to wait for React DevTools dispatcher initialization: runtime model is not available"
      );
    await t.agent.invoke_evaluate({
      expression: `globalThis.${g} != undefined`,
      returnByValue: !0
    }).then((n) => {
      if (n.exceptionDetails)
        throw new Error(
          "Failed to wait for React DevTools dispatcher initialization: " + n.exceptionDetails.text
        );
      if (n.result.value === !1)
        return new Promise((s) => setTimeout(s, 250)).then(
          () => this.waitForFuseboxDispatcherToBeInitialized(e + 1)
        );
    });
  }
}
a.SDKModel.SDKModel.register(M, {
  capabilities: 4,
  autostart: !1
});
class y extends a.SDKModel.SDKModel {
  #e;
  #t = /* @__PURE__ */ new Set();
  #i = !1;
  #s = !1;
  constructor(e) {
    super(e);
    const t = e.model(M);
    if (t === null)
      throw new Error("Failed to construct RozenitePluginModel: RozeniteBindingsModel was null");
    this.#e = t, t.addEventListener(
      "BackendExecutionContextCreated",
      this.#o,
      this
    ), t.addEventListener(
      "BackendExecutionContextUnavailable",
      this.#d,
      this
    ), t.addEventListener(
      "BackendExecutionContextDestroyed",
      this.#n,
      this
    );
  }
  dispose() {
    this.#e.removeEventListener(
      "BackendExecutionContextCreated",
      this.#o,
      this
    ), this.#e.removeEventListener(
      "BackendExecutionContextUnavailable",
      this.#d,
      this
    ), this.#e.removeEventListener(
      "BackendExecutionContextDestroyed",
      this.#n,
      this
    ), this.#t.clear();
  }
  ensureInitialized() {
    this.#i || (this.#i = !0, this.#r());
  }
  async #r() {
    try {
      const e = this.#e;
      e.isEnabled() || await e.enable(), e.subscribeToDomainMessages((t) => this.#l(t)), await e.initializeDomain(), this.#s = !0, this.#a();
    } catch (e) {
      this.dispatchEventToListeners("InitializationFailed", e.message);
    }
  }
  isInitialized() {
    return this.#s;
  }
  #l(e) {
    if (e)
      for (const t of this.#t)
        t(e);
  }
  async sendMessage(e) {
    const t = this.#e;
    if (!t)
      throw new Error("RozenitePluginModel failed to send message: RozeniteBindingsModel was null");
    return await t.sendMessage(e);
  }
  onMessage(e) {
    return this.#t.add(e), () => {
      this.#t.delete(e);
    };
  }
  #o() {
    const e = this.#e;
    if (!e)
      throw new Error(
        "RozenitePluginModel failed to handle BackendExecutionContextCreated event: RozeniteBindingsModel was null"
      );
    e.isEnabled() ? e.initializeDomain().then(
      () => this.#a(),
      (t) => this.dispatchEventToListeners("InitializationFailed", t.message)
    ) : this.ensureInitialized();
  }
  #a() {
    this.dispatchEventToListeners("InitializationCompleted");
  }
  #d({ data: e }) {
    this.dispatchEventToListeners("InitializationFailed", e);
  }
  #n() {
    this.#t.clear(), this.dispatchEventToListeners("Destroyed");
  }
}
a.SDKModel.SDKModel.register(y, {
  capabilities: 4,
  autostart: !1
});
class L extends r.View.SimpleView {
  #e = null;
  #t;
  #i;
  constructor(e, t, n, s, o) {
    super(n + " 💎", !0, t), this.#t = s, this.#i = o, c().destroyOnDetachPlugins.includes(e) || this.setHideOnDetach(), a.TargetManager.TargetManager.instance().observeModels(y, this), this.#a();
  }
  modelAdded(e) {
    this.#e = e, e.addEventListener("InitializationCompleted", this.#s, this), e.addEventListener("InitializationFailed", this.#r, this), e.addEventListener("Destroyed", this.#l, this), e.isInitialized() ? this.#o() : e.ensureInitialized();
  }
  modelRemoved(e) {
    e.removeEventListener("InitializationCompleted", this.#s, this), e.removeEventListener("InitializationFailed", this.#r, this), e.removeEventListener("Destroyed", this.#l, this);
  }
  #s() {
    this.#o();
  }
  #r({ data: e }) {
    this.#d(e);
  }
  #l() {
    this.#a();
  }
  #o() {
    this.#n();
    const e = this.#e;
    if (e === null)
      throw new Error("Attempted to render panel, but the model was null");
    const t = document.createElement("iframe");
    t.src = this.#t, t.style.height = "100%", t.style.width = "100%", window.addEventListener("message", (n) => {
      if (n.source === t.contentWindow) {
        if (n.data?.type === "rozenite-shell-ready") {
          t.contentWindow?.postMessage(
            {
              type: "rozenite-shell-configuration",
              payload: this.#i
            },
            "*"
          );
          return;
        }
        e.sendMessage(n.data.payload);
      }
    }), e.onMessage((n) => {
      t.contentWindow?.postMessage(n, "*");
    }), this.contentElement.appendChild(t);
  }
  #a() {
    this.#n();
    const e = document.createElement("div");
    e.setAttribute(
      "style",
      "display: flex; flex: 1; justify-content: center; align-items: center"
    );
    const t = document.createElement("span");
    t.classList.add("spinner"), e.appendChild(t), this.contentElement.appendChild(e);
  }
  #d(e) {
    this.#n();
    const t = document.createElement("div");
    t.setAttribute(
      "style",
      "display: flex; flex: 1; flex-direction: column; justify-content: center; align-items: center"
    );
    const n = document.createElement("div");
    n.setAttribute("style", "font-size: 3rem"), n.innerHTML = "❗";
    const s = document.createElement("p");
    s.setAttribute("style", "user-select: all"), s.innerHTML = e, t.appendChild(n), t.appendChild(s), this.contentElement.appendChild(t);
  }
  #n() {
    let e = this.contentElement.lastElementChild;
    for (; e; )
      this.contentElement.removeChild(e), e = this.contentElement.lastElementChild;
  }
}
const P = (i, e, t, n, s) => new L(i, e, t, n, s), f = (i) => i.toLowerCase().replace(/[^a-z0-9]/g, " ").trim().replace(/\s+/g, " ").replace(/\s/g, ".").replace(/\.+/g, ".").replace(/^\.+|\.+$/g, ""), b = (i, e, t, n = {}) => {
  try {
    const s = f(i), o = f(e), l = `${s}.${o}`;
    if (r.InspectorView.InspectorView.instance().hasPanel(l))
      return;
    const m = P(i, l, e, t, n.shellConfiguration);
    if (r.InspectorView.InspectorView.instance().addPanel(m), n.insertAtStart || n.insertAtEnd) {
      const d = r.InspectorView.InspectorView.instance().tabbedPane, h = d.tabsById.get(l);
      if (!h)
        throw new Error(`Panel view tab not found: ${l}`);
      n.insertAtStart ? (d.insertBefore(h, 0), d.selectTab(h.id)) : d.insertBefore(h, d.tabsById.size);
    }
  } catch (s) {
    throw console.error(s), s;
  }
}, x = "rozenite-welcome", B = "https://rozenite.dev/welcome";
class T extends r.View.SimpleView {
  constructor() {
    super("Rozenite 💎", !0, x);
    const { installedPlugins: e } = c(), t = e.length > 0, n = new URL(B, window.location.origin);
    n.searchParams.set("withPluginsInstalled", t.toString());
    const s = document.createElement("iframe");
    s.src = n.toString(), s.style.height = "100%", s.style.width = "100%", this.contentElement.appendChild(s);
  }
}
const S = () => {
  const i = new T();
  r.InspectorView.InspectorView.instance().addPanel(i);
  const e = r.InspectorView.InspectorView.instance().tabbedPane.tabsById.get(x);
  if (!e)
    throw new Error("Welcome view tab not found.");
  r.InspectorView.InspectorView.instance().tabbedPane.insertBefore(e, 0), r.InspectorView.InspectorView.instance().tabbedPane.selectTab(e.id);
}, V = () => {
  try {
    const i = decodeURIComponent(window.location.href).match(/[?&]device=([^&]+)/);
    return i ? i[1] : null;
  } catch {
    return null;
  }
}, I = () => {
  const i = V();
  if (!i)
    throw new Error("Device ID not found");
  return `rozenite::selected-panel::${i}`;
}, F = (i) => {
  try {
    const e = I();
    localStorage.setItem(e, i);
  } catch (e) {
    console.warn("Could not save selected panel:", e);
  }
}, _ = () => {
  try {
    const i = I();
    return localStorage.getItem(i);
  } catch (i) {
    return console.warn("Could not get selected panel:", i), null;
  }
}, k = () => {
  const i = _();
  if (i)
    try {
      r.InspectorView.InspectorView.instance().tabbedPane.selectTab(i);
    } catch (e) {
      console.warn("Could not restore last selected panel:", e);
    }
}, O = () => {
  try {
    r.InspectorView.InspectorView.instance().tabbedPane.addEventListener("TabSelected", (e) => {
      const t = e.data.tabId;
      t && F(t);
    });
  } catch (i) {
    console.error("Could not initialize tab selected tracking:", i);
  }
}, N = async () => new Promise((i) => {
  window.addEventListener("DOMContentLoaded", async () => {
    new MutationObserver(async (t, n) => {
      document.querySelector(".main-tabbed-pane") && (n.disconnect(), i());
    }).observe(document.body, { childList: !0, subtree: !0 });
  });
}), A = async () => {
  await N();
  const i = c().installedPlugins;
  console.group("🚀 Rozenite DevTools Framework"), console.log("Devtools framework loaded"), console.log("Found plugins: " + i.join(", ")), console.groupEnd();
  const { pluginDisplay: e = "sidebar" } = c();
  if (e === "tabs") {
    S();
    const t = await Promise.all(i.map((o) => p(o))), n = (o) => {
      o.panels.forEach((l) => {
        b(o.id, l.name, l.source, {
          insertAtEnd: !0
        });
      });
    };
    t.forEach(n);
    const s = await w();
    s && n(s);
  } else {
    const t = await Promise.all(
      i.map(async (o) => p(o))
    ), n = await w();
    n && t.push(n);
    const s = new URL(location.href);
    s.search = "", s.pathname = "/rozenite/shell/index.html", b("@rozenite/shell", "Rozenite", s.toString(), {
      shellConfiguration: {
        plugins: t,
        destroyOnDetachPlugins: c().destroyOnDetachPlugins,
        runtimeVersion: c().runtimeVersion
      },
      insertAtStart: !0
    });
  }
  O(), k();
};
A().catch((i) => {
  console.group("❌ Rozenite Error"), console.error("Initialization failed. See the following error for more details:", i), console.groupEnd();
});
