"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const node_module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const express = require("express");
const assert = require("node:assert");
const crypto = require("node:crypto");
const WebSocket = require("ws");
const fs$1 = require("node:fs/promises");
const os = require("node:os");
const node_url = require("node:url");
const semver = require("semver");
const node_http = require("node:http");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const isExpoProject = (projectRoot) => {
  const appJsonPath = path.join(projectRoot, "app.json");
  if (!fs.existsSync(appJsonPath)) {
    return false;
  }
  try {
    const appJsonContent = fs.readFileSync(appJsonPath, "utf8");
    const appJson = JSON.parse(appJsonContent);
    return typeof appJson === "object" && appJson !== null && "expo" in appJson;
  } catch {
    return false;
  }
};
const getProjectType = (projectRoot) => {
  if (isExpoProject(projectRoot)) {
    return "expo";
  }
  return "react-native-cli";
};
const createLimiter = (concurrency) => {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) {
      return;
    }
    active++;
    queue.shift()?.();
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push(() => {
      task().then(resolve, reject).finally(() => {
        active--;
        next();
      });
    });
    next();
  });
};
const PREFIX = "[Rozenite]";
const LOG_LEVELS = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};
let logLevel = "info";
const setLevel = (level) => {
  logLevel = level;
  process.env.ROZENITE_LOG_LEVEL = level;
};
const shouldLog = (messageLevel) => {
  return LOG_LEVELS[messageLevel] <= LOG_LEVELS[logLevel];
};
const info = (message, ...args) => {
  if (shouldLog("info")) {
    console.log(`${PREFIX} ${message}`, ...args);
  }
};
const warn = (message, ...args) => {
  if (shouldLog("warn")) {
    console.warn(`${PREFIX} ${message}`, ...args);
  }
};
const error = (message, ...args) => {
  if (shouldLog("error")) {
    console.error(`${PREFIX} ${message}`, ...args);
  }
};
const debug = (message, ...args) => {
  if (shouldLog("debug")) {
    console.log(`${PREFIX} [DEBUG] ${message}`, ...args);
  }
};
const logger = {
  setLevel,
  info,
  warn,
  error,
  debug
};
const require$4 = node_module.createRequire(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("index.cjs", document.baseURI).href);
const getReactNativePackagePath = (projectRoot) => {
  const input = require$4.resolve("react-native", { paths: [projectRoot] });
  return path.dirname(input);
};
const getExpoPackagePath = (projectRoot) => {
  try {
    const input = require$4.resolve("expo", { paths: [projectRoot] });
    return path.dirname(input);
  } catch (error2) {
    if (error2 && typeof error2 === "object" && "code" in error2 && error2.code === "MODULE_NOT_FOUND") {
      return null;
    }
    throw error2;
  }
};
const getDevMiddlewarePathFromExpo = (projectRoot) => {
  const expoPackagePath = getExpoPackagePath(projectRoot);
  if (!expoPackagePath) {
    return null;
  }
  const expoCliPath = require$4.resolve("@expo/cli", {
    paths: [expoPackagePath]
  });
  return require$4.resolve("@react-native/dev-middleware", {
    paths: [expoCliPath]
  });
};
const getDevMiddlewarePathFromReactNative = (projectRoot) => {
  const reactNativePackagePath = getReactNativePackagePath(projectRoot);
  const reactNativeCommunityCliPluginPath = require$4.resolve("@react-native/community-cli-plugin", {
    paths: [reactNativePackagePath]
  });
  return require$4.resolve("@react-native/dev-middleware", {
    paths: [reactNativeCommunityCliPluginPath]
  });
};
const getDevMiddlewarePath = (options) => {
  if (options.projectType) {
    if (options.projectType === "expo") {
      logger.debug(
        "User declared this is an Expo project, resolving @react-native/dev-middleware from Expo package."
      );
      const expoDevMiddlewarePath = getDevMiddlewarePathFromExpo(options.projectRoot);
      if (!expoDevMiddlewarePath) {
        throw new Error(
          "User declared this is an Expo project, but @react-native/dev-middleware was not found. Either this is not an Expo project or it's a bug in Rozenite."
        );
      }
      return expoDevMiddlewarePath;
    }
    if (options.projectType === "react-native-cli") {
      logger.debug(
        "User declared this is a React Native project, resolving @react-native/dev-middleware from React Native package."
      );
      return getDevMiddlewarePathFromReactNative(options.projectRoot);
    }
    throw new Error(`Unknown project type: ${options.projectType}.`);
  }
  const hasExpoEnv = !!process.env.EXPO_DEV_SERVER_ORIGIN;
  const projectType = hasExpoEnv ? "expo" : getProjectType(options.projectRoot);
  if (projectType === "expo") {
    logger.debug(
      "Guessing that this is an Expo project, resolving @react-native/dev-middleware from Expo package."
    );
    const expoDevMiddlewarePath = getDevMiddlewarePathFromExpo(options.projectRoot);
    if (!expoDevMiddlewarePath) {
      throw new Error(
        "I guessed that this is an Expo project, but @react-native/dev-middleware was not found. That's unexpected and you should report this as a bug in Rozenite's issue tracker."
      );
    }
    return expoDevMiddlewarePath;
  }
  logger.debug(
    "This is most likely not an Expo project, resolving @react-native/dev-middleware from React Native package."
  );
  return getDevMiddlewarePathFromReactNative(options.projectRoot);
};
const requireDevMiddlewareInternal = (options, relativePath) => {
  return require$4(path.join(path.dirname(getDevMiddlewarePath(options)), relativePath));
};
const getReactNativeDebuggerFrontendPath = (options) => {
  const devMiddlewarePath = getDevMiddlewarePath(options);
  return require$4.resolve("@react-native/debugger-frontend", {
    paths: [devMiddlewarePath]
  });
};
const patchDevtoolsFrontendUrl = (options) => {
  const getDevToolsFrontendUrlModule = requireDevMiddlewareInternal(
    options,
    "utils/getDevToolsFrontendUrl"
  );
  const getDevToolsFrontendUrl = getDevToolsFrontendUrlModule.default;
  getDevToolsFrontendUrlModule.default = (experiments, webSocketDebuggerUrl, devServerUrl, runtimeOptions) => {
    const originalUrl = getDevToolsFrontendUrl(
      experiments,
      webSocketDebuggerUrl,
      devServerUrl,
      runtimeOptions
    );
    return originalUrl.replace("/debugger-frontend/", "/rozenite/");
  };
};
const updateCSP = (html, nonce) => {
  const cspRegex = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"[^>]*>/;
  const cspMatch = html.match(cspRegex);
  if (cspMatch) {
    const originalCSP = cspMatch[1];
    const updatedCSP = originalCSP.replace(
      /script-src\s+([^;]+)/,
      `script-src $1 'nonce-${nonce}'`
    );
    return html.replace(
      cspRegex,
      `<meta http-equiv="Content-Security-Policy" content="${updatedCSP}" />`
    );
  }
  throw new Error(
    "Content-Security-Policy not found. Report this as a bug in Rozenite's issue tracker."
  );
};
const appendScripts = (html, nonce, {
  installedPlugins,
  destroyOnDetachPlugins,
  pluginDisplay = "sidebar",
  runtimeVersion
}) => {
  const bodyTagRegex = /<body[^>]*>/;
  const bodyMatch = html.match(bodyTagRegex);
  const scriptContent = `
    <script type="module" src="./host.js"><\/script>
    <script nonce="${nonce}">
      var __ROZENITE__ = {
        installedPlugins: ${JSON.stringify(installedPlugins)},
        destroyOnDetachPlugins: ${JSON.stringify(destroyOnDetachPlugins)},
        pluginDisplay: ${JSON.stringify(pluginDisplay)},
        runtimeVersion: ${JSON.stringify(runtimeVersion)},
      };
    <\/script>
  `;
  if (!bodyMatch) {
    throw new Error("Body tag not found. Report this as a bug in Rozenite's issue tracker.");
  }
  const bodyTag = bodyMatch[0];
  const bodyIndex = html.indexOf(bodyTag);
  return html.substring(0, bodyIndex) + scriptContent + html.substring(bodyIndex);
};
const getEntryPointHTML = (rnDevToolsFrontendPath, options) => {
  const nonce = crypto.randomUUID();
  const originalEntryPoint = fs.readFileSync(
    path.join(rnDevToolsFrontendPath, "rn_fusebox.html"),
    "utf8"
  );
  return appendScripts(updateCSP(originalEntryPoint, nonce), nonce, options);
};
const DEFAULT_AGENT_TARGET_INTEGRATION = "react-native";
const createEmptyCapabilityProfile = (integration) => ({
  integration,
  domains: {}
});
const getToolCapability = (domain, toolName) => domain.tools?.[toolName];
const isToolSupported = (profile, domainId, toolName) => {
  const domain = profile.domains[domainId];
  if (!domain) {
    return true;
  }
  const tool = getToolCapability(domain, toolName);
  if (tool) {
    return tool.availability === "supported";
  }
  return domain.availability !== "unsupported";
};
const getUnsupportedToolReason = (profile, domainId, toolName) => {
  const domain = profile.domains[domainId];
  if (!domain) {
    return void 0;
  }
  return getToolCapability(domain, toolName)?.reason ?? domain.reason;
};
const getUnsupportedDomains = (profile) => {
  const entries = [];
  const defaultReason = `Not supported on ${profile.integration} targets.`;
  for (const [domainId, domain] of Object.entries(profile.domains)) {
    if (domain.availability === "unsupported") {
      entries.push({
        domain: domainId,
        reason: domain.reason ?? defaultReason,
        ...domain.fallback ? { fallback: domain.fallback } : {}
      });
      continue;
    }
    const unsupportedTools = Object.entries(domain.tools ?? {}).filter(([, tool]) => tool.availability === "unsupported").map(([name2, tool]) => ({ name: name2, ...tool.reason ? { reason: tool.reason } : {} })).sort((a, b) => a.name.localeCompare(b.name));
    if (unsupportedTools.length === 0) {
      continue;
    }
    entries.push({
      domain: domainId,
      tools: unsupportedTools,
      reason: domain.reason ?? defaultReason,
      ...domain.fallback ? { fallback: domain.fallback } : {}
    });
  }
  return entries.sort((a, b) => a.domain.localeCompare(b.domain));
};
const AGENT_PLUGIN_ID = "rozenite-agent";
const DEFAULT_AGENT_HOST = "127.0.0.1";
const DEFAULT_AGENT_PORT = 8081;
const AGENT_ROUTE_BASE = "/rozenite/agent";
const AGENT_INFO_ROUTE = `${AGENT_ROUTE_BASE}/info`;
const AGENT_TARGETS_ROUTE = `${AGENT_ROUTE_BASE}/targets`;
const AGENT_SESSIONS_ROUTE = `${AGENT_ROUTE_BASE}/sessions`;
const AGENT_SESSION_ROUTE_PATTERN = `${AGENT_SESSIONS_ROUTE}/:sessionId`;
const AGENT_SESSION_TOOLS_ROUTE_PATTERN = `${AGENT_SESSION_ROUTE_PATTERN}/tools`;
const AGENT_SESSION_CALL_TOOL_ROUTE_PATTERN = `${AGENT_SESSION_ROUTE_PATTERN}/call-tool`;
const AGENT_SESSION_TAP_ROUTE_PATTERN = `${AGENT_SESSION_ROUTE_PATTERN}/tap`;
const createTapEmitter = () => {
  const listeners = /* @__PURE__ */ new Set();
  return {
    emit: (direction, message) => {
      if (listeners.size === 0) {
        return;
      }
      const event = {
        direction,
        timestamp: Date.now(),
        pluginId: message.pluginId,
        type: message.type,
        payload: message.payload
      };
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
};
const isDevToolsPluginMessage = (value) => {
  return typeof value === "object" && value !== null && typeof value.pluginId === "string" && typeof value.type === "string" && "payload" in value;
};
const matchesTapFilter = (event, filter) => {
  if (filter.pluginId && event.pluginId !== filter.pluginId) {
    return false;
  }
  if (filter.type && event.type !== filter.type) {
    return false;
  }
  return true;
};
const getRequestHost = (req) => {
  const hostHeader = req.headers.host;
  if (typeof hostHeader === "string" && hostHeader.length > 0) {
    return hostHeader.split(":", 1)[0] || req.hostname || "localhost";
  }
  return req.hostname || "localhost";
};
const getRequestPort = (req) => {
  const hostHeader = req.headers.host;
  if (typeof hostHeader === "string") {
    const pieces = hostHeader.split(":");
    const maybePort = Number(pieces[pieces.length - 1]);
    if (Number.isInteger(maybePort) && maybePort > 0) {
      return maybePort;
    }
  }
  return req.socket.localPort || 8081;
};
const syncEndpoint = (manager, req) => {
  manager.syncEndpoint(getRequestHost(req), getRequestPort(req));
};
const sendResult = (res, result) => {
  const payload = {
    ok: true,
    result
  };
  res.json(payload);
};
const sendError = (res, error2) => {
  const status = error2 instanceof Error && /Unknown session|Unknown deviceId/.test(error2.message) ? 404 : 400;
  const payload = {
    ok: false,
    error: {
      message: error2 instanceof Error ? error2.message : String(error2)
    }
  };
  res.status(status).json(payload);
};
const getSessionId = (req) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    throw new Error("Missing sessionId route parameter");
  }
  return sessionId;
};
const getBodyRecord = (req) => {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body;
  }
  return {};
};
const createAgentRoutes = (manager) => {
  const router = express.Router();
  router.use(express.json());
  router.get(AGENT_INFO_ROUTE, (req, res) => {
    syncEndpoint(manager, req);
    try {
      sendResult(res, { info: manager.getInfo() });
    } catch (error2) {
      sendError(res, error2);
    }
  });
  router.get(AGENT_TARGETS_ROUTE, async (req, res) => {
    syncEndpoint(manager, req);
    try {
      const targets = await manager.listTargets();
      sendResult(res, { targets });
    } catch (error2) {
      sendError(res, error2);
    }
  });
  router.post(AGENT_SESSIONS_ROUTE, async (req, res) => {
    syncEndpoint(manager, req);
    try {
      const body = getBodyRecord(req);
      const result = await manager.createSession({
        ...typeof body.deviceId === "string" ? { deviceId: body.deviceId } : {},
        ...typeof body.cliVersion === "string" ? { cliVersion: body.cliVersion } : {}
      });
      sendResult(res, result);
    } catch (error2) {
      sendError(res, error2);
    }
  });
  router.get(AGENT_SESSIONS_ROUTE, (req, res) => {
    syncEndpoint(manager, req);
    try {
      sendResult(res, {
        sessions: manager.listSessions()
      });
    } catch (error2) {
      sendError(res, error2);
    }
  });
  router.get(AGENT_SESSION_ROUTE_PATTERN, (req, res) => {
    syncEndpoint(manager, req);
    try {
      sendResult(res, {
        session: manager.getSession(getSessionId(req))
      });
    } catch (error2) {
      sendError(res, error2);
    }
  });
  router.delete(AGENT_SESSION_ROUTE_PATTERN, async (req, res) => {
    syncEndpoint(manager, req);
    try {
      const result = await manager.stopSession(getSessionId(req));
      sendResult(res, result);
    } catch (error2) {
      sendError(res, error2);
    }
  });
  router.get(AGENT_SESSION_TOOLS_ROUTE_PATTERN, (req, res) => {
    syncEndpoint(manager, req);
    try {
      sendResult(res, manager.getSessionTools(getSessionId(req)));
    } catch (error2) {
      sendError(res, error2);
    }
  });
  router.post(AGENT_SESSION_CALL_TOOL_ROUTE_PATTERN, async (req, res) => {
    syncEndpoint(manager, req);
    try {
      const body = getBodyRecord(req);
      if (typeof body.toolName !== "string" || body.toolName.length === 0) {
        throw new Error('"toolName" is required');
      }
      const result = await manager.callSessionTool(getSessionId(req), body.toolName, body.args);
      sendResult(res, {
        result
      });
    } catch (error2) {
      sendError(res, error2);
    }
  });
  router.get(AGENT_SESSION_TAP_ROUTE_PATTERN, (req, res) => {
    syncEndpoint(manager, req);
    let sessionId;
    try {
      sessionId = getSessionId(req);
      manager.getSession(sessionId);
    } catch (error2) {
      sendError(res, error2);
      return;
    }
    const pluginId = typeof req.query.pluginId === "string" ? req.query.pluginId : void 0;
    const type2 = typeof req.query.type === "string" ? req.query.type : void 0;
    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const unsubscribe = manager.subscribeSessionTap(sessionId, (event) => {
      if (!matchesTapFilter(event, { pluginId, type: type2 })) {
        return;
      }
      res.write(`${JSON.stringify(event)}
`);
    });
    const cleanup = () => {
      unsubscribe();
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
  });
  router.post(AGENT_SESSION_TAP_ROUTE_PATTERN, async (req, res) => {
    syncEndpoint(manager, req);
    try {
      const body = getBodyRecord(req);
      if (typeof body.pluginId !== "string" || body.pluginId.length === 0) {
        throw new Error('"pluginId" is required');
      }
      if (typeof body.type !== "string" || body.type.length === 0) {
        throw new Error('"type" is required');
      }
      await manager.sendSessionTapMessage(getSessionId(req), {
        pluginId: body.pluginId,
        type: body.type,
        payload: body.payload
      });
      sendResult(res, { sent: true });
    } catch (error2) {
      sendError(res, error2);
    }
  });
  return router;
};
const getErrorDetails = (error2) => {
  if (!error2) {
    return null;
  }
  if (error2 instanceof AggregateError && error2.errors.length > 0) {
    return error2.errors.map((entry) => entry instanceof Error ? entry.message : String(entry)).join("; ");
  }
  return error2 instanceof Error ? error2.message : String(error2);
};
const requestJson = async (host, port, pathname) => {
  const url = new URL(`http://${host}:${port}${pathname}`);
  return await new Promise((resolve, reject) => {
    const req = node_http.request(url, { method: "GET" }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if ((res.statusCode || 0) >= 400) {
          reject(new Error(`Metro responded with status ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error2) {
          reject(error2);
        }
      });
    });
    req.once("error", reject);
    req.end();
  }).catch((error2) => {
    const details = getErrorDetails(error2);
    throw new Error(
      `Unable to reach Metro at http://${host}:${port}. Make sure Metro is running and reachable, then try again.${details ? ` Details: ${details}` : ""}`
    );
  });
};
const sortPages = (pages) => {
  return [...pages].sort((a, b) => {
    const scoreA = a.reactNative?.capabilities?.prefersFuseboxFrontend ? 1 : 0;
    const scoreB = b.reactNative?.capabilities?.prefersFuseboxFrontend ? 1 : 0;
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return a.id.localeCompare(b.id);
  });
};
const prefersFusebox = (page) => page.reactNative?.capabilities?.prefersFuseboxFrontend === true;
const extractPageId = (page) => {
  try {
    const url = new URL(page.webSocketDebuggerUrl);
    return url.searchParams.get("page") ?? page.id;
  } catch {
    return page.id;
  }
};
const selectDevicePages = (pages) => {
  const fuseboxPages = pages.filter(prefersFusebox);
  return sortPages(fuseboxPages.length > 0 ? fuseboxPages : pages);
};
const getMetroTargets = async (host, port, integration) => {
  const pages = await requestJson(host, port, "/json/list");
  const byDevice = /* @__PURE__ */ new Map();
  for (const page of pages) {
    const deviceId = page.reactNative?.logicalDeviceId;
    if (!deviceId) {
      continue;
    }
    const existing = byDevice.get(deviceId) || [];
    existing.push(page);
    byDevice.set(deviceId, existing);
  }
  return Array.from(byDevice.entries()).flatMap(
    ([deviceId, devicePages]) => selectDevicePages(devicePages).map(
      (page) => ({
        id: page.id,
        deviceId,
        name: page.deviceName || deviceId,
        appId: page.appId,
        pageId: extractPageId(page),
        title: page.title,
        description: page.description,
        webSocketDebuggerUrl: page.webSocketDebuggerUrl,
        integration
      })
    )
  ).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
};
const resolveMetroTarget = async (host, port, integration, requestedDeviceId) => {
  const targets = await getMetroTargets(host, port, integration);
  if (targets.length === 0) {
    throw new Error(
      "No connected device is available. Open React Native DevTools for a device and try again."
    );
  }
  if (requestedDeviceId) {
    const selected = targets.find((target) => target.id === requestedDeviceId) ?? targets.find((target) => target.deviceId === requestedDeviceId);
    if (!selected) {
      const validIds = targets.map((target) => target.id).join(", ");
      throw new Error(`Unknown deviceId "${requestedDeviceId}". Valid device IDs: ${validIds}`);
    }
    return selected;
  }
  const deviceIds = new Set(targets.map((target) => target.deviceId));
  if (deviceIds.size > 1) {
    throw new Error(
      "Multiple connected devices detected. Run `rozenite agent targets` and provide --deviceId <id>."
    );
  }
  return targets[0];
};
const waitForEvent = (stream, event) => {
  return new Promise((resolve, reject) => {
    stream.once(event, () => resolve());
    stream.once("error", reject);
  });
};
const sanitizePathSegment = (value) => {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "artifact";
};
const createTimestampPrefix = () => {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
};
const createFileName = (extension, nameHint) => {
  const safeExtension = extension.replace(/^\.+/, "") || "json";
  const safeHint = typeof nameHint === "string" && nameHint.trim().length > 0 ? `-${sanitizePathSegment(nameHint)}` : "";
  return `${createTimestampPrefix()}${safeHint}.${safeExtension}`;
};
const createAgentArtifacts = (projectRoot, sessionId) => {
  const sessionRoot = path.join(
    projectRoot,
    ".rozenite",
    "agent",
    "sessions",
    sanitizePathSegment(sessionId)
  );
  const createWriter = async (bucket, extension, nameHint) => {
    const bucketDir = path.join(sessionRoot, bucket);
    await fs.promises.mkdir(bucketDir, { recursive: true });
    const fileName = createFileName(extension, nameHint);
    const resolvedPath = path.join(bucketDir, fileName);
    const tempPath = `${resolvedPath}.tmp-${crypto.randomUUID()}`;
    const stream = fs.createWriteStream(tempPath, { encoding: "utf8" });
    let bytes = 0;
    let settled = false;
    await waitForEvent(stream, "open");
    const write = async (chunk) => {
      if (settled) {
        throw new Error("Artifact writer is already closed");
      }
      const chunkBytes = typeof chunk === "string" ? Buffer.byteLength(chunk, "utf8") : chunk.byteLength;
      await new Promise((resolve, reject) => {
        stream.write(chunk, (error2) => {
          if (error2) {
            reject(error2);
            return;
          }
          bytes += chunkBytes;
          resolve();
        });
      });
    };
    const finalize = async () => {
      if (settled) {
        throw new Error("Artifact writer is already closed");
      }
      settled = true;
      stream.end();
      await waitForEvent(stream, "finish");
      await fs.promises.rename(tempPath, resolvedPath);
      return {
        path: resolvedPath,
        relativePath: path.relative(projectRoot, resolvedPath),
        bytes,
        bucket,
        fileName
      };
    };
    const abort = async () => {
      if (settled) {
        return;
      }
      settled = true;
      stream.destroy();
      await fs.promises.rm(tempPath, { force: true });
    };
    return {
      path: resolvedPath,
      write,
      finalize,
      abort
    };
  };
  return {
    sessionRoot,
    createWriter
  };
};
const CDP_METHOD_NOT_FOUND = -32601;
class UnsupportedCdpMethodError extends Error {
  method;
  constructor(method, detail) {
    super(
      `The device does not implement "${method}"${detail ? ` (${detail})` : ""}. This target's runtime exposes a different CDP surface than React Native; run \`rozenite agent domains\` to see what this session supports.`
    );
    this.name = "UnsupportedCdpMethodError";
    this.method = method;
  }
}
class CdpCommandError extends Error {
  method;
  constructor(method, detail) {
    super(`"${method}" failed: ${detail}`);
    this.name = "CdpCommandError";
    this.method = method;
  }
}
class CdpEventTimeoutError extends Error {
  cdpEvent;
  constructor(cdpEvent, timeoutMs, hint) {
    super(
      `Timed out after ${timeoutMs}ms waiting for "${cdpEvent}" from the device.` + (hint ? ` ${hint}` : "")
    );
    this.name = "CdpEventTimeoutError";
    this.cdpEvent = cdpEvent;
  }
}
const getErrorDetail = (error2) => {
  if (error2 && typeof error2 === "object" && !Array.isArray(error2)) {
    const message = error2.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return JSON.stringify(error2);
};
const getErrorCode = (error2) => {
  if (error2 && typeof error2 === "object" && !Array.isArray(error2)) {
    const code = error2.code;
    return typeof code === "number" ? code : void 0;
  }
  return void 0;
};
const createCDPCommandError = (method, error2) => {
  const detail = getErrorDetail(error2);
  if (getErrorCode(error2) === CDP_METHOD_NOT_FOUND) {
    return new UnsupportedCdpMethodError(method, detail);
  }
  return new CdpCommandError(method, detail);
};
const HEAP_SAMPLING_REASON = "Lynx forwards HeapProfiler to the JS engine, and PrimJS implements only takeHeapSnapshot. It answers methods it does not know with an empty success, so sampling would appear to start and then collect nothing.";
const REACT_NATIVE_PROFILE = createEmptyCapabilityProfile("react-native");
const LYNX_PROFILE = {
  integration: "lynx",
  domains: {
    network: {
      availability: "unsupported",
      reason: 'Lynx registers no CDP Network domain, so every Network.* command returns "Not implemented" (-32601).',
      fallback: "@rozenite/network-activity-plugin"
    },
    react: {
      availability: "unsupported",
      reason: 'Lynx has no React DevTools backend, and @rozenite/lynx only initialises the "rozenite" dispatcher domain, so react-devtools messages are never delivered.'
    },
    performance: {
      availability: "unsupported",
      reason: "Lynx implements a Perfetto-based Tracing domain: it ignores Chrome trace categories and returns the result as an IO stream handle, never as Tracing.dataCollected events."
    },
    memory: {
      // The domain stays usable — heap snapshots work on Lynx, and they
      // are the reason to reach for this domain in the first place.
      availability: "degraded",
      tools: {
        takeHeapSnapshot: { availability: "supported" },
        startSampling: { availability: "unsupported", reason: HEAP_SAMPLING_REASON },
        stopSampling: { availability: "unsupported", reason: HEAP_SAMPLING_REASON }
      }
    }
    // `console` has no entry: PrimJS emits Runtime.consoleAPICalled and
    // Lynx's own Log agent emits Log.entryAdded, which is everything the
    // console domain passively captures.
  }
};
const resolveCapabilityProfile = (integration) => {
  switch (integration) {
    case "lynx":
      return LYNX_PROFILE;
    // A web target is a browser, and a browser backs Chrome's CDP
    // surface in full -- including the Network, Tracing and HeapProfiler
    // domains Lynx's native runtime does not. `lynx-web` therefore gets
    // the empty profile and NOT LYNX_PROFILE: those gaps are PrimJS's,
    // and PrimJS is not what runs there.
    case "react-native-web":
    case "lynx-web":
      return createEmptyCapabilityProfile(integration);
    case "react-native":
      return REACT_NATIVE_PROFILE;
  }
};
class UnsupportedToolError extends Error {
  constructor(profile, domainId, toolName) {
    const reason = getUnsupportedToolReason(profile, domainId, toolName);
    super(
      `Tool "${toolName}" is not supported on this ${profile.integration} target.` + (reason ? ` ${reason}` : "")
    );
    this.name = "UnsupportedToolError";
  }
}
const withCapabilityFilter = (service, profile) => {
  const declaredTools = service.getTools();
  const allowed = new Set(
    declaredTools.filter((tool) => isToolSupported(profile, service.domainId, tool.name)).map((tool) => tool.name)
  );
  if (allowed.size === declaredTools.length) {
    return service;
  }
  const declared = new Set(declaredTools.map((tool) => tool.name));
  return {
    ...service,
    getTools: () => service.getTools().filter((tool) => allowed.has(tool.name)),
    // A filtered tool is unreachable through `getTools`, but `callTool`
    // is also reachable by exact tool name from the call-tool route, so
    // it needs the same guard rather than trusting the listing.
    callTool: async (toolName, args) => {
      if (!declared.has(toolName)) {
        return void 0;
      }
      if (!allowed.has(toolName)) {
        throw new UnsupportedToolError(profile, service.domainId, toolName);
      }
      return service.callTool(toolName, args);
    }
  };
};
const createToolRegistry = () => {
  const tools = /* @__PURE__ */ new Map();
  const devices = /* @__PURE__ */ new Map();
  const registerDevice = (deviceId, deviceName, reactNativeVersion) => {
    devices.set(deviceId, {
      id: deviceId,
      name: deviceName,
      reactNativeVersion
    });
    if (!tools.has(deviceId)) {
      tools.set(deviceId, /* @__PURE__ */ new Map());
    }
  };
  const unregisterDevice = (deviceId) => {
    devices.delete(deviceId);
    tools.delete(deviceId);
  };
  const registerTools = (deviceId, incomingTools) => {
    let deviceTools = tools.get(deviceId);
    if (!deviceTools) {
      deviceTools = /* @__PURE__ */ new Map();
      tools.set(deviceId, deviceTools);
    }
    for (const tool of incomingTools) {
      deviceTools.set(tool.name, tool);
    }
  };
  const unregisterTools = (deviceId, toolNames) => {
    const deviceTools = tools.get(deviceId);
    if (!deviceTools) {
      return;
    }
    for (const toolName of toolNames) {
      deviceTools.delete(toolName);
    }
  };
  const getDevices = () => {
    return Array.from(devices.values());
  };
  const hasDevice = (deviceId) => {
    return devices.has(deviceId);
  };
  const getToolsForDevice = (deviceId) => {
    const deviceTools = tools.get(deviceId);
    if (!deviceTools) {
      return [];
    }
    return Array.from(deviceTools.values());
  };
  const getAllRegisteredTools = () => {
    const allTools = [];
    for (const [deviceId, deviceTools] of tools.entries()) {
      for (const tool of deviceTools.values()) {
        allTools.push({ tool, deviceId });
      }
    }
    return allTools;
  };
  const getCommonToolNames = (deviceIds) => {
    if (deviceIds.length === 0) {
      return [];
    }
    const firstDeviceTools = tools.get(deviceIds[0]);
    if (!firstDeviceTools || firstDeviceTools.size === 0) {
      return [];
    }
    const commonNames = new Set(firstDeviceTools.keys());
    for (const deviceId of deviceIds.slice(1)) {
      const deviceTools = tools.get(deviceId);
      if (!deviceTools || deviceTools.size === 0) {
        return [];
      }
      for (const name2 of Array.from(commonNames)) {
        if (!deviceTools.has(name2)) {
          commonNames.delete(name2);
        }
      }
    }
    return Array.from(commonNames);
  };
  const getAggregatedTools = () => {
    const availableDevices = getDevices();
    if (availableDevices.length === 0) {
      return [];
    }
    const commonToolNames = getCommonToolNames(availableDevices.map((device) => device.id));
    const toolsByName = /* @__PURE__ */ new Map();
    for (const toolName of commonToolNames) {
      const registeredTools = [];
      for (const device of availableDevices) {
        const tool = tools.get(device.id)?.get(toolName);
        if (tool) {
          registeredTools.push({ tool, deviceId: device.id });
        }
      }
      if (registeredTools.length === availableDevices.length) {
        toolsByName.set(toolName, registeredTools);
      }
    }
    const aggregatedTools = [];
    for (const registeredTools of toolsByName.values()) {
      const firstTool = registeredTools[0].tool;
      if (availableDevices.length <= 1 || registeredTools.length === 1) {
        aggregatedTools.push(firstTool);
        continue;
      }
      const deviceIds = registeredTools.map((rt) => rt.deviceId);
      const deviceNames = deviceIds.map((id) => devices.get(id)?.name || id).join(", ");
      const modifiedSchema = {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            description: `Target device ID. Available devices: ${deviceNames}`,
            enum: deviceIds
          },
          ...firstTool.inputSchema.properties || {}
        },
        required: ["deviceId", ...firstTool.inputSchema.required || []]
      };
      aggregatedTools.push({
        ...firstTool,
        inputSchema: modifiedSchema
      });
    }
    return aggregatedTools;
  };
  const findToolDevice = (toolName, deviceId) => {
    if (deviceId) {
      const deviceTools = tools.get(deviceId);
      if (deviceTools && deviceTools.has(toolName)) {
        return deviceId;
      }
      return null;
    }
    for (const [devId, deviceTools] of tools.entries()) {
      if (deviceTools.has(toolName)) {
        return devId;
      }
    }
    return null;
  };
  return {
    registerDevice,
    unregisterDevice,
    registerTools,
    unregisterTools,
    getDevices,
    hasDevice,
    getToolsForDevice,
    getAllRegisteredTools,
    getAggregatedTools,
    findToolDevice
  };
};
class CircularBuffer {
  capacity;
  #slots;
  /** Physical slot holding the oldest live entry. */
  #start = 0;
  /** Global index of the oldest live entry. */
  #first = 0;
  #size = 0;
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(
        `CircularBuffer capacity must be a positive integer, received ${capacity}`
      );
    }
    this.capacity = capacity;
    this.#slots = new Array(capacity).fill(null);
  }
  /** Number of entries currently held. */
  get size() {
    return this.#size;
  }
  /** Global index of the oldest live entry, i.e. how many entries have left the window. */
  get first() {
    return this.#first;
  }
  /** Global index the next append will receive. */
  get next() {
    return this.#first + this.#size;
  }
  /** Appends a value and returns the global index assigned to it. */
  append(value) {
    const index = this.next;
    this.#slots[(this.#start + this.#size) % this.capacity] = value;
    if (this.#size === this.capacity) {
      this.#start = (this.#start + 1) % this.capacity;
      this.#first += 1;
    } else {
      this.#size += 1;
    }
    return index;
  }
  /** Whether `index` currently sits inside the window. */
  has(index) {
    return Number.isInteger(index) && index >= this.#first && index < this.next;
  }
  /** Returns the entry at a global index, or `undefined` if it was never written or has been evicted. */
  at(index) {
    if (!this.has(index)) {
      return void 0;
    }
    return this.#slots[(this.#start + (index - this.#first)) % this.capacity];
  }
  /**
   * Walks live entries from `index` in the given direction, yielding
   * `[index, value]` pairs. The start is clamped into the window, so an index
   * pointing at an evicted entry resumes from the oldest live one. Consumers
   * are expected to stop early once they have what they need.
   */
  *from(index, order) {
    if (this.#size === 0 || !Number.isFinite(index)) {
      return;
    }
    const last = this.next - 1;
    if (order === "asc") {
      for (let i = Math.max(Math.ceil(index), this.#first); i <= last; i += 1) {
        yield [i, this.at(i)];
      }
      return;
    }
    for (let i = Math.min(Math.floor(index), last); i >= this.#first; i -= 1) {
      yield [i, this.at(i)];
    }
  }
  /** Drops every entry while keeping the index space monotonic. */
  clear() {
    this.#slots.fill(null);
    this.#first = this.next;
    this.#size = 0;
    this.#start = 0;
  }
}
const createCircularBufferSource = (input) => {
  const listFrom = (args) => {
    const { buffer } = input;
    if (buffer.size === 0) {
      return { items: [], hasMore: false };
    }
    const first = buffer.first;
    const last = buffer.next - 1;
    const hasCheckpoint = args.checkpoint !== void 0 && Number.isFinite(args.checkpoint);
    const staleCursor = hasCheckpoint && args.checkpoint < first - 1;
    let start;
    if (!hasCheckpoint || staleCursor) {
      start = args.order === "desc" ? last : first;
    } else {
      start = args.order === "desc" ? args.checkpoint - 1 : args.checkpoint + 1;
    }
    const matches = input.createPredicate(args.filters);
    const items = [];
    let lastIndex = -1;
    let hasMore = false;
    for (const [index, item] of buffer.from(start, args.order)) {
      if (!matches(item)) {
        continue;
      }
      if (items.length === args.limit) {
        hasMore = true;
        break;
      }
      items.push(item);
      lastIndex = index;
    }
    if (items.length === 0) {
      return { items: [], hasMore: false, ...staleCursor ? { staleCursor: true } : {} };
    }
    const nextCheckpoint = lastIndex;
    return {
      items,
      hasMore,
      ...hasMore ? { nextCheckpoint } : {},
      ...staleCursor ? { staleCursor: true } : {}
    };
  };
  return { listFrom };
};
class PaginationError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "PaginationError";
    this.code = code;
  }
}
const encodeCursor$1 = (position) => {
  return Buffer.from(String(position), "utf8").toString("base64url");
};
const decodeCursor$1 = (raw, field = "cursor") => {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const position = Number(decoded);
  if (decoded.trim().length === 0 || !Number.isSafeInteger(position) || position < 0) {
    throw new PaginationError(
      "PAGINATION_INVALID_CURSOR",
      field === "cursor" ? 'Invalid "cursor". Run the command again without cursor to restart pagination.' : `Invalid "${field}". Pass a cursor from an item or page in a previous response.`
    );
  }
  return position;
};
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const normalizePageLimit = (rawLimit) => {
  if (rawLimit === void 0) {
    return DEFAULT_PAGE_LIMIT;
  }
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`"limit" must be an integer between 1 and ${MAX_PAGE_LIMIT}`);
  }
  return Math.min(parsed, MAX_PAGE_LIMIT);
};
const paginateSource = (source, input) => {
  const limit = normalizePageLimit(input.request.limit);
  const order = input.request.order === "asc" ? "asc" : "desc";
  let checkpoint = input.request.seedCheckpoint;
  if (typeof input.request.cursor === "string" && input.request.cursor.trim().length > 0) {
    checkpoint = decodeCursor$1(input.request.cursor);
  }
  let result = source.listFrom({
    checkpoint,
    order,
    limit,
    filters: input.request.filters
  });
  let reset = false;
  if (result.staleCursor) {
    result = source.listFrom({
      checkpoint: void 0,
      order,
      limit,
      filters: input.request.filters
    });
    reset = true;
  }
  const nextCursor = result.hasMore && result.nextCheckpoint !== void 0 ? encodeCursor$1(result.nextCheckpoint) : void 0;
  return {
    items: result.items,
    page: {
      limit,
      hasMore: result.hasMore,
      ...nextCursor ? { nextCursor } : {},
      ...reset ? { reset: true } : {}
    }
  };
};
const DEFAULT_CONSOLE_BUFFER_CAPACITY = 5e3;
const SEQ_OFFSET = 1;
const normalizeTimestamp = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Date.now();
  }
  if (numeric > 0 && numeric < 1e12) {
    return Math.round(numeric * 1e3);
  }
  return Math.round(numeric);
};
const normalizeLevel = (value) => {
  if (value === "error") {
    return "error";
  }
  if (value === "warning") {
    return "warning";
  }
  if (value === "verbose") {
    return "verbose";
  }
  return "info";
};
const normalizeSource = (value) => {
  if (value === "exception") {
    return "exception";
  }
  if (value === "log") {
    return "log";
  }
  return "console";
};
const createConsoleFilterPredicate = (filters) => {
  const hasLevels = Array.isArray(filters.levels) && filters.levels.length > 0;
  const levelSet = hasLevels ? new Set(filters.levels) : null;
  const text = typeof filters.text === "string" ? filters.text.trim().toLowerCase() : "";
  const since = typeof filters.since === "number" && Number.isFinite(filters.since) ? Math.round(filters.since) : void 0;
  const { beforePosition, afterPosition } = filters;
  return (entry) => {
    if (levelSet && !levelSet.has(entry.level)) {
      return false;
    }
    if (text && !entry.text.toLowerCase().includes(text)) {
      return false;
    }
    if (since !== void 0 && entry.timestamp < since) {
      return false;
    }
    const position = entry.seq - SEQ_OFFSET;
    if (beforePosition !== void 0 && position >= beforePosition) {
      return false;
    }
    if (afterPosition !== void 0 && position <= afterPosition) {
      return false;
    }
    return true;
  };
};
const getRecord$7 = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return null;
};
const createConsoleLogStore = (capacity = DEFAULT_CONSOLE_BUFFER_CAPACITY) => {
  const normalizedCapacity = Number.isFinite(capacity) && capacity > 0 ? Math.round(capacity) : DEFAULT_CONSOLE_BUFFER_CAPACITY;
  const states = /* @__PURE__ */ new Map();
  const getOrCreateState = (deviceId) => {
    const existing = states.get(deviceId);
    if (existing) {
      return existing;
    }
    const buffer = new CircularBuffer(normalizedCapacity);
    const created = {
      buffer,
      source: createCircularBufferSource({
        buffer,
        createPredicate: createConsoleFilterPredicate
      }),
      droppedCount: 0
    };
    states.set(deviceId, created);
    return created;
  };
  const registerDevice = (deviceId) => {
    getOrCreateState(deviceId);
  };
  const unregisterDevice = (deviceId) => {
    states.delete(deviceId);
  };
  const clear = (deviceId) => {
    const state = getOrCreateState(deviceId);
    const cleared = state.buffer.size;
    state.buffer.clear();
    return { cleared };
  };
  const append = (deviceId, input) => {
    const state = getOrCreateState(deviceId);
    const entry = {
      seq: state.buffer.next + SEQ_OFFSET,
      timestamp: normalizeTimestamp(input.timestamp),
      level: normalizeLevel(input.level),
      text: input.text,
      source: normalizeSource(input.source),
      ...input.context ? { context: input.context } : {}
    };
    const evictedBefore = state.buffer.first;
    state.buffer.append(entry);
    state.droppedCount += state.buffer.first - evictedBefore;
  };
  const readAnchor = (value, field) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return void 0;
    }
    return decodeCursor$1(value, field);
  };
  const getMessages = (deviceId, rawRequest) => {
    const request = getRecord$7(rawRequest) || {};
    const state = getOrCreateState(deviceId);
    const beforePosition = readAnchor(request.before, "before");
    const afterPosition = readAnchor(request.after, "after");
    const filters = {
      ...Array.isArray(request.levels) ? {
        levels: request.levels.filter(
          (level) => level === "verbose" || level === "info" || level === "warning" || level === "error"
        )
      } : {},
      ...typeof request.text === "string" ? { text: request.text } : {},
      ...typeof request.since === "number" && Number.isFinite(request.since) ? { since: Math.round(request.since) } : {},
      ...beforePosition !== void 0 ? { beforePosition } : {},
      ...afterPosition !== void 0 ? { afterPosition } : {}
    };
    const order = request.order === "asc" ? "asc" : "desc";
    const seedCheckpoint = order === "desc" ? beforePosition : afterPosition;
    const paged = paginateSource(state.source, {
      request: {
        limit: request.limit,
        cursor: request.cursor,
        order: request.order,
        filters,
        ...seedCheckpoint !== void 0 ? { seedCheckpoint } : {}
      }
    });
    return {
      ...paged,
      items: paged.items.map((entry) => ({
        ...entry,
        // Identical in shape and meaning to the cursor `next` hands back, so an
        // item's cursor can resume a listing just as a page cursor can bound one.
        cursor: encodeCursor$1(entry.seq - SEQ_OFFSET)
      })),
      meta: {
        droppedCount: state.droppedCount,
        lastSeq: state.buffer.next,
        bufferSize: state.buffer.size
      }
    };
  };
  return {
    registerDevice,
    unregisterDevice,
    append,
    clear,
    getMessages
  };
};
const cursorPagination$1 = (config) => ({
  kind: "cursor",
  fields: config.fields,
  ...config.defaultFields ? { defaultFields: config.defaultFields } : {}
});
const CONSOLE_TOOL_NAMES = {
  getMessages: "getMessages",
  clearMessages: "clearMessages"
};
const CONSOLE_TOOLS = [
  {
    name: CONSOLE_TOOL_NAMES.clearMessages,
    description: "Clear buffered console logs for this device.",
    readOnly: false,
    destructive: true,
    idempotent: true,
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: CONSOLE_TOOL_NAMES.getMessages,
    description: "Read buffered console logs with cursor-based pagination.",
    readOnly: true,
    destructive: false,
    idempotent: true,
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Page size. Default 50, max 200."
        },
        cursor: {
          type: "string",
          description: "Opaque cursor returned by the previous page."
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: 'Sort order. Default "desc".'
        },
        levels: {
          type: "array",
          items: {
            type: "string",
            enum: ["verbose", "info", "warning", "error"]
          },
          description: "Optional level filter."
        },
        text: {
          type: "string",
          description: "Optional substring filter."
        },
        since: {
          type: "number",
          description: "Optional minimum timestamp in milliseconds."
        },
        before: {
          type: "string",
          description: `Anchor cursor from an item's "cursor" field. Returns only entries older than it, so pairing it with order "desc" reads the entries leading up to that item.`
        },
        after: {
          type: "string",
          description: `Anchor cursor from an item's "cursor" field. Returns only entries newer than it, so pairing it with order "asc" reads the entries that followed it.`
        }
      }
    },
    pagination: cursorPagination$1({
      fields: ["seq", "timestamp", "level", "source", "text", "context", "cursor"],
      // Drop the heaviest column from the default projection; it remains
      // available via --fields/--verbose.
      defaultFields: ["seq", "timestamp", "level", "source", "text"]
    })
  }
];
const createAgentMessageHandler = () => {
  const registry = createToolRegistry();
  const consoleLogStore = createConsoleLogStore();
  const deviceConnections = /* @__PURE__ */ new Map();
  const pendingCalls = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  const isConsoleTool = (toolName) => {
    return CONSOLE_TOOLS.some((tool) => tool.name === toolName);
  };
  const attachDeviceSchema = (tools, deviceIds, deviceNames) => {
    if (deviceIds.length <= 1) {
      return tools;
    }
    return tools.map((tool) => ({
      ...tool,
      inputSchema: {
        type: "object",
        properties: {
          deviceId: {
            type: "string",
            enum: deviceIds,
            description: `Target device ID. Available devices: ${deviceNames.join(", ")}`
          },
          ...tool.inputSchema.properties || {}
        },
        required: ["deviceId", ...tool.inputSchema.required || []]
      }
    }));
  };
  const getConsoleTools = (deviceId) => {
    const devices = registry.getDevices();
    if (devices.length === 0) {
      return [];
    }
    if (deviceId) {
      return CONSOLE_TOOLS;
    }
    const deviceIds = devices.map((device) => device.id);
    const deviceNames = devices.map((device) => device.name || device.id);
    return attachDeviceSchema(CONSOLE_TOOLS, deviceIds, deviceNames);
  };
  const resolveDeviceForLocalTool = (requestedDeviceId) => {
    const devices = registry.getDevices();
    if (devices.length === 0) {
      throw new Error("No connected device is available for local Agent tools.");
    }
    if (requestedDeviceId) {
      if (!registry.hasDevice(requestedDeviceId)) {
        throw new Error(`Unknown deviceId "${requestedDeviceId}"`);
      }
      return requestedDeviceId;
    }
    return devices[0].id;
  };
  const callConsoleTool = async (toolName, args, requestedDeviceId) => {
    const deviceId = resolveDeviceForLocalTool(requestedDeviceId);
    switch (toolName) {
      case CONSOLE_TOOL_NAMES.clearMessages:
        return consoleLogStore.clear(deviceId);
      case CONSOLE_TOOL_NAMES.getMessages:
        return consoleLogStore.getMessages(deviceId, args);
      default:
        throw new Error(`Tool "${toolName}" not found`);
    }
  };
  const notifyToolsChanged = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const onToolsChanged = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const connectDevice = (deviceId, deviceName, sender, metadata) => {
    registry.registerDevice(deviceId, deviceName, metadata?.reactNativeVersion);
    consoleLogStore.registerDevice(deviceId);
    deviceConnections.set(deviceId, sender);
    notifyToolsChanged();
  };
  const disconnectDevice = (deviceId) => {
    for (const [callId, pending] of pendingCalls.entries()) {
      if (pending.deviceId !== deviceId) {
        continue;
      }
      pendingCalls.delete(callId);
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`Device "${deviceId}" disconnected`));
    }
    registry.unregisterDevice(deviceId);
    consoleLogStore.unregisterDevice(deviceId);
    deviceConnections.delete(deviceId);
    notifyToolsChanged();
  };
  const handleDeviceMessage = (deviceId, message) => {
    if (message.pluginId !== AGENT_PLUGIN_ID) {
      return;
    }
    switch (message.type) {
      case "register-tool": {
        const payload = message.payload;
        registry.registerTools(deviceId, payload.tools);
        notifyToolsChanged();
        break;
      }
      case "unregister-tool": {
        const payload = message.payload;
        registry.unregisterTools(deviceId, payload.toolNames);
        notifyToolsChanged();
        break;
      }
      case "tool-result": {
        const payload = message.payload;
        const pending = pendingCalls.get(payload.callId);
        if (!pending) {
          break;
        }
        pendingCalls.delete(payload.callId);
        clearTimeout(pending.timeoutId);
        if (payload.success) {
          pending.resolve(payload.result);
        } else {
          pending.reject(new Error(payload.error || "Tool call failed"));
        }
        break;
      }
    }
  };
  const getTools = (deviceId) => {
    if (deviceId) {
      return [...registry.getToolsForDevice(deviceId), ...getConsoleTools(deviceId)];
    }
    return [...registry.getAggregatedTools(), ...getConsoleTools()];
  };
  const getRegisteredPluginTools = (deviceId) => {
    return registry.getToolsForDevice(deviceId);
  };
  const getDevices = () => {
    return registry.getDevices();
  };
  const callTool = async (toolName, args) => {
    let deviceId;
    let toolArgs = args;
    if (args && typeof args === "object" && "deviceId" in args && typeof args.deviceId === "string") {
      deviceId = args.deviceId;
      const rest = { ...args };
      delete rest.deviceId;
      toolArgs = rest;
    }
    if (isConsoleTool(toolName)) {
      return callConsoleTool(toolName, toolArgs, deviceId);
    }
    const targetDeviceId = registry.findToolDevice(toolName, deviceId);
    if (!targetDeviceId) {
      throw new Error(`Tool "${toolName}" not found${deviceId ? ` on device "${deviceId}"` : ""}`);
    }
    const sender = deviceConnections.get(targetDeviceId);
    if (!sender) {
      throw new Error(
        `Tool "${toolName}" is available for device "${targetDeviceId}", but there is no active DevTools connection to that device. Open React Native DevTools for the app and try again.`
      );
    }
    const callId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const message = {
      pluginId: AGENT_PLUGIN_ID,
      type: "tool-call",
      payload: {
        callId,
        toolName,
        arguments: toolArgs
      }
    };
    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const pending = pendingCalls.get(callId);
        if (pending) {
          pendingCalls.delete(callId);
          pending.reject(new Error("Tool call timeout"));
        }
      }, 3e4);
      pendingCalls.set(callId, {
        deviceId: targetDeviceId,
        resolve,
        reject,
        timeoutId
      });
    });
    try {
      sender.sendMessage(message);
    } catch (error2) {
      const pending = pendingCalls.get(callId);
      if (pending) {
        pendingCalls.delete(callId);
        clearTimeout(pending.timeoutId);
      }
      throw error2;
    }
    return await promise;
  };
  return {
    onToolsChanged,
    connectDevice,
    disconnectDevice,
    handleDeviceMessage,
    getTools,
    getRegisteredPluginTools,
    getDevices,
    callTool,
    captureConsoleMessage: (deviceId, message) => {
      consoleLogStore.append(deviceId, message);
    }
  };
};
const MAX_VALUE_LENGTH = 1024;
const MAX_ARG_LENGTH = 2048;
const MAX_TEXT_LENGTH = 8192;
const MAX_PREVIEW_PROPERTIES = 10;
const getRecord$6 = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return null;
};
const getString$2 = (value) => {
  return typeof value === "string" ? value : void 0;
};
const truncate = (value, max) => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}…(+${value.length - max} chars)`;
};
const stringifyValue = (value) => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};
const renderPreviewProperty = (property, isArray) => {
  const record = getRecord$6(property) || {};
  const raw = truncate(getString$2(record.value) ?? "", MAX_VALUE_LENGTH);
  const rendered = record.type === "string" ? JSON.stringify(raw) : raw;
  return isArray ? rendered : `${getString$2(record.name) ?? "?"}: ${rendered}`;
};
const renderPreview = (preview) => {
  const properties = Array.isArray(preview.properties) ? preview.properties : [];
  if (properties.length === 0) {
    return null;
  }
  const isArray = preview.subtype === "array";
  const rendered = properties.slice(0, MAX_PREVIEW_PROPERTIES).map((property) => renderPreviewProperty(property, isArray));
  if (preview.overflow === true || properties.length > MAX_PREVIEW_PROPERTIES) {
    rendered.push("…");
  }
  return isArray ? `[${rendered.join(", ")}]` : `{${rendered.join(", ")}}`;
};
const previewRemoteObject = (value) => {
  const record = getRecord$6(value);
  if (!record) {
    if (value === null || value === void 0) {
      return String(value);
    }
    return truncate(stringifyValue(value), MAX_ARG_LENGTH);
  }
  if (record.value !== void 0) {
    return truncate(stringifyValue(record.value), MAX_ARG_LENGTH);
  }
  const description2 = getString$2(record.description);
  if (record.subtype === "error" && description2) {
    return truncate(description2, MAX_ARG_LENGTH);
  }
  const preview = getRecord$6(record.preview);
  if (preview) {
    const rendered = renderPreview(preview);
    if (rendered) {
      return truncate(rendered, MAX_ARG_LENGTH);
    }
  }
  if (description2) {
    return truncate(description2, MAX_ARG_LENGTH);
  }
  const className = getString$2(record.className);
  const subtype = getString$2(record.subtype);
  return [className, subtype].filter(Boolean).join(":") || "[Object]";
};
const mapLevelFromConsoleType = (type2) => {
  if (!type2) {
    return "info";
  }
  if (type2 === "error" || type2 === "assert") {
    return "error";
  }
  if (type2 === "warning" || type2 === "warn") {
    return "warning";
  }
  if (type2 === "debug" || type2 === "trace") {
    return "verbose";
  }
  return "info";
};
const extractConsoleMessage = (message) => {
  const record = getRecord$6(message);
  if (!record) {
    return null;
  }
  const method = getString$2(record.method);
  const params = getRecord$6(record.params);
  if (method === "Runtime.consoleAPICalled" && params) {
    const type2 = getString$2(params.type);
    const args = Array.isArray(params.args) ? params.args : [];
    const rendered = args.map((arg) => previewRemoteObject(arg)).join(" ").trim();
    const text = truncate(rendered, MAX_TEXT_LENGTH) || `[${type2 || "log"}]`;
    return {
      timestamp: typeof params.timestamp === "number" ? params.timestamp : Date.now(),
      level: mapLevelFromConsoleType(type2),
      text,
      source: "console",
      context: {
        ...type2 ? { type: type2 } : {}
      }
    };
  }
  if (method === "Runtime.exceptionThrown" && params) {
    const details = getRecord$6(params.exceptionDetails);
    const text = getString$2(details?.text) || getString$2(getRecord$6(details?.exception)?.description) || "Unhandled exception";
    return {
      timestamp: typeof params.timestamp === "number" ? params.timestamp : Date.now(),
      level: "error",
      text: truncate(text, MAX_TEXT_LENGTH),
      source: "exception"
    };
  }
  if (method === "Log.entryAdded" && params) {
    const entry = getRecord$6(params.entry);
    if (!entry) {
      return null;
    }
    const text = getString$2(entry.text) || "Log.entryAdded";
    const level = mapLevelFromConsoleType(getString$2(entry.level));
    return {
      timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
      level,
      text: truncate(text, MAX_TEXT_LENGTH),
      source: "log",
      context: {
        ...getString$2(entry.source) ? { source: getString$2(entry.source) } : {},
        ...getString$2(entry.url) ? { url: getString$2(entry.url) } : {}
      }
    };
  }
  return null;
};
const getRecord$5 = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return null;
};
const getString$1 = (value) => {
  return typeof value === "string" ? value : void 0;
};
const parseRozeniteBindingPayload = (message) => {
  const record = getRecord$5(message);
  if (!record || record.method !== "Runtime.bindingCalled") {
    return null;
  }
  const params = getRecord$5(record.params);
  const rawPayload = getString$1(params?.payload);
  if (!rawPayload) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawPayload);
    const payload = getRecord$5(parsed);
    const domain = getString$1(payload?.domain);
    if (!domain) {
      return null;
    }
    return {
      domain,
      message: payload?.message
    };
  } catch {
    return null;
  }
};
const normalizeForHash = (value) => {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, normalizeForHash(nested)]);
    return Object.fromEntries(entries);
  }
  return String(value);
};
const hashFilters = (filters) => {
  const normalized = normalizeForHash(filters ?? {});
  const raw = JSON.stringify(normalized);
  return crypto.createHash("sha1").update(raw).digest("hex");
};
const DEFAULT_REACT_PAGE_LIMIT = 20;
const MAX_REACT_PAGE_LIMIT = 100;
const encodeCursor = (payload) => {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
};
const decodeCursor = (raw) => {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const payload = JSON.parse(decoded);
    if (payload.v !== 1 || typeof payload.tool !== "string" || typeof payload.deviceId !== "string" || !Number.isInteger(payload.offset) || payload.offset < 0 || typeof payload.filtersHash !== "string") {
      throw new Error("Invalid cursor payload");
    }
    return payload;
  } catch {
    throw new Error(
      'Invalid "cursor". Run the command again without cursor to restart pagination.'
    );
  }
};
const normalizeReactLimit = (value) => {
  if (value === void 0) {
    return DEFAULT_REACT_PAGE_LIMIT;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`"limit" must be an integer between 1 and ${MAX_REACT_PAGE_LIMIT}`);
  }
  return Math.min(parsed, MAX_REACT_PAGE_LIMIT);
};
const paginateReactList = (input) => {
  const limit = normalizeReactLimit(input.limit);
  const filtersHash = hashFilters(input.filters);
  let offset = 0;
  if (typeof input.cursor === "string" && input.cursor.trim().length > 0) {
    const decoded = decodeCursor(input.cursor);
    if (decoded.deviceId !== input.deviceId || decoded.tool !== input.tool || decoded.filtersHash !== filtersHash) {
      throw new Error(
        "Cursor does not match this request context. Restart pagination without cursor."
      );
    }
    offset = decoded.offset;
  }
  const totalCount = input.items.length;
  const start = Math.max(0, Math.min(offset, totalCount));
  const end = Math.min(start + limit, totalCount);
  const hasMore = end < totalCount;
  return {
    items: input.items.slice(start, end),
    totalCount,
    page: {
      limit,
      hasMore,
      ...hasMore ? {
        nextCursor: encodeCursor({
          v: 1,
          tool: input.tool,
          deviceId: input.deviceId,
          offset: end,
          filtersHash
        })
      } : {}
    }
  };
};
const TREE_OPERATION_ADD = 1;
const TREE_OPERATION_REMOVE = 2;
const TREE_OPERATION_REORDER_CHILDREN = 3;
const TREE_OPERATION_UPDATE_TREE_BASE_DURATION = 4;
const TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS = 5;
const TREE_OPERATION_REMOVE_ROOT = 6;
const TREE_OPERATION_SET_SUBTREE_MODE = 7;
const SUSPENSE_TREE_OPERATION_ADD = 8;
const SUSPENSE_TREE_OPERATION_REMOVE = 9;
const SUSPENSE_TREE_OPERATION_REORDER_CHILDREN = 10;
const SUSPENSE_TREE_OPERATION_RESIZE = 11;
const SUSPENSE_TREE_OPERATION_SUSPENDERS = 12;
const TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE = 13;
const ELEMENT_TYPE_CLASS = 1;
const ELEMENT_TYPE_FUNCTION = 5;
const ELEMENT_TYPE_FORWARD_REF = 6;
const ELEMENT_TYPE_HOST = 7;
const ELEMENT_TYPE_MEMO = 8;
const ELEMENT_TYPE_PROFILER = 10;
const ELEMENT_TYPE_ROOT = 11;
const ELEMENT_TYPE_SUSPENSE = 12;
const isInteger$1 = (value) => {
  return Number.isInteger(value);
};
const readStringTable = (operations, startIndex) => {
  let index = startIndex;
  const table = [null];
  if (!isInteger$1(operations[index]) || operations[index] < 0) {
    return null;
  }
  const stringTableSize = operations[index++];
  const stringTableEnd = index + stringTableSize;
  if (stringTableEnd > operations.length) {
    return null;
  }
  while (index < stringTableEnd) {
    const length = operations[index++];
    if (!isInteger$1(length) || length < 0) {
      return null;
    }
    if (index + length > stringTableEnd) {
      return null;
    }
    let value = "";
    for (let j = 0; j < length; j += 1) {
      value += String.fromCodePoint(operations[index++]);
    }
    table.push(value);
  }
  return {
    table,
    nextIndex: index
  };
};
const readStringById = (table, id) => {
  if (!isInteger$1(id) || id <= 0 || id >= table.length) {
    return null;
  }
  return table[id] ?? null;
};
const skipRects = (operations, startIndex) => {
  if (!isInteger$1(operations[startIndex])) {
    return null;
  }
  const count = operations[startIndex];
  if (count === -1) {
    return startIndex + 1;
  }
  if (count < 0) {
    return null;
  }
  const nextIndex = startIndex + 1 + count * 4;
  if (nextIndex > operations.length) {
    return null;
  }
  return nextIndex;
};
const parseTreeOperations = (operations, options) => {
  if (!Array.isArray(operations) || operations.length < 3) {
    return null;
  }
  const numericOps = operations.filter((value) => Number.isFinite(value)).map((value) => Number(value));
  if (numericOps.length !== operations.length) {
    return null;
  }
  const rendererId = isInteger$1(numericOps[0]) ? numericOps[0] : 0;
  const stringTable = readStringTable(numericOps, 2);
  if (!stringTable) {
    return null;
  }
  const parsed = {
    rendererId,
    added: [],
    removedNodeIds: [],
    removedRootIds: [],
    reorderedChildren: [],
    errorsOrWarnings: [],
    usesExtendedAddFormat: options?.extendedAddFormat === true
  };
  let index = stringTable.nextIndex;
  while (index < numericOps.length) {
    const operation = numericOps[index];
    switch (operation) {
      case TREE_OPERATION_ADD: {
        if (index + 2 >= numericOps.length) {
          return parsed;
        }
        const nodeId = numericOps[index + 1];
        const elementType = numericOps[index + 2];
        index += 3;
        if (!isInteger$1(nodeId) || !isInteger$1(elementType)) {
          return parsed;
        }
        if (elementType === ELEMENT_TYPE_ROOT) {
          if (index + 4 > numericOps.length) {
            return parsed;
          }
          index += 4;
          parsed.added.push({
            nodeId,
            rendererId,
            elementType,
            displayName: "Root",
            isRoot: true
          });
          break;
        }
        if (index + 4 > numericOps.length) {
          return parsed;
        }
        const parentId = numericOps[index++];
        index += 1;
        const displayNameStringId = numericOps[index++];
        const keyStringId = numericOps[index++];
        if (parsed.usesExtendedAddFormat) {
          if (index >= numericOps.length) {
            return parsed;
          }
          index += 1;
        }
        const parsedParentId = isInteger$1(parentId) && parentId !== 0 ? parentId : void 0;
        const rawDisplayName = readStringById(stringTable.table, displayNameStringId);
        const displayName = rawDisplayName || (elementType === ELEMENT_TYPE_HOST ? "HostComponent" : `Node ${nodeId}`);
        const key = readStringById(stringTable.table, keyStringId) ?? void 0;
        parsed.added.push({
          nodeId,
          parentId: parsedParentId,
          rendererId,
          elementType,
          displayName,
          ...key !== void 0 ? { key } : {},
          isRoot: parsedParentId === void 0
        });
        break;
      }
      case TREE_OPERATION_REMOVE: {
        if (index + 1 >= numericOps.length || !isInteger$1(numericOps[index + 1])) {
          return parsed;
        }
        const count = numericOps[index + 1];
        if (count < 0 || index + 2 + count > numericOps.length) {
          return parsed;
        }
        for (let j = 0; j < count; j += 1) {
          const removedId = numericOps[index + 2 + j];
          if (isInteger$1(removedId)) {
            parsed.removedNodeIds.push(removedId);
          }
        }
        index += 2 + count;
        break;
      }
      case TREE_OPERATION_REORDER_CHILDREN: {
        if (index + 2 >= numericOps.length) {
          return parsed;
        }
        const nodeId = numericOps[index + 1];
        const childCount = numericOps[index + 2];
        if (!isInteger$1(nodeId) || !isInteger$1(childCount) || childCount < 0) {
          return parsed;
        }
        if (index + 3 + childCount > numericOps.length) {
          return parsed;
        }
        const childIds = [];
        for (let j = 0; j < childCount; j += 1) {
          const childId = numericOps[index + 3 + j];
          if (isInteger$1(childId)) {
            childIds.push(childId);
          }
        }
        parsed.reorderedChildren.push({
          nodeId,
          childIds
        });
        index += 3 + childCount;
        break;
      }
      case TREE_OPERATION_REMOVE_ROOT: {
        const rootId = numericOps[index + 1];
        if (isInteger$1(rootId)) {
          parsed.removedRootIds.push(rootId);
        }
        index += 2;
        break;
      }
      case TREE_OPERATION_UPDATE_TREE_BASE_DURATION:
        index += 3;
        break;
      case TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS: {
        const nodeId = numericOps[index + 1];
        const errorCount = numericOps[index + 2];
        const warningCount = numericOps[index + 3];
        if (isInteger$1(nodeId) && isInteger$1(errorCount) && errorCount >= 0 && isInteger$1(warningCount) && warningCount >= 0) {
          parsed.errorsOrWarnings.push({ nodeId, errorCount, warningCount });
        }
        index += 4;
        break;
      }
      case TREE_OPERATION_SET_SUBTREE_MODE:
        index += 3;
        break;
      case SUSPENSE_TREE_OPERATION_ADD: {
        parsed.usesExtendedAddFormat = true;
        const nextIndex = skipRects(numericOps, index + 5);
        if (nextIndex === null) {
          return parsed;
        }
        index = nextIndex;
        break;
      }
      case SUSPENSE_TREE_OPERATION_REMOVE: {
        parsed.usesExtendedAddFormat = true;
        const count = numericOps[index + 1];
        if (!isInteger$1(count) || count < 0) {
          return parsed;
        }
        index += 2 + count;
        break;
      }
      case SUSPENSE_TREE_OPERATION_REORDER_CHILDREN: {
        parsed.usesExtendedAddFormat = true;
        const childCount = numericOps[index + 2];
        if (!isInteger$1(childCount) || childCount < 0) {
          return parsed;
        }
        index += 3 + childCount;
        break;
      }
      case SUSPENSE_TREE_OPERATION_RESIZE: {
        parsed.usesExtendedAddFormat = true;
        const nextIndex = skipRects(numericOps, index + 2);
        if (nextIndex === null) {
          return parsed;
        }
        index = nextIndex;
        break;
      }
      case SUSPENSE_TREE_OPERATION_SUSPENDERS: {
        parsed.usesExtendedAddFormat = true;
        const count = numericOps[index + 1];
        if (!isInteger$1(count) || count < 0) {
          return parsed;
        }
        index += 2 + count * 4;
        break;
      }
      case TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE:
        parsed.usesExtendedAddFormat = true;
        index += 2;
        break;
      default:
        index += 1;
        break;
    }
  }
  return parsed;
};
const toReactElementTypeLabel = (elementType) => {
  switch (elementType) {
    case ELEMENT_TYPE_CLASS:
      return "class";
    case ELEMENT_TYPE_FUNCTION:
      return "function";
    case ELEMENT_TYPE_FORWARD_REF:
      return "forward-ref";
    case ELEMENT_TYPE_HOST:
      return "host";
    case ELEMENT_TYPE_MEMO:
      return "memo";
    case ELEMENT_TYPE_PROFILER:
      return "profiler";
    case ELEMENT_TYPE_ROOT:
      return "root";
    case ELEMENT_TYPE_SUSPENSE:
      return "suspense";
    default:
      return "unknown";
  }
};
const isInteger = (value) => {
  return Number.isInteger(value);
};
const createComponentTreeStore = () => {
  const nodesById = /* @__PURE__ */ new Map();
  const rootIds = /* @__PURE__ */ new Set();
  let usesExtendedAddFormat = false;
  const removeNode = (nodeId) => {
    const node = nodesById.get(nodeId);
    if (!node) {
      return;
    }
    for (const childId of [...node.childIds]) {
      removeNode(childId);
    }
    if (node.parentId !== void 0) {
      const parent = nodesById.get(node.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((id) => id !== nodeId);
      }
    }
    rootIds.delete(nodeId);
    nodesById.delete(nodeId);
  };
  const addNode = (node) => {
    removeNode(node.nodeId);
    const record = {
      nodeId: node.nodeId,
      displayName: node.displayName,
      elementType: toReactElementTypeLabel(node.elementType),
      ...node.key !== void 0 ? { key: node.key } : {},
      ...node.parentId !== void 0 ? { parentId: node.parentId } : {},
      ...isInteger(node.rendererId) ? { rendererId: node.rendererId } : {},
      childIds: [],
      // A remount is an add, and React re-reports counts against the new fiber,
      // so starting from zero is what keeps a fixed component from looking broken.
      errorCount: 0,
      warningCount: 0
    };
    nodesById.set(record.nodeId, record);
    if (node.isRoot || node.parentId === void 0) {
      rootIds.add(record.nodeId);
      return;
    }
    const parent = nodesById.get(node.parentId);
    if (parent) {
      if (!parent.childIds.includes(record.nodeId)) {
        parent.childIds.push(record.nodeId);
      }
      parent.childIds = parent.childIds.filter((id, index, ids) => ids.indexOf(id) === index);
    }
  };
  const reorderChildren = (nodeId, childIds) => {
    const node = nodesById.get(nodeId);
    if (!node) {
      return;
    }
    node.childIds = childIds.filter((id, index, ids) => ids.indexOf(id) === index).filter((id) => nodesById.has(id));
    for (const childId of node.childIds) {
      const child = nodesById.get(childId);
      if (child) {
        child.parentId = nodeId;
        rootIds.delete(childId);
      }
    }
  };
  const updateErrorsOrWarnings = (nodeId, errorCount, warningCount) => {
    const node = nodesById.get(nodeId);
    if (!node) {
      return;
    }
    node.errorCount = errorCount;
    node.warningCount = warningCount;
  };
  const toSnapshot = () => {
    const sortedRoots = [...rootIds].filter((rootId) => nodesById.has(rootId)).sort((a, b) => a - b);
    const visited = /* @__PURE__ */ new Set();
    const queue = [...sortedRoots];
    const nodes = [];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (visited.has(nodeId)) {
        continue;
      }
      visited.add(nodeId);
      const node = nodesById.get(nodeId);
      if (!node) {
        continue;
      }
      const childIds = node.childIds.filter((childId) => nodesById.has(childId));
      nodes.push({
        nodeId: node.nodeId,
        displayName: node.displayName,
        elementType: node.elementType,
        ...node.key !== void 0 ? { key: node.key } : {},
        ...node.parentId !== void 0 ? { parentId: node.parentId } : {},
        ...node.rendererId !== void 0 ? { rendererId: node.rendererId } : {},
        ...node.errorCount > 0 ? { errorCount: node.errorCount } : {},
        ...node.warningCount > 0 ? { warningCount: node.warningCount } : {},
        childIds
      });
      for (const childId of childIds) {
        queue.push(childId);
      }
    }
    return {
      roots: sortedRoots,
      nodes
    };
  };
  const ingestOperations = (operations) => {
    const parsed = parseTreeOperations(operations, {
      extendedAddFormat: usesExtendedAddFormat
    });
    if (!parsed) {
      return null;
    }
    usesExtendedAddFormat = parsed.usesExtendedAddFormat;
    for (const nodeId of parsed.removedNodeIds) {
      removeNode(nodeId);
    }
    for (const rootId of parsed.removedRootIds) {
      removeNode(rootId);
    }
    for (const node of parsed.added) {
      addNode(node);
    }
    for (const reorder of parsed.reorderedChildren) {
      reorderChildren(reorder.nodeId, reorder.childIds);
    }
    for (const update of parsed.errorsOrWarnings) {
      updateErrorsOrWarnings(update.nodeId, update.errorCount, update.warningCount);
    }
    return toSnapshot();
  };
  return {
    ingestOperations,
    getRootsCount: () => {
      return [...rootIds].filter((rootId) => nodesById.has(rootId)).length;
    }
  };
};
const getRecord$4 = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
};
const normalizeDehydratedValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeDehydratedValue(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value;
  if (record.data !== void 0 && record.cleaned === void 0 && record.name === void 0 && record.props === void 0 && record.state === void 0) {
    return normalizeDehydratedValue(record.data);
  }
  const entries = Object.entries(record);
  return Object.fromEntries(
    entries.map(([key, nested]) => [key, normalizeDehydratedValue(nested)])
  );
};
const createInspectionStore = () => {
  const byNodeId = /* @__PURE__ */ new Map();
  const ingestInspectedElement = (payload) => {
    const source = getRecord$4(payload);
    if (!source || !Number.isInteger(source.id)) {
      return null;
    }
    const nodeId = Number(source.id);
    if (source.type === "not-found") {
      byNodeId.delete(nodeId);
      return { nodeId, exists: false };
    }
    const value = getRecord$4(source.value) || source;
    const next = {
      ...value.props !== void 0 ? { props: normalizeDehydratedValue(value.props) } : {},
      ...value.state !== void 0 ? { state: normalizeDehydratedValue(value.state) } : {},
      ...value.hooks !== void 0 ? { hooks: normalizeDehydratedValue(value.hooks) } : {}
    };
    if (next.props === void 0 && next.state === void 0 && next.hooks === void 0) {
      byNodeId.delete(nodeId);
      return { nodeId, exists: false };
    }
    byNodeId.set(nodeId, next);
    return {
      nodeId,
      exists: true
    };
  };
  return {
    ingestInspectedElement,
    get: (nodeId) => {
      return byNodeId.get(nodeId);
    }
  };
};
const createEmptySession = () => ({
  phase: "idle",
  dataForRoots: /* @__PURE__ */ new Map(),
  rendererIdByRootId: /* @__PURE__ */ new Map(),
  participatingRendererIds: /* @__PURE__ */ new Set(),
  pendingRendererIds: /* @__PURE__ */ new Set(),
  receivedRendererIds: /* @__PURE__ */ new Set(),
  conflictingRootIds: /* @__PURE__ */ new Set()
});
const getRecord$3 = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
};
const getNumberMap = (value) => {
  const result = /* @__PURE__ */ new Map();
  if (value instanceof Map) {
    for (const [key, nested] of value.entries()) {
      const parsedKey = Number(key);
      const parsedValue = Number(nested);
      if (Number.isFinite(parsedKey) && Number.isFinite(parsedValue)) {
        result.set(parsedKey, parsedValue);
      }
    }
    return result;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && Array.isArray(value[0])) {
      for (const entry of value) {
        if (!Array.isArray(entry) || entry.length < 2) {
          continue;
        }
        const parsedKey = Number(entry[0]);
        const parsedValue = Number(entry[1]);
        if (Number.isFinite(parsedKey) && Number.isFinite(parsedValue)) {
          result.set(parsedKey, parsedValue);
        }
      }
      return result;
    }
    for (let index = 0; index + 1 < value.length; index += 2) {
      const parsedKey = Number(value[index]);
      const parsedValue = Number(value[index + 1]);
      if (Number.isFinite(parsedKey) && Number.isFinite(parsedValue)) {
        result.set(parsedKey, parsedValue);
      }
    }
    return result;
  }
  const record = getRecord$3(value);
  if (!record) {
    return result;
  }
  for (const [key, nested] of Object.entries(record)) {
    const parsedKey = Number(key);
    const parsedValue = Number(nested);
    if (Number.isFinite(parsedKey) && Number.isFinite(parsedValue)) {
      result.set(parsedKey, parsedValue);
    }
  }
  return result;
};
const getChangeDescriptions = (value) => {
  if (value === null || value === void 0) {
    return null;
  }
  const result = /* @__PURE__ */ new Map();
  const assign = (key, nested) => {
    const parsedKey = Number(key);
    if (!Number.isFinite(parsedKey)) {
      return;
    }
    const record2 = getRecord$3(nested) || {};
    const contextValue = record2.context;
    const context = contextValue === true ? true : Array.isArray(contextValue) ? contextValue.filter((entry) => typeof entry === "string") : null;
    result.set(parsedKey, {
      context,
      didHooksChange: record2.didHooksChange === true,
      isFirstMount: record2.isFirstMount === true,
      props: Array.isArray(record2.props) ? record2.props.filter((entry) => typeof entry === "string") : null,
      state: Array.isArray(record2.state) ? record2.state.filter((entry) => typeof entry === "string") : null
    });
  };
  if (value instanceof Map) {
    for (const [key, nested] of value.entries()) {
      assign(key, nested);
    }
    return result;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      assign(entry[0], entry[1]);
    }
    return result;
  }
  const record = getRecord$3(value);
  if (record) {
    for (const [key, nested] of Object.entries(record)) {
      assign(key, nested);
    }
  }
  return result;
};
const normalizeCommitData = (value) => {
  const record = getRecord$3(value);
  if (!record) {
    return null;
  }
  return {
    changeDescriptions: getChangeDescriptions(record.changeDescriptions),
    duration: Number(record.duration) || 0,
    effectDuration: record.effectDuration === null || record.effectDuration === void 0 ? null : Number(record.effectDuration),
    fiberActualDurations: getNumberMap(record.fiberActualDurations),
    fiberSelfDurations: getNumberMap(record.fiberSelfDurations),
    passiveEffectDuration: record.passiveEffectDuration === null || record.passiveEffectDuration === void 0 ? null : Number(record.passiveEffectDuration),
    priorityLevel: typeof record.priorityLevel === "string" ? record.priorityLevel : null,
    timestamp: Number(record.timestamp) || 0,
    updaters: Array.isArray(record.updaters) ? record.updaters.map((entry) => {
      const parsed = getRecord$3(entry);
      if (!parsed || !Number.isInteger(parsed.id)) {
        return null;
      }
      return {
        id: Number(parsed.id)
      };
    }).filter((entry) => entry !== null) : null
  };
};
const normalizeRootData = (value) => {
  const record = getRecord$3(value) || {};
  const commitData = [];
  if (Array.isArray(record.commitData)) {
    for (const commit of record.commitData) {
      const normalized = normalizeCommitData(commit);
      if (normalized) {
        commitData.push(normalized);
      }
    }
  }
  return {
    commitData
  };
};
const normalizeDataForRoots = (payload) => {
  const result = /* @__PURE__ */ new Map();
  const payloadRecord = getRecord$3(payload);
  if (!payloadRecord) {
    return result;
  }
  const rawDataForRoots = payloadRecord.dataForRoots;
  if (rawDataForRoots instanceof Map) {
    for (const [rootId, rootData] of rawDataForRoots.entries()) {
      const parsedRootId = Number(rootId);
      if (!Number.isFinite(parsedRootId)) {
        continue;
      }
      result.set(parsedRootId, normalizeRootData(rootData));
    }
    return result;
  }
  if (Array.isArray(rawDataForRoots)) {
    rawDataForRoots.forEach((entry, index) => {
      const record = getRecord$3(entry);
      if (!record) {
        return;
      }
      const rootIdValue = record.rootID ?? record.rootId ?? record.id ?? index;
      const rootId = Number(rootIdValue);
      if (!Number.isFinite(rootId)) {
        return;
      }
      result.set(rootId, normalizeRootData(record));
    });
    return result;
  }
  const rootsRecord = getRecord$3(rawDataForRoots);
  if (rootsRecord) {
    for (const [rootIdKey, rootData] of Object.entries(rootsRecord)) {
      const rootId = Number(rootIdKey);
      if (!Number.isFinite(rootId)) {
        continue;
      }
      result.set(rootId, normalizeRootData(rootData));
    }
    return result;
  }
  if (Array.isArray(payloadRecord.commitData)) {
    result.set(0, normalizeRootData(payloadRecord));
  }
  return result;
};
const normalizeProfilingDataEvent = (payload) => {
  const record = getRecord$3(payload);
  const rawRendererId = record?.rendererID ?? record?.rendererId;
  const rendererId = Number.isInteger(rawRendererId) ? Number(rawRendererId) : void 0;
  return {
    ...rendererId !== void 0 ? { rendererId } : {},
    dataForRoots: normalizeDataForRoots(payload)
  };
};
const mergeRootProfilingData = (target, rendererIdByRootId, conflictingRootIds, rendererId, update) => {
  for (const [rootId, rootData] of update.entries()) {
    const existingRendererId = rendererIdByRootId.get(rootId);
    if (existingRendererId !== void 0 && existingRendererId !== rendererId) {
      conflictingRootIds.add(rootId);
      continue;
    }
    const existing = target.get(rootId);
    if (!existing) {
      rendererIdByRootId.set(rootId, rendererId);
      target.set(rootId, {
        commitData: [...rootData.commitData]
      });
      continue;
    }
    existing.commitData.push(...rootData.commitData);
  }
};
const createProfilingStore = () => {
  const state = {
    supportsProfiling: true,
    supportsReloadAndProfile: false,
    knownRendererIds: /* @__PURE__ */ new Set(),
    session: createEmptySession()
  };
  const resetSession = () => {
    state.session = createEmptySession();
  };
  const updatePhaseAfterData = () => {
    if (state.session.pendingRendererIds.size > 0) {
      state.session.phase = "processing";
      return;
    }
    state.session.phase = state.session.dataForRoots.size > 0 ? "complete" : "idle";
  };
  return {
    registerRenderer: (rendererId) => {
      if (!Number.isInteger(rendererId)) {
        return;
      }
      state.knownRendererIds.add(Number(rendererId));
    },
    requestProfilingStart: () => {
      resetSession();
      state.session.phase = "profiling";
    },
    requestProfilingStop: () => {
      if (state.session.phase === "profiling") {
        state.session.phase = "stopping";
      }
    },
    noteProfilingOperation: (rendererId) => {
      if (!Number.isInteger(rendererId)) {
        return;
      }
      if (state.session.phase !== "profiling" && state.session.phase !== "stopping") {
        return;
      }
      state.session.participatingRendererIds.add(Number(rendererId));
    },
    ingestProfilingStatus: (update) => {
      if (typeof update.supportsProfiling === "boolean") {
        state.supportsProfiling = update.supportsProfiling;
      }
      if (typeof update.supportsReloadAndProfile === "boolean") {
        state.supportsReloadAndProfile = update.supportsReloadAndProfile;
      }
      if (typeof update.isProfiling !== "boolean") {
        return { requestProfilingDataForRendererIds: [] };
      }
      if (update.isProfiling) {
        if (state.session.phase !== "profiling") {
          resetSession();
          state.session.phase = "profiling";
        }
        return { requestProfilingDataForRendererIds: [] };
      }
      if (state.session.phase !== "profiling" && state.session.phase !== "stopping") {
        if (state.session.pendingRendererIds.size === 0) {
          updatePhaseAfterData();
        }
        return { requestProfilingDataForRendererIds: [] };
      }
      const rendererIds = [...state.session.participatingRendererIds].filter((rendererId) => state.knownRendererIds.has(rendererId)).sort((a, b) => a - b);
      state.session.pendingRendererIds = new Set(rendererIds);
      state.session.phase = rendererIds.length > 0 ? "processing" : "complete";
      return {
        requestProfilingDataForRendererIds: rendererIds
      };
    },
    ingestProfilingData: (event) => {
      const { rendererId, dataForRoots } = event;
      if (rendererId === void 0 || !state.session.pendingRendererIds.has(rendererId)) {
        return false;
      }
      state.session.pendingRendererIds.delete(rendererId);
      state.session.receivedRendererIds.add(rendererId);
      if (dataForRoots.size > 0) {
        mergeRootProfilingData(
          state.session.dataForRoots,
          state.session.rendererIdByRootId,
          state.session.conflictingRootIds,
          rendererId,
          dataForRoots
        );
      }
      updatePhaseAfterData();
      return true;
    },
    setReloadAndProfileSupported: (isSupported) => {
      state.supportsReloadAndProfile = isSupported;
    },
    getStatus: (rootsCount) => {
      return {
        supportsProfiling: state.supportsProfiling,
        supportsReloadAndProfile: state.supportsReloadAndProfile,
        isProfilingStarted: state.session.phase === "profiling",
        isProcessingData: state.session.phase === "stopping" || state.session.phase === "processing",
        hasProfilingData: state.session.dataForRoots.size > 0,
        rootsWithData: state.session.dataForRoots.size,
        rootsCount
      };
    },
    getSnapshot: () => {
      return {
        phase: state.session.phase,
        dataForRoots: state.session.dataForRoots,
        rendererIdByRootId: state.session.rendererIdByRootId,
        participatingRendererIds: state.session.participatingRendererIds,
        pendingRendererIds: state.session.pendingRendererIds,
        receivedRendererIds: state.session.receivedRendererIds,
        conflictingRootIds: state.session.conflictingRootIds
      };
    },
    getCommitData: (rootId, commitIndex) => {
      if (state.session.conflictingRootIds.has(rootId)) {
        throw new Error(
          `Commit data for root "${rootId}" is ambiguous across multiple React renderers.`
        );
      }
      const rootData = state.session.dataForRoots.get(rootId);
      const commitData = rootData?.commitData[commitIndex];
      if (!commitData) {
        throw new Error(
          `Could not find commit data for root "${rootId}" and commit "${commitIndex}"`
        );
      }
      return commitData;
    }
  };
};
const getRecord$2 = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
};
const getRendererIdFromOperations = (payload) => {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  const candidate = Number(payload[0]);
  if (!Number.isInteger(candidate) || candidate <= 0) {
    return null;
  }
  return candidate;
};
const normalizeProfilingStatusEvent = (payload) => {
  if (typeof payload === "boolean") {
    return {
      isProfiling: payload
    };
  }
  const record = getRecord$2(payload);
  if (!record) {
    return {};
  }
  const update = {};
  if (typeof record.isProfiling === "boolean") {
    update.isProfiling = record.isProfiling;
  }
  if (typeof record.isProfilingStarted === "boolean") {
    update.isProfiling = record.isProfilingStarted;
  }
  if (typeof record.supportsProfiling === "boolean") {
    update.supportsProfiling = record.supportsProfiling;
  }
  if (typeof record.supportsReloadAndProfile === "boolean") {
    update.supportsReloadAndProfile = record.supportsReloadAndProfile;
  }
  if (typeof record.recordChangeDescriptions === "boolean") {
    update.supportsProfiling = update.supportsProfiling || record.recordChangeDescriptions;
  }
  return update;
};
const normalizeReloadAndProfileSupport = (payload) => {
  if (typeof payload === "boolean") {
    return payload;
  }
  const record = getRecord$2(payload);
  if (!record) {
    return null;
  }
  if (typeof record.isSupported === "boolean") {
    return record.isSupported;
  }
  return null;
};
const createReactDevToolsBridge = async (options) => {
  const componentTreeStore = createComponentTreeStore();
  const inspectionStore = createInspectionStore();
  const profilingStore = createProfilingStore();
  const send = (event, payload) => {
    options?.sendMessage?.({ event, payload });
  };
  return {
    ingest(message) {
      switch (message.event) {
        case "operations": {
          const rendererId = getRendererIdFromOperations(message.payload);
          if (rendererId !== null) {
            profilingStore.registerRenderer(rendererId);
            profilingStore.noteProfilingOperation(rendererId);
          }
          return componentTreeStore.ingestOperations(message.payload);
        }
        case "inspectedElement":
          inspectionStore.ingestInspectedElement(message.payload);
          return null;
        case "profilingStatus":
          profilingStore.ingestProfilingStatus(normalizeProfilingStatusEvent(message.payload)).requestProfilingDataForRendererIds.forEach((rendererId) => {
            send("getProfilingData", { rendererID: rendererId });
          });
          return null;
        case "profilingData":
          profilingStore.ingestProfilingData(normalizeProfilingDataEvent(message.payload));
          return null;
        case "renderer":
        case "rendererAttached": {
          const payload = getRecord$2(message.payload);
          const rendererId = payload?.id;
          if (Number.isInteger(rendererId)) {
            profilingStore.registerRenderer(Number(rendererId));
          }
          return null;
        }
        case "isReloadAndProfileSupportedByBackend": {
          const isSupported = normalizeReloadAndProfileSupport(message.payload);
          if (isSupported !== null) {
            profilingStore.setReloadAndProfileSupported(isSupported);
          }
          return null;
        }
        default:
          return null;
      }
    },
    send,
    startProfiling() {
      profilingStore.requestProfilingStart();
      send("startProfiling", {
        recordChangeDescriptions: true,
        recordTimeline: false
      });
    },
    stopProfiling() {
      profilingStore.requestProfilingStop();
      send("stopProfiling", void 0);
    },
    reloadAndProfile() {
      const status = profilingStore.getStatus(componentTreeStore.getRootsCount());
      if (status.supportsReloadAndProfile !== true) {
        throw new Error("Reload-and-profile is not supported by this React DevTools connection.");
      }
      profilingStore.requestProfilingStart();
      send("reloadAndProfile", {
        recordChangeDescriptions: true,
        recordTimeline: false
      });
    },
    getProfilingStatus() {
      return profilingStore.getStatus(componentTreeStore.getRootsCount());
    },
    getProfilingDataSnapshot() {
      return profilingStore.getSnapshot();
    },
    getCommitData(rootId, commitIndex) {
      return profilingStore.getCommitData(rootId, commitIndex);
    }
  };
};
const GET_TREE_TOOL_NAME = "getTree";
const SEARCH_TOOL_NAME = "searchNodes";
const GET_CHILDREN_TOOL_NAME = "getChildren";
const DEFAULT_COMPONENT_VALUE_DEPTH = 4;
const MAX_COMPONENT_VALUE_DEPTH = 8;
const DEFAULT_MAX_VALUE_LENGTH = 512;
const MAX_MAX_VALUE_LENGTH = 8192;
const GET_PROPS_TOOL_NAME = "getProps";
const GET_STATE_TOOL_NAME = "getState";
const GET_HOOKS_TOOL_NAME = "getHooks";
const GET_RENDER_DATA_TOOL_NAME = "getRenderData";
const GET_ERRORS_TOOL_NAME = "getErrors";
const GET_PROFILE_TIMELINE_TOOL_NAME = "getProfileTimeline";
const GET_COMPONENT_RENDERS_TOOL_NAME = "getComponentRenders";
const INSPECT_WAIT_TIMEOUT_MS = 2e3;
const DEFAULT_STOP_PROFILING_WAIT_MS = 3e3;
const MAX_STOP_PROFILING_WAIT_MS = 1e4;
const DEFAULT_SLOW_RENDER_THRESHOLD_MS = 16;
const TOP_SLOW_COMMITS_LIMIT = 10;
const MAX_PENDING_REACT_MESSAGES = 1e3;
const toChangeTypeHints = (changeDescription) => {
  const hints = [];
  if (changeDescription.isFirstMount) {
    hints.push("mount");
  }
  if (Array.isArray(changeDescription.props) && changeDescription.props.length > 0) {
    hints.push("props");
  }
  if (Array.isArray(changeDescription.state) && changeDescription.state.length > 0) {
    hints.push("state");
  }
  if (changeDescription.context === true || Array.isArray(changeDescription.context) && changeDescription.context.length > 0) {
    hints.push("context");
  }
  if (changeDescription.didHooksChange) {
    hints.push("hooks");
  }
  return hints;
};
const toChangedKeys = (changeDescription) => {
  if (!changeDescription) {
    return void 0;
  }
  const changed = {};
  if (changeDescription.isFirstMount) {
    changed.isFirstMount = true;
  }
  if (Array.isArray(changeDescription.props) && changeDescription.props.length > 0) {
    changed.props = changeDescription.props;
  }
  if (Array.isArray(changeDescription.state) && changeDescription.state.length > 0) {
    changed.state = changeDescription.state;
  }
  if (changeDescription.context === true) {
    changed.context = true;
  } else if (Array.isArray(changeDescription.context) && changeDescription.context.length > 0) {
    changed.context = changeDescription.context;
  }
  if (changeDescription.didHooksChange) {
    changed.hooks = true;
  }
  return Object.keys(changed).length > 0 ? changed : void 0;
};
const getRecord$1 = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
};
const normalizeDepth = (value) => {
  if (value === void 0) {
    return void 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error('"depth" must be a non-negative integer');
  }
  return parsed;
};
const normalizeMatch = (value) => {
  if (value === "name-or-key") {
    return "name-or-key";
  }
  return "name";
};
const normalizeNonNegativeInteger = (value, name2) => {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`"${name2}" must be a non-negative integer`);
  }
  return Number(value);
};
const normalizeSlowRenderThreshold = (value) => {
  if (value === void 0) {
    return DEFAULT_SLOW_RENDER_THRESHOLD_MS;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('"slowRenderThresholdMs" must be a non-negative number');
  }
  return parsed;
};
const normalizeWaitForDataMs = (value) => {
  if (value === void 0) {
    return DEFAULT_STOP_PROFILING_WAIT_MS;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`"waitForDataMs" must be a number between 0 and ${MAX_STOP_PROFILING_WAIT_MS}`);
  }
  return Math.min(parsed, MAX_STOP_PROFILING_WAIT_MS);
};
const normalizeRenderDataSort = (value) => {
  if (value === "name-asc") {
    return "name-asc";
  }
  return "duration-desc";
};
const COMPONENT_RENDERS_SORTS = [
  "total-duration-desc",
  "avg-duration-desc",
  "max-duration-desc",
  "render-count-desc",
  "name-asc"
];
const normalizeComponentRendersSort = (value) => {
  if (value === void 0) {
    return "total-duration-desc";
  }
  const match = COMPONENT_RENDERS_SORTS.find((sort) => sort === value);
  if (!match) {
    throw new Error(`"sort" must be one of ${COMPONENT_RENDERS_SORTS.join(", ")}`);
  }
  return match;
};
const compareComponentRenders = (sort) => {
  const tieBreak = (a, b) => a.rootId - b.rootId || a.fiberId - b.fiberId;
  switch (sort) {
    case "avg-duration-desc":
      return (a, b) => b.avgDurationMs - a.avgDurationMs || tieBreak(a, b);
    case "max-duration-desc":
      return (a, b) => b.maxDurationMs - a.maxDurationMs || tieBreak(a, b);
    case "render-count-desc":
      return (a, b) => b.renderCount - a.renderCount || tieBreak(a, b);
    case "name-asc":
      return (a, b) => a.sortName.localeCompare(b.sortName) || tieBreak(a, b);
    case "total-duration-desc":
      return (a, b) => b.totalDurationMs - a.totalDurationMs || tieBreak(a, b);
  }
};
const roundMs = (value) => Math.round(value * 1e3) / 1e3;
const mergeStringSets = (current, incoming) => {
  if (incoming.length === 0) {
    return current ?? [];
  }
  return [.../* @__PURE__ */ new Set([...current ?? [], ...incoming])];
};
const mergeChangedKeys = (current, incoming) => {
  if (!incoming) {
    return current;
  }
  if (!current) {
    return incoming;
  }
  const merged = {};
  if (current.isFirstMount || incoming.isFirstMount) {
    merged.isFirstMount = true;
  }
  if (current.props || incoming.props) {
    merged.props = mergeStringSets(current.props, incoming.props ?? []);
  }
  if (current.state || incoming.state) {
    merged.state = mergeStringSets(current.state, incoming.state ?? []);
  }
  if (Array.isArray(current.context) || Array.isArray(incoming.context)) {
    merged.context = mergeStringSets(
      Array.isArray(current.context) ? current.context : void 0,
      Array.isArray(incoming.context) ? incoming.context : []
    );
  } else if (current.context === true || incoming.context === true) {
    merged.context = true;
  }
  if (current.hooks || incoming.hooks) {
    merged.hooks = true;
  }
  return merged;
};
const normalizeComponentSections = (value) => {
  const defaultSections = ["props", "state", "hooks"];
  if (value === void 0) {
    return defaultSections;
  }
  if (!Array.isArray(value)) {
    throw new Error('"include" must be an array of props, state, or hooks');
  }
  const sections = [];
  for (const entry of value) {
    if (entry !== "props" && entry !== "state" && entry !== "hooks") {
      throw new Error('"include" must contain only props, state, or hooks');
    }
    if (!sections.includes(entry)) {
      sections.push(entry);
    }
  }
  if (sections.length === 0) {
    throw new Error('"include" must contain at least one section');
  }
  return sections;
};
const normalizeComponentValueDepth = (value) => {
  if (value === void 0) {
    return DEFAULT_COMPONENT_VALUE_DEPTH;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`"valueDepth" must be an integer between 0 and ${MAX_COMPONENT_VALUE_DEPTH}`);
  }
  return Math.min(parsed, MAX_COMPONENT_VALUE_DEPTH);
};
const normalizeMaxValueLength = (value) => {
  if (value === void 0) {
    return DEFAULT_MAX_VALUE_LENGTH;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`"maxValueLength" must be an integer between 1 and ${MAX_MAX_VALUE_LENGTH}`);
  }
  return Math.min(parsed, MAX_MAX_VALUE_LENGTH);
};
const normalizeBoolean = (value, name2) => {
  if (value === void 0) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new Error(`"${name2}" must be a boolean`);
  }
  return value;
};
const delay = async (ms) => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
const isSignificantHost = (node) => {
  return node.key !== void 0 || node.displayName.includes("-") || (node.errorCount ?? 0) > 0 || (node.warningCount ?? 0) > 0;
};
const isHiddenHost = (node, noHost) => {
  return noHost && node.elementType === "host" && !isSignificantHost(node);
};
const ensureNodeSummary = (node) => {
  return {
    nodeId: node.nodeId,
    label: "@c?",
    displayName: node.displayName,
    elementType: node.elementType,
    ...node.key !== void 0 ? { key: node.key } : {},
    childCount: node.childIds.length,
    ...node.parentId !== void 0 ? { parentId: node.parentId } : {},
    ...(node.errorCount ?? 0) > 0 ? { errorCount: node.errorCount } : {},
    ...(node.warningCount ?? 0) > 0 ? { warningCount: node.warningCount } : {}
  };
};
const ensureNodeSummaryForState = (state, node, visible) => {
  const { parentId: realParentId, ...summary } = ensureNodeSummary(node);
  const parentId = visible ? visible.parentId : realParentId;
  const parentLabel = parentId !== void 0 ? state.labelByNodeId.get(parentId) : void 0;
  return {
    ...summary,
    label: state.labelByNodeId.get(node.nodeId) ?? "@c?",
    ...visible ? { childCount: visible.childIds.length } : {},
    ...parentId !== void 0 ? { parentId } : {},
    ...parentLabel !== void 0 ? { parentLabel } : {}
  };
};
const ensureTreeNode = (state, node, options) => {
  return {
    ...ensureNodeSummaryForState(state, node, {
      ...options.parentId !== void 0 ? { parentId: options.parentId } : {},
      childIds: options.childIds
    }),
    childIds: options.childIds,
    depth: options.depth
  };
};
const resolveNodeId = (state, value, fieldName) => {
  if (Number.isInteger(value)) {
    return Number(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^@c\d+$/.test(trimmed)) {
      const nodeId = state.nodeIdByLabel.get(trimmed);
      if (nodeId === void 0) {
        throw new Error(`Component label "${trimmed}" no longer exists in the current React tree.`);
      }
      return nodeId;
    }
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  throw new Error(`"${fieldName}" must be an integer or component label like "@c12"`);
};
const resolveFiberDisplayName = (state, fiberId) => {
  return state.nodesById.get(fiberId)?.displayName ?? `Fiber ${fiberId}`;
};
const ensureNodeExists = (state, nodeId) => {
  const node = state.nodesById.get(nodeId);
  if (!node) {
    throw new Error(`Node "${nodeId}" no longer exists in the current React tree.`);
  }
  return node;
};
const getOptionalRootId = (value) => {
  if (value === void 0) {
    return void 0;
  }
  if (!Number.isInteger(value)) {
    throw new Error('"root" must be an integer node ID');
  }
  return Number(value);
};
const getRequestedNodeId = (state, request) => {
  return resolveNodeId(
    state,
    request.id !== void 0 ? request.id : request.nodeId,
    request.id !== void 0 ? "id" : "nodeId"
  );
};
const createSerializableSnapshot = (value, depth = 3, maxValueLength = DEFAULT_MAX_VALUE_LENGTH, seen = /* @__PURE__ */ new Set()) => {
  if (typeof value === "string") {
    return value.length > maxValueLength ? `${value.slice(0, maxValueLength)}[+${value.length - maxValueLength} chars]` : value;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "undefined") {
    return "[undefined]";
  }
  if (typeof value === "function") {
    return "[function]";
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (depth <= 0) {
      return `[array(${value.length})]`;
    }
    return value.slice(0, 50).map((item) => createSerializableSnapshot(item, depth - 1, maxValueLength, seen));
  }
  if (value && typeof value === "object") {
    const record = value;
    if ("data" in record && "cleaned" in record && Object.keys(record).length <= 5) {
      return createSerializableSnapshot(record.data, depth, maxValueLength, seen);
    }
    if (depth <= 0) {
      return "[object]";
    }
    const entries = Object.entries(record).slice(0, 100);
    return Object.fromEntries(
      entries.map(
        ([key, nested]) => [key, createSerializableSnapshot(nested, depth - 1, maxValueLength, seen)]
      )
    );
  }
  return String(value);
};
const toInspectableEntries = (value, maxValueLength) => {
  const snapshot = createSerializableSnapshot(value, DEFAULT_COMPONENT_VALUE_DEPTH, maxValueLength);
  if (Array.isArray(snapshot)) {
    return snapshot.map((entry, index) => ({
      name: String(index),
      value: entry
    }));
  }
  if (snapshot && typeof snapshot === "object") {
    return Object.entries(snapshot).map(([name2, entryValue]) => ({
      name: name2,
      value: entryValue
    }));
  }
  return [
    {
      name: "value",
      value: snapshot
    }
  ];
};
const toHookEntries = (value, maxValueLength) => {
  const entries = [];
  const visit = (current, pathLabel) => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => {
        const nextLabel = pathLabel.length > 0 ? `${pathLabel}.${index}` : String(index);
        visit(item, nextLabel);
      });
      return;
    }
    if (current && typeof current === "object") {
      const record = current;
      const hookName = typeof record.name === "string" ? record.name : void 0;
      const label = hookName ? `${pathLabel || "value"} (${hookName})` : pathLabel || "value";
      const hookValue = "value" in record ? createSerializableSnapshot(record.value, 6, maxValueLength) : createSerializableSnapshot(record, 6, maxValueLength);
      entries.push({
        name: label,
        value: hookValue
      });
      if (Array.isArray(record.subHooks)) {
        record.subHooks.forEach((subHook, index) => {
          const subLabel = pathLabel.length > 0 ? `${pathLabel}.subHooks.${index}` : `subHooks.${index}`;
          visit(subHook, subLabel);
        });
      }
      return;
    }
    entries.push({
      name: pathLabel || "value",
      value: createSerializableSnapshot(current, 6, maxValueLength)
    });
  };
  visit(value, "");
  return entries;
};
const normalizePath = (value) => {
  if (value === void 0) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('"path" must be an array of strings and integers');
  }
  const path2 = [];
  for (const segment of value) {
    if (typeof segment === "string") {
      path2.push(segment);
      continue;
    }
    if (Number.isInteger(segment)) {
      path2.push(Number(segment));
      continue;
    }
    throw new Error('"path" must be an array of strings and integers');
  }
  return path2;
};
const getValueAtPath = (root, path2) => {
  let current = root;
  for (const segment of path2) {
    if (current === null || current === void 0) {
      throw new Error(`Path segment "${String(segment)}" does not exist.`);
    }
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        throw new Error(`Path segment "${segment}" expects an array.`);
      }
      current = current[segment];
      continue;
    }
    if (typeof current !== "object" || Array.isArray(current)) {
      throw new Error(`Path segment "${segment}" expects an object.`);
    }
    current = current[segment];
  }
  return current;
};
const parseInspectedElementEvent = (message) => {
  if (message.event !== "inspectedElement") {
    return null;
  }
  const payload = getRecord$1(message.payload);
  if (!payload) {
    return null;
  }
  const nodeId = Number.isInteger(payload.id) ? Number(payload.id) : void 0;
  if (nodeId === void 0) {
    return null;
  }
  if (payload.type === "not-found") {
    return {
      nodeId,
      props: void 0,
      state: void 0
    };
  }
  const source = getRecord$1(payload.value) || payload;
  return {
    nodeId,
    ...source.props !== void 0 ? { props: source.props } : {},
    ...source.state !== void 0 ? { state: source.state } : {},
    ...source.hooks !== void 0 ? { hooks: source.hooks } : {}
  };
};
const toReactNodeRecord = (node) => {
  const childIds = (node.childIds || []).filter((childId) => Number.isInteger(childId)).map((childId) => Number(childId)).sort((a, b) => a - b);
  return {
    nodeId: node.nodeId,
    displayName: node.displayName,
    elementType: node.elementType,
    ...node.key !== void 0 ? { key: node.key } : {},
    ...node.parentId !== void 0 ? { parentId: node.parentId } : {},
    ...node.rendererId !== void 0 ? { rendererId: node.rendererId } : {},
    ...node.errorCount !== void 0 ? { errorCount: node.errorCount } : {},
    ...node.warningCount !== void 0 ? { warningCount: node.warningCount } : {},
    childCount: childIds.length,
    childIds
  };
};
const createReactTreeStore = (options) => {
  const createBridge = createReactDevToolsBridge;
  const states = /* @__PURE__ */ new Map();
  const getOrCreateState = (deviceId) => {
    const existing = states.get(deviceId);
    if (existing) {
      return existing;
    }
    const created = {
      rootIds: [],
      nodesById: /* @__PURE__ */ new Map(),
      labelByNodeId: /* @__PURE__ */ new Map(),
      nodeIdByLabel: /* @__PURE__ */ new Map(),
      inspectedById: /* @__PURE__ */ new Map(),
      bridge: null,
      bridgePromise: null,
      pendingMessages: [],
      droppedPendingMessages: 0,
      pendingInspectionsByNodeId: /* @__PURE__ */ new Map(),
      nextInspectRequestId: 1
    };
    states.set(deviceId, created);
    return created;
  };
  const registerDevice = (deviceId, options2) => {
    const state = getOrCreateState(deviceId);
    state.sendMessage = options2?.sendMessage;
    void ensureBridge(state).catch(() => {
    });
  };
  const unregisterDevice = (deviceId) => {
    states.delete(deviceId);
  };
  const syncTree = (deviceId, payload) => {
    const state = getOrCreateState(deviceId);
    const roots = Array.isArray(payload.roots) ? payload.roots : [];
    const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    const rootIds = roots.filter((rootId) => Number.isInteger(rootId)).map((rootId) => Number(rootId)).sort((a, b) => a - b);
    const nodesById = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      if (!Number.isInteger(node.nodeId)) {
        continue;
      }
      const record = toReactNodeRecord(node);
      nodesById.set(record.nodeId, record);
    }
    state.rootIds = rootIds.filter((rootId) => nodesById.has(rootId));
    state.nodesById = nodesById;
    state.labelByNodeId.clear();
    state.nodeIdByLabel.clear();
    const visited = /* @__PURE__ */ new Set();
    let nextLabelIndex = 1;
    const assignLabels = (nodeId) => {
      if (visited.has(nodeId)) {
        return;
      }
      const node = nodesById.get(nodeId);
      if (!node) {
        return;
      }
      visited.add(nodeId);
      const label = `@c${nextLabelIndex++}`;
      state.labelByNodeId.set(nodeId, label);
      state.nodeIdByLabel.set(label, nodeId);
      for (const childId of node.childIds) {
        assignLabels(childId);
      }
    };
    for (const rootId of state.rootIds) {
      assignLabels(rootId);
    }
    state.inspectedById.clear();
  };
  const ensureBridge = async (state) => {
    if (state.bridge) {
      return state.bridge;
    }
    if (!state.bridgePromise) {
      state.bridgePromise = createBridge({
        sendMessage: state.sendMessage
      }).then((bridge) => {
        state.bridge = bridge;
        return bridge;
      }).catch((error2) => {
        state.bridgePromise = null;
        throw error2;
      });
    }
    return state.bridgePromise;
  };
  const ingestReactDevToolsMessage = (deviceId, message) => {
    const record = getRecord$1(message);
    if (!record) {
      return Promise.resolve();
    }
    const state = getOrCreateState(deviceId);
    const event = typeof record.event === "string" ? record.event : void 0;
    const payload = record.payload;
    if (!event) {
      return Promise.resolve();
    }
    const inspected = parseInspectedElementEvent({ event, payload });
    if (inspected) {
      if (inspected.props === void 0 && inspected.state === void 0 && inspected.hooks === void 0) {
        state.inspectedById.delete(inspected.nodeId);
        const pending = state.pendingInspectionsByNodeId.get(inspected.nodeId);
        if (pending) {
          state.pendingInspectionsByNodeId.delete(inspected.nodeId);
          for (const resolve of pending) {
            resolve(null);
          }
        }
      } else {
        const inspectedRecord = {
          ...inspected.props !== void 0 ? { props: inspected.props } : {},
          ...inspected.state !== void 0 ? { state: inspected.state } : {},
          ...inspected.hooks !== void 0 ? { hooks: inspected.hooks } : {}
        };
        state.inspectedById.set(inspected.nodeId, inspectedRecord);
        const pending = state.pendingInspectionsByNodeId.get(inspected.nodeId);
        if (pending) {
          state.pendingInspectionsByNodeId.delete(inspected.nodeId);
          for (const resolve of pending) {
            resolve(inspectedRecord);
          }
        }
      }
    }
    if (state.pendingMessages.length >= MAX_PENDING_REACT_MESSAGES) {
      const overflow = state.pendingMessages.length - MAX_PENDING_REACT_MESSAGES + 1;
      state.pendingMessages.splice(0, overflow);
      state.droppedPendingMessages += overflow;
    }
    state.pendingMessages.push({ event, payload });
    return ensureBridge(state).then((bridge) => {
      while (state.pendingMessages.length > 0) {
        const next = state.pendingMessages.shift();
        const syncPayload = bridge.ingest(next);
        if (syncPayload) {
          syncTree(deviceId, syncPayload);
        }
      }
    });
  };
  const ensureProfilingBridge = async (state) => {
    const bridge = await ensureBridge(state);
    const status = bridge.getProfilingStatus();
    if (!status.supportsProfiling && status.rootsCount > 0) {
      throw new Error("React profiling is not supported by this React DevTools connection.");
    }
    return bridge;
  };
  const isProfilingStarted = async (deviceId) => {
    const state = getOrCreateState(deviceId);
    const bridge = await ensureBridge(state);
    const status = bridge.getProfilingStatus();
    return {
      isProfilingStarted: status.isProfilingStarted,
      isProcessingData: status.isProcessingData,
      hasProfilingData: status.hasProfilingData,
      rootsWithData: status.rootsWithData
    };
  };
  const startProfiling = async (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const shouldRestart = request.shouldRestart === true;
    const state = getOrCreateState(deviceId);
    const bridge = await ensureProfilingBridge(state);
    if (shouldRestart) {
      const status2 = bridge.getProfilingStatus();
      if (!status2.supportsReloadAndProfile) {
        throw new Error("Reload-and-profile is not supported by this React DevTools connection.");
      }
      bridge.reloadAndProfile();
    } else {
      bridge.startProfiling();
    }
    const status = bridge.getProfilingStatus();
    return {
      ok: true,
      status: {
        isProfilingStarted: status.isProfilingStarted,
        isProcessingData: status.isProcessingData
      }
    };
  };
  const waitForProfilingData = async (bridge, waitForDataMs) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < waitForDataMs) {
      if (!bridge.getProfilingStatus().isProcessingData) {
        return true;
      }
      await delay(50);
    }
    return !bridge.getProfilingStatus().isProcessingData;
  };
  const stopProfiling = async (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const waitForDataMs = normalizeWaitForDataMs(request.waitForDataMs);
    const slowRenderThresholdMs = normalizeSlowRenderThreshold(request.slowRenderThresholdMs);
    const state = getOrCreateState(deviceId);
    const bridge = await ensureProfilingBridge(state);
    const statusBeforeStop = bridge.getProfilingStatus();
    if (!statusBeforeStop.isProfilingStarted && !statusBeforeStop.isProcessingData && !statusBeforeStop.hasProfilingData) {
      throw new Error("No active profiling session for this session");
    }
    if (statusBeforeStop.isProfilingStarted) {
      bridge.stopProfiling();
    }
    const finished = await waitForProfilingData(bridge, waitForDataMs);
    const status = bridge.getProfilingStatus();
    const profilingData = bridge.getProfilingDataSnapshot();
    const dataForRoots = profilingData.dataForRoots;
    const conflictingRootCount = profilingData.conflictingRootIds.size;
    const receivedRendererCount = profilingData.receivedRendererIds.size;
    const pendingRendererCount = profilingData.pendingRendererIds.size;
    const roots = Array.from(dataForRoots.keys()).sort((a, b) => a - b);
    let totalCommits = 0;
    let totalRenderDurationMs = 0;
    let slowCount = 0;
    const slowCommits = [];
    dataForRoots.forEach((rootData, rootId) => {
      const commitData = rootData.commitData;
      totalCommits += commitData.length;
      for (let index = 0; index < commitData.length; index += 1) {
        const commit = commitData[index];
        const durationMs = Number(commit.duration) || 0;
        totalRenderDurationMs += durationMs;
        if (durationMs > slowRenderThresholdMs) {
          slowCount += 1;
          slowCommits.push({
            rootId,
            commitIndex: index,
            durationMs,
            timestampMs: Number(commit.timestamp) || 0
          });
        }
      }
    });
    slowCommits.sort((a, b) => b.durationMs - a.durationMs || a.timestampMs - b.timestampMs);
    const truncated = slowCommits.length > TOP_SLOW_COMMITS_LIMIT;
    const partial = !finished || pendingRendererCount > 0 || receivedRendererCount === 0 || conflictingRootCount > 0;
    return {
      session: {
        roots,
        totalCommits,
        totalRenderDurationMs
      },
      renders: {
        count: totalCommits,
        slowCount,
        slowThresholdMs: slowRenderThresholdMs
      },
      topSlowCommits: slowCommits.slice(0, TOP_SLOW_COMMITS_LIMIT),
      truncated,
      ...partial ? { partial: true } : {},
      ...status.isProcessingData ? { isProcessingData: true } : {}
    };
  };
  const getVisibleChildIds = (state, node, noHost, seen = /* @__PURE__ */ new Set()) => {
    const visible = [];
    for (const childId of node.childIds) {
      if (seen.has(childId)) {
        continue;
      }
      seen.add(childId);
      const child = state.nodesById.get(childId);
      if (!child) {
        continue;
      }
      if (isHiddenHost(child, noHost)) {
        visible.push(...getVisibleChildIds(state, child, noHost, seen));
        continue;
      }
      visible.push(childId);
    }
    return visible;
  };
  const getSearchCandidates = (state, rootId) => {
    const visited = /* @__PURE__ */ new Set();
    const queue = [];
    const orderedNodes = [];
    if (rootId !== void 0) {
      const root = state.nodesById.get(rootId);
      if (!root) {
        throw new Error(`Node "${rootId}" no longer exists in the current React tree.`);
      }
      queue.push(rootId);
    } else {
      queue.push(...state.rootIds);
    }
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);
      const node = state.nodesById.get(currentId);
      if (!node) {
        continue;
      }
      orderedNodes.push(node);
      queue.push(...node.childIds);
    }
    return orderedNodes;
  };
  const searchNodes = (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const state = getOrCreateState(deviceId);
    const rawQuery = request.query;
    if (typeof rawQuery !== "string" || rawQuery.trim().length === 0) {
      throw new Error('"query" must be a non-empty string');
    }
    const query = rawQuery.trim().toLowerCase();
    const rootId = request.rootId !== void 0 ? resolveNodeId(state, request.rootId, "rootId") : void 0;
    const match = normalizeMatch(request.match);
    const noHost = normalizeBoolean(request.noHost, "noHost");
    const matched = getSearchCandidates(state, rootId).filter((node) => {
      if (isHiddenHost(node, noHost)) {
        return false;
      }
      if (node.displayName.toLowerCase().includes(query)) {
        return true;
      }
      if (match === "name-or-key" && node.key !== void 0) {
        return String(node.key).toLowerCase().includes(query);
      }
      return false;
    });
    const { items, page } = paginateReactList({
      deviceId,
      tool: SEARCH_TOOL_NAME,
      filters: { query, rootId, match, noHost },
      limit: request.limit,
      cursor: request.cursor,
      items: matched
    });
    return {
      items: items.map((node) => ensureNodeSummaryForState(state, node)),
      page
    };
  };
  const getTree = (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const state = getOrCreateState(deviceId);
    const rootId = getOptionalRootId(request.root);
    const depth = normalizeDepth(request.depth);
    const noHost = normalizeBoolean(request.noHost, "noHost");
    const traversalRoots = rootId === void 0 ? state.rootIds.filter((id) => state.nodesById.has(id)) : [ensureNodeExists(state, rootId).nodeId];
    const visited = /* @__PURE__ */ new Set();
    const allItems = [];
    const walk = (nodeId, currentDepth, visibleParentId) => {
      if (visited.has(nodeId)) {
        return;
      }
      const node = state.nodesById.get(nodeId);
      if (!node) {
        return;
      }
      const hidden = nodeId !== rootId && isHiddenHost(node, noHost);
      if (hidden) {
        visited.add(nodeId);
        for (const childId of node.childIds) {
          walk(childId, currentDepth, visibleParentId);
        }
        return;
      }
      if (depth !== void 0 && currentDepth > depth) {
        return;
      }
      visited.add(nodeId);
      allItems.push(
        ensureTreeNode(state, node, {
          depth: currentDepth,
          ...visibleParentId !== void 0 ? { parentId: visibleParentId } : {},
          childIds: getVisibleChildIds(state, node, noHost)
        })
      );
      for (const childId of node.childIds) {
        walk(childId, currentDepth + 1, nodeId);
      }
    };
    for (const traversalRoot of traversalRoots) {
      walk(traversalRoot, 0);
    }
    const { items, totalCount, page } = paginateReactList({
      deviceId,
      tool: GET_TREE_TOOL_NAME,
      filters: { rootId, depth, noHost },
      limit: request.limit,
      cursor: request.cursor,
      items: allItems
    });
    return {
      roots: traversalRoots,
      items,
      totalCount,
      page
    };
  };
  const getNode = (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const state = getOrCreateState(deviceId);
    const nodeId = getRequestedNodeId(state, request);
    const node = ensureNodeExists(state, nodeId);
    return ensureNodeSummaryForState(state, node);
  };
  const getChildren = (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const state = getOrCreateState(deviceId);
    const nodeId = getRequestedNodeId(state, request);
    const node = ensureNodeExists(state, nodeId);
    const noHost = normalizeBoolean(request.noHost, "noHost");
    const children = getVisibleChildIds(state, node, noHost).map((childId) => state.nodesById.get(childId)).filter((child) => Boolean(child));
    const { items, page } = paginateReactList({
      deviceId,
      tool: GET_CHILDREN_TOOL_NAME,
      filters: { nodeId, noHost },
      limit: request.limit,
      cursor: request.cursor,
      items: children
    });
    return {
      items: items.map(
        (child) => ensureNodeSummaryForState(state, child, {
          parentId: nodeId,
          childIds: getVisibleChildIds(state, child, noHost)
        })
      ),
      page
    };
  };
  const getErrors = (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const state = getOrCreateState(deviceId);
    const rootId = request.root !== void 0 ? resolveNodeId(state, request.root, "root") : void 0;
    const affected = getSearchCandidates(state, rootId).filter((node) => (node.errorCount ?? 0) > 0 || (node.warningCount ?? 0) > 0).sort(
      (a, b) => (b.errorCount ?? 0) - (a.errorCount ?? 0) || (b.warningCount ?? 0) - (a.warningCount ?? 0) || a.nodeId - b.nodeId
    );
    const { items, totalCount, page } = paginateReactList({
      deviceId,
      tool: GET_ERRORS_TOOL_NAME,
      filters: { rootId },
      limit: request.limit,
      cursor: request.cursor,
      items: affected
    });
    return {
      items: items.map((node) => ensureNodeSummaryForState(state, node)),
      totalCount,
      summary: {
        nodeCount: affected.length,
        totalErrors: affected.reduce((total, node) => total + (node.errorCount ?? 0), 0),
        totalWarnings: affected.reduce((total, node) => total + (node.warningCount ?? 0), 0)
      },
      page
    };
  };
  const getInspectedRecord = async (state, nodeId, sections) => {
    let inspected = state.inspectedById.get(nodeId);
    const hasAllRequestedSections = sections.every((section) => {
      return inspected?.[section] !== void 0;
    });
    if (!inspected || !hasAllRequestedSections) {
      inspected = await requestInspectableSnapshot(state, nodeId) || state.inspectedById.get(nodeId);
    }
    return inspected ?? null;
  };
  const getComponent = async (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const state = getOrCreateState(deviceId);
    const nodeId = getRequestedNodeId(state, request);
    const node = ensureNodeExists(state, nodeId);
    const sections = normalizeComponentSections(request.include);
    const valueDepth = normalizeComponentValueDepth(request.valueDepth);
    const maxValueLength = normalizeMaxValueLength(request.maxValueLength);
    const inspected = await getInspectedRecord(state, nodeId, sections);
    if (!inspected) {
      throw new Error(
        `No inspected snapshot available for node "${nodeId}". React DevTools did not return inspected data for this node.`
      );
    }
    const unavailable = [];
    const result = {
      node: {
        ...ensureNodeSummaryForState(state, node),
        childIds: node.childIds.filter((childId) => state.nodesById.has(childId)),
        ...node.rendererId !== void 0 ? { rendererId: node.rendererId } : {}
      }
    };
    for (const section of sections) {
      const value = inspected[section];
      if (value === void 0) {
        unavailable.push(section);
        continue;
      }
      result[section] = createSerializableSnapshot(value, valueDepth, maxValueLength);
    }
    if (unavailable.length === sections.length) {
      throw new Error(`No requested component snapshot sections available for node "${nodeId}".`);
    }
    if (unavailable.length > 0) {
      result.partial = true;
      result.unavailable = unavailable;
    }
    return result;
  };
  const requestInspectableSnapshot = async (state, nodeId) => {
    if (!state.sendMessage) {
      throw new Error(
        "React DevTools outbound channel is unavailable for this device. Re-open React Native DevTools and try again."
      );
    }
    const node = ensureNodeExists(state, nodeId);
    if (!Number.isInteger(node.rendererId)) {
      throw new Error(`Node "${nodeId}" is missing renderer metadata required for inspection.`);
    }
    const bridge = await ensureBridge(state);
    return new Promise((resolve) => {
      const waiters = state.pendingInspectionsByNodeId.get(nodeId) || [];
      waiters.push(resolve);
      state.pendingInspectionsByNodeId.set(nodeId, waiters);
      bridge.send("inspectElement", {
        forceFullData: true,
        id: nodeId,
        path: null,
        rendererID: node.rendererId,
        requestID: state.nextInspectRequestId++
      });
      setTimeout(() => {
        const pending = state.pendingInspectionsByNodeId.get(nodeId);
        if (!pending) {
          return;
        }
        const index = pending.indexOf(resolve);
        if (index !== -1) {
          pending.splice(index, 1);
        }
        if (pending.length === 0) {
          state.pendingInspectionsByNodeId.delete(nodeId);
        } else {
          state.pendingInspectionsByNodeId.set(nodeId, pending);
        }
        resolve(null);
      }, INSPECT_WAIT_TIMEOUT_MS);
    });
  };
  const getInspectableEntries = async (deviceId, rawRequest, kind) => {
    const request = getRecord$1(rawRequest) || {};
    const state = getOrCreateState(deviceId);
    const nodeId = getRequestedNodeId(state, request);
    ensureNodeExists(state, nodeId);
    const path2 = kind === "hooks" ? normalizePath(request.path) : [];
    let inspected = state.inspectedById.get(nodeId);
    let sourceValue = kind === "props" ? inspected?.props : kind === "state" ? inspected?.state : inspected?.hooks;
    if (sourceValue === void 0) {
      const requested = await requestInspectableSnapshot(state, nodeId);
      inspected = requested || state.inspectedById.get(nodeId);
      sourceValue = kind === "props" ? inspected?.props : kind === "state" ? inspected?.state : inspected?.hooks;
      if (sourceValue === void 0) {
        throw new Error(
          `No ${kind} snapshot available for node "${nodeId}". React DevTools did not return inspected data for this node.`
        );
      }
    }
    const scopedValue = path2.length > 0 ? getValueAtPath(sourceValue, path2) : sourceValue;
    const maxValueLength = normalizeMaxValueLength(request.maxValueLength);
    const toolName = kind === "props" ? GET_PROPS_TOOL_NAME : kind === "state" ? GET_STATE_TOOL_NAME : GET_HOOKS_TOOL_NAME;
    const entries = kind === "hooks" ? toHookEntries(scopedValue, maxValueLength) : toInspectableEntries(scopedValue, maxValueLength);
    const { items, page } = paginateReactList({
      deviceId,
      tool: toolName,
      filters: { nodeId, kind, path: path2, maxValueLength },
      limit: request.limit,
      cursor: request.cursor,
      items: entries
    });
    return { items, page };
  };
  const getRenderData = async (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const rootId = normalizeNonNegativeInteger(request.rootId, "rootId");
    const commitIndex = normalizeNonNegativeInteger(request.commitIndex, "commitIndex");
    const sort = normalizeRenderDataSort(request.sort);
    const slowRenderThresholdMs = normalizeSlowRenderThreshold(request.slowRenderThresholdMs);
    const state = getOrCreateState(deviceId);
    const bridge = await ensureProfilingBridge(state);
    const commitData = bridge.getCommitData(rootId, commitIndex);
    const allItems = [];
    commitData.fiberActualDurations.forEach((actualDurationMs, fiberId) => {
      const changeDescription = commitData.changeDescriptions?.get(fiberId) ?? null;
      const changeTypeHints = changeDescription ? toChangeTypeHints(changeDescription) : [];
      const changedKeys = toChangedKeys(changeDescription);
      const displayName = resolveFiberDisplayName(state, fiberId);
      allItems.push({
        fiberId,
        displayName,
        actualDurationMs,
        selfDurationMs: commitData.fiberSelfDurations.get(fiberId) ?? 0,
        isSlow: actualDurationMs > slowRenderThresholdMs,
        ...changeTypeHints.length > 0 ? { changeTypeHints } : {},
        ...changedKeys ? { changedKeys } : {},
        sortName: displayName.toLowerCase()
      });
    });
    if (sort === "name-asc") {
      allItems.sort((a, b) => a.sortName.localeCompare(b.sortName) || a.fiberId - b.fiberId);
    } else {
      allItems.sort((a, b) => b.actualDurationMs - a.actualDurationMs || a.fiberId - b.fiberId);
    }
    const { items, page } = paginateReactList({
      deviceId,
      tool: GET_RENDER_DATA_TOOL_NAME,
      filters: { rootId, commitIndex, sort, slowRenderThresholdMs },
      limit: request.limit,
      cursor: request.cursor,
      items: allItems
    });
    return {
      commit: {
        rootId,
        commitIndex,
        durationMs: commitData.duration,
        effectDurationMs: commitData.effectDuration,
        passiveEffectDurationMs: commitData.passiveEffectDuration,
        timestampMs: commitData.timestamp,
        priorityLevel: commitData.priorityLevel
      },
      summary: {
        renderedFiberCount: allItems.length,
        slowFiberCount: allItems.filter((item) => item.isSlow).length,
        slowRenderThresholdMs,
        updaterCount: commitData.updaters?.length ?? 0,
        hasChangeDescriptions: commitData.changeDescriptions !== null
      },
      items: items.map(({ sortName, ...item }) => {
        return item;
      }),
      page
    };
  };
  const collectSessionCommits = async (deviceId, rootFilter) => {
    const state = getOrCreateState(deviceId);
    const bridge = await ensureProfilingBridge(state);
    const snapshot = bridge.getProfilingDataSnapshot();
    if (snapshot.dataForRoots.size === 0) {
      throw new Error(
        "No React profiling data available. Run startProfiling and stopProfiling first."
      );
    }
    const roots = [];
    const skippedRootIds = [];
    const commits = [];
    for (const rootId of [...snapshot.dataForRoots.keys()].sort((a, b) => a - b)) {
      if (rootFilter !== void 0 && rootId !== rootFilter) {
        continue;
      }
      if (snapshot.conflictingRootIds.has(rootId)) {
        skippedRootIds.push(rootId);
        continue;
      }
      roots.push(rootId);
      const commitData = snapshot.dataForRoots.get(rootId)?.commitData ?? [];
      commitData.forEach((commit, commitIndex) => {
        commits.push({ rootId, commitIndex, commit });
      });
    }
    if (rootFilter !== void 0 && roots.length === 0 && skippedRootIds.length === 0) {
      throw new Error(`No React profiling data available for root "${rootFilter}".`);
    }
    return { roots, skippedRootIds, commits };
  };
  const getProfileTimeline = async (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const rootId = request.rootId !== void 0 ? normalizeNonNegativeInteger(request.rootId, "rootId") : void 0;
    const sort = request.sort === "duration-desc" ? "duration-desc" : "timeline";
    const slowRenderThresholdMs = normalizeSlowRenderThreshold(request.slowRenderThresholdMs);
    const session = await collectSessionCommits(deviceId, rootId);
    const allItems = session.commits.map(
      ({ rootId: commitRootId, commitIndex, commit }) => ({
        rootId: commitRootId,
        commitIndex,
        durationMs: commit.duration,
        timestampMs: commit.timestamp,
        renderedFiberCount: commit.fiberActualDurations.size,
        isSlow: commit.duration > slowRenderThresholdMs,
        effectDurationMs: commit.effectDuration,
        passiveEffectDurationMs: commit.passiveEffectDuration,
        priorityLevel: commit.priorityLevel,
        updaterCount: commit.updaters?.length ?? 0,
        hasChangeDescriptions: commit.changeDescriptions !== null
      })
    );
    if (sort === "duration-desc") {
      allItems.sort(
        (a, b) => b.durationMs - a.durationMs || a.rootId - b.rootId || a.commitIndex - b.commitIndex
      );
    }
    const { items, totalCount, page } = paginateReactList({
      deviceId,
      tool: GET_PROFILE_TIMELINE_TOOL_NAME,
      filters: { rootId, sort, slowRenderThresholdMs },
      limit: request.limit,
      cursor: request.cursor,
      items: allItems
    });
    return {
      items,
      totalCount,
      summary: {
        roots: session.roots,
        totalCommits: allItems.length,
        totalRenderDurationMs: allItems.reduce((total, item) => total + item.durationMs, 0),
        slowCommitCount: allItems.filter((item) => item.isSlow).length,
        slowRenderThresholdMs,
        ...session.skippedRootIds.length > 0 ? { skippedRootIds: session.skippedRootIds } : {}
      },
      page
    };
  };
  const getComponentRenders = async (deviceId, rawRequest) => {
    const request = getRecord$1(rawRequest) || {};
    const state = getOrCreateState(deviceId);
    const rootId = request.rootId !== void 0 ? normalizeNonNegativeInteger(request.rootId, "rootId") : void 0;
    const requestedFiber = request.id !== void 0 ? request.id : request.fiberId;
    const fiberId = requestedFiber !== void 0 ? resolveNodeId(state, requestedFiber, request.id !== void 0 ? "id" : "fiberId") : void 0;
    const sort = normalizeComponentRendersSort(request.sort);
    const slowRenderThresholdMs = normalizeSlowRenderThreshold(request.slowRenderThresholdMs);
    const session = await collectSessionCommits(deviceId, rootId);
    const aggregates = /* @__PURE__ */ new Map();
    for (const { rootId: commitRootId, commitIndex, commit } of session.commits) {
      commit.fiberActualDurations.forEach((actualDurationMs, currentFiberId) => {
        if (fiberId !== void 0 && currentFiberId !== fiberId) {
          return;
        }
        const key = `${commitRootId}:${currentFiberId}`;
        let aggregate = aggregates.get(key);
        if (!aggregate) {
          const displayName = resolveFiberDisplayName(state, currentFiberId);
          aggregate = {
            rootId: commitRootId,
            fiberId: currentFiberId,
            ...state.labelByNodeId.has(currentFiberId) ? { label: state.labelByNodeId.get(currentFiberId) } : {},
            displayName,
            renderCount: 0,
            totalDurationMs: 0,
            avgDurationMs: 0,
            maxDurationMs: 0,
            totalSelfDurationMs: 0,
            slowRenderCount: 0,
            slowestCommitIndex: commitIndex,
            sortName: displayName.toLowerCase()
          };
          aggregates.set(key, aggregate);
        }
        aggregate.renderCount += 1;
        aggregate.totalDurationMs += actualDurationMs;
        aggregate.totalSelfDurationMs += commit.fiberSelfDurations.get(currentFiberId) ?? 0;
        if (actualDurationMs > aggregate.maxDurationMs) {
          aggregate.maxDurationMs = actualDurationMs;
          aggregate.slowestCommitIndex = commitIndex;
        }
        if (actualDurationMs > slowRenderThresholdMs) {
          aggregate.slowRenderCount += 1;
        }
        const changeDescription = commit.changeDescriptions?.get(currentFiberId);
        if (changeDescription) {
          aggregate.changeTypeHints = mergeStringSets(
            aggregate.changeTypeHints,
            toChangeTypeHints(changeDescription)
          );
          aggregate.changedKeys = mergeChangedKeys(
            aggregate.changedKeys,
            toChangedKeys(changeDescription)
          );
        }
      });
    }
    const allItems = [...aggregates.values()];
    for (const aggregate of allItems) {
      aggregate.avgDurationMs = roundMs(aggregate.totalDurationMs / aggregate.renderCount);
    }
    allItems.sort(compareComponentRenders(sort));
    const { items, totalCount, page } = paginateReactList({
      deviceId,
      tool: GET_COMPONENT_RENDERS_TOOL_NAME,
      filters: { rootId, fiberId, sort, slowRenderThresholdMs },
      limit: request.limit,
      cursor: request.cursor,
      items: allItems
    });
    return {
      items: items.map(({ sortName, ...item }) => {
        return item;
      }),
      totalCount,
      summary: {
        roots: session.roots,
        totalCommits: session.commits.length,
        renderedFiberCount: allItems.length,
        slowRenderThresholdMs,
        hasChangeDescriptions: session.commits.some(
          ({ commit }) => commit.changeDescriptions !== null
        ),
        ...session.skippedRootIds.length > 0 ? { skippedRootIds: session.skippedRootIds } : {}
      },
      page
    };
  };
  return {
    registerDevice,
    unregisterDevice,
    syncTree,
    ingestReactDevToolsMessage,
    startProfiling,
    isProfilingStarted,
    stopProfiling,
    getRenderData,
    getTree,
    getComponent,
    searchNodes,
    getNode,
    getChildren,
    getProps: (deviceId, rawRequest) => {
      return getInspectableEntries(deviceId, rawRequest, "props");
    },
    getState: (deviceId, rawRequest) => {
      return getInspectableEntries(deviceId, rawRequest, "state");
    },
    getHooks: (deviceId, rawRequest) => {
      return getInspectableEntries(deviceId, rawRequest, "hooks");
    },
    getErrors,
    getProfileTimeline,
    getComponentRenders
  };
};
const cursorPagination = (config) => ({
  kind: "cursor",
  fields: config.fields,
  ...config.defaultFields ? { defaultFields: config.defaultFields } : {}
});
const DEFAULT_RN_DEVTOOLS_TRACE_CATEGORIES = [
  "-*",
  "blink.console",
  "loading",
  "blink.user_timing",
  "devtools.timeline",
  "disabled-by-default-devtools.target-rundown",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.stack",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.v8-source-rundown",
  "disabled-by-default-v8.compile",
  "disabled-by-default-v8.inspector",
  "disabled-by-default-v8.cpu_profiler.hires",
  "disabled-by-default-lighthouse",
  "v8.execute",
  "v8",
  "cppgc",
  "navigation",
  "rail",
  "disabled-by-default-v8.cpu_profiler"
];
const NAME_HINT_SCHEMA = {
  type: "string",
  description: "Optional file naming hint used for the Metro-managed artifact filename."
};
const TRACE_COMPLETION_TIMEOUT_MS = 6e4;
const HEAP_SNAPSHOT_TIMEOUT_MS = 12e4;
const DEFAULT_DOMAIN_PAGE_LIMIT = 20;
const MAX_DOMAIN_PAGE_LIMIT = 100;
const NETWORK_BUFFER_CAPACITY = 500;
const getRecord = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
};
const getString = (value) => {
  return typeof value === "string" ? value : void 0;
};
const getOptionalStringArray = (value) => {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const items = value.filter((item) => typeof item === "string");
  return items.length > 0 ? items : void 0;
};
const getOptionalNumber = (value) => {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
};
const getOptionalBoolean = (value) => {
  return typeof value === "boolean" ? value : void 0;
};
const getOptionalPositiveInteger = (value) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return void 0;
  }
  return value;
};
const getOptionalRecord = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return void 0;
};
const toMilliseconds = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return void 0;
  }
  return Math.round(value * 1e3);
};
const getErrorMessage = (error2) => {
  return error2 instanceof Error ? error2.message : String(error2);
};
const isTextLikeMimeType = (mimeType) => {
  if (!mimeType) {
    return false;
  }
  const normalized = mimeType.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.startsWith("text/") || normalized === "application/json" || normalized === "application/javascript" || normalized === "application/xml" || normalized === "application/x-www-form-urlencoded" || normalized === "application/graphql" || normalized.endsWith("+json") || normalized.endsWith("+xml");
};
const paginateRows = (rows, options) => {
  let startIndex = 0;
  if (options.cursor) {
    let decoded;
    try {
      decoded = JSON.parse(
        Buffer.from(options.cursor, "base64url").toString("utf8")
      );
      if (decoded.v !== 1 || decoded.scope !== options.scope || !Number.isInteger(decoded.index) || decoded.index < 0) {
        throw new Error("Invalid cursor payload");
      }
    } catch {
      throw new Error(
        'Invalid "cursor". Run the command again without cursor to restart pagination.'
      );
    }
    if (options.generation !== void 0 && decoded.generation !== options.generation) {
      return {
        items: [],
        page: {
          limit: options.limit,
          hasMore: false,
          reset: true
        }
      };
    }
    startIndex = decoded.index;
  }
  const endIndex = Math.min(startIndex + options.limit, rows.length);
  const items = rows.slice(startIndex, endIndex);
  const hasMore = endIndex < rows.length;
  const nextCursor = hasMore ? Buffer.from(
    JSON.stringify({
      v: 1,
      scope: options.scope,
      index: endIndex,
      ...options.generation !== void 0 ? { generation: options.generation } : {}
    }),
    "utf8"
  ).toString("base64url") : void 0;
  return {
    items,
    page: {
      limit: options.limit,
      hasMore,
      ...nextCursor ? { nextCursor } : {}
    }
  };
};
const createArtifactMetadata = (artifact, type2) => {
  return {
    type: type2,
    path: artifact.path,
    relativePath: artifact.relativePath,
    bytes: artifact.bytes,
    bucket: artifact.bucket,
    fileName: artifact.fileName
  };
};
const createNetworkSummary = (record) => ({
  requestId: record.requestId,
  method: record.method || record.request?.method || "UNKNOWN",
  url: record.url || record.request?.url || "",
  status: record.status ?? record.response?.status ?? null,
  type: record.type ?? null,
  startTimeMs: record.startTimeMs ?? null,
  endTimeMs: record.endTimeMs ?? null,
  durationMs: record.durationMs ?? null,
  transferSize: record.transferSize ?? null,
  encodedDataLength: record.encodedDataLength ?? record.response?.encodedDataLength ?? null,
  outcome: record.loadingFailed ? "failed" : record.loadingFinished ? "success" : "in-flight"
});
const createNetworkStatus = (state) => ({
  recording: {
    isRecording: state.isRecording,
    startedAt: state.startedAt ?? null,
    stoppedAt: state.stoppedAt ?? null,
    requestCount: state.requestOrder.length,
    totalRecorded: state.totalRecorded,
    evictedCount: state.evictedCount,
    truncated: state.truncated,
    capacity: NETWORK_BUFFER_CAPACITY,
    generation: state.generation
  }
});
const getCDPCommandResult = (value) => {
  return getOptionalRecord(value.result) || value;
};
const createCDPEventWaiter = (subscribeToCDPEvent, method, options = {}) => {
  let unsubscribe = () => {
  };
  let timer = null;
  const cleanup = () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const promise = new Promise((resolve, reject) => {
    unsubscribe = subscribeToCDPEvent(method, (params) => {
      cleanup();
      resolve(params);
    });
    const timeoutMs = options.timeoutMs;
    if (timeoutMs !== void 0) {
      timer = setTimeout(() => {
        cleanup();
        reject(new CdpEventTimeoutError(method, timeoutMs, options.hint));
      }, timeoutMs);
    }
  });
  return {
    promise,
    cancel: cleanup
  };
};
const createTraceResult = (startedAt, artifact) => {
  const finishedAt = Date.now();
  return {
    artifact: createArtifactMetadata(artifact, "trace"),
    timing: {
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt
    }
  };
};
const createTraceMetadata = (startedAt, traceWindow) => {
  const window = traceWindow ? {
    min: traceWindow.min,
    max: traceWindow.max,
    range: traceWindow.max - traceWindow.min
  } : {
    min: 0,
    max: 0,
    range: 0
  };
  return {
    source: "DevTools",
    startTime: new Date(startedAt).toISOString(),
    dataOrigin: "TraceEvents",
    modifications: {
      entriesModifications: {
        hiddenEntries: [],
        expandableEntries: []
      },
      initialBreadcrumb: {
        window,
        child: null
      },
      annotations: {
        entryLabels: [],
        labelledTimeRanges: [],
        linksBetweenEntries: []
      }
    }
  };
};
const createProfileResult = (type2, startedAt, artifact) => {
  const finishedAt = Date.now();
  return {
    artifact: createArtifactMetadata(artifact, type2),
    timing: {
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt
    }
  };
};
const createPerformanceDomainService = (deps) => {
  const tools = [
    {
      name: "startTrace",
      description: "Start a CDP performance trace for the current session target.",
      inputSchema: {
        type: "object",
        properties: {
          categories: {
            type: "array",
            items: { type: "string" },
            description: "Optional trace categories. Passed to Tracing.start."
          },
          options: {
            type: "string",
            description: "Optional trace options string. Passed to Tracing.start."
          }
        }
      }
    },
    {
      name: "stopTrace",
      description: "Stop the active trace and write the result to a Metro-managed artifact path.",
      inputSchema: {
        type: "object",
        properties: {
          nameHint: NAME_HINT_SCHEMA
        }
      }
    }
  ];
  let traceState = null;
  const startTrace = async (args) => {
    if (traceState) {
      throw new Error("A trace is already active for this session");
    }
    const input = getRecord(args);
    const categories = getOptionalStringArray(input.categories) || [
      ...DEFAULT_RN_DEVTOOLS_TRACE_CATEGORIES
    ];
    const options = getString(input.options);
    await deps.sendCommand("Tracing.start", {
      transferMode: "ReportEvents",
      bufferUsageReportingInterval: 500,
      categories: categories.join(","),
      ...options ? { options } : {}
    });
    traceState = {
      startedAt: Date.now(),
      categories,
      ...options ? { options } : {}
    };
    return {
      started: true,
      trace: traceState
    };
  };
  const stopTrace = async (args) => {
    if (!traceState) {
      throw new Error("No active trace for this session");
    }
    const input = getRecord(args);
    const startedAt = traceState.startedAt;
    const writer = await deps.createArtifactWriter("traces", "json", getString(input.nameHint));
    let pendingWrites = Promise.resolve();
    let wroteHeader = false;
    let writtenEventCount = 0;
    let traceWindow = null;
    const tracingComplete = createCDPEventWaiter(
      deps.subscribeToCDPEvent,
      "Tracing.tracingComplete",
      {
        timeoutMs: TRACE_COMPLETION_TIMEOUT_MS,
        hint: "The target may implement a tracing protocol other than Chrome's."
      }
    );
    const unsubscribeDataCollected = deps.subscribeToCDPEvent("Tracing.dataCollected", (params) => {
      const values = Array.isArray(params.value) ? params.value : [];
      pendingWrites = pendingWrites.then(async () => {
        for (const item of values) {
          if (!wroteHeader) {
            await writer.write('{"traceEvents":[');
            wroteHeader = true;
          }
          if (typeof item?.ts === "number" && Number.isFinite(item.ts)) {
            traceWindow = traceWindow ? {
              min: Math.min(traceWindow.min, item.ts),
              max: Math.max(traceWindow.max, item.ts)
            } : { min: item.ts, max: item.ts };
          }
          if (writtenEventCount > 0) {
            await writer.write(",");
          }
          await writer.write(JSON.stringify(item));
          writtenEventCount += 1;
        }
      });
    });
    try {
      await deps.sendCommand("Tracing.end");
      await tracingComplete.promise;
      await pendingWrites;
      if (writtenEventCount === 0) {
        throw new Error(
          "The trace completed without a single trace event, so nothing was captured. This target does not appear to implement Chrome-style tracing."
        );
      }
      await writer.write(
        `],"metadata":${JSON.stringify(createTraceMetadata(startedAt, traceWindow))}}`
      );
      const artifact = await writer.finalize();
      return createTraceResult(startedAt, artifact);
    } catch (error2) {
      await writer.abort();
      throw error2;
    } finally {
      unsubscribeDataCollected();
      tracingComplete.cancel();
      traceState = null;
    }
  };
  return {
    domainId: "performance",
    getTools: () => tools,
    callTool: async (toolName, args) => {
      if (toolName === "startTrace") {
        return startTrace(args);
      }
      if (toolName === "stopTrace") {
        return stopTrace(args);
      }
      return void 0;
    },
    onDisconnected: () => {
      traceState = null;
    },
    dispose: async () => {
      traceState = null;
    }
  };
};
const createReactDomainService = (deps) => {
  const nodeIdentifierSchema = {
    oneOf: [{ type: "integer" }, { type: "string" }]
  };
  const nodeIdentifierRequirement = {
    anyOf: [{ required: ["id"] }, { required: ["nodeId"] }]
  };
  const limitSchema = {
    type: "integer",
    description: "Page size. Default 20, max 100."
  };
  const cursorSchema = {
    type: "string",
    description: "Opaque cursor returned by the previous page."
  };
  const noHostSchema = {
    type: "boolean",
    description: "Hide plain host components — the native views React renders into. Defaults to false. Usually a no-op: React DevTools hides host components at the backend by default, so they rarely reach this tree at all; set this only when a DevTools frontend on the same backend has turned them back on. Host nodes with a key, a hyphenated custom element name, or logged errors or warnings are kept either way."
  };
  const maxValueLengthSchema = {
    type: "number",
    description: 'Truncate serialized string values longer than this, marking the cut with "[+N chars]". Default 512, max 8192.'
  };
  const slowRenderThresholdSchema = {
    type: "number",
    description: "Threshold used to classify slow renders. Default 16ms."
  };
  const tools = [
    {
      name: "getTree",
      description: "Get the current React component tree with optional depth limiting and cursor-based pagination. With noHost, parentId, childIds and depth describe the filtered tree, so following childIds always lands on a node the same call returns.",
      inputSchema: {
        type: "object",
        properties: {
          root: {
            type: "integer",
            description: "Optional root node ID to scope the tree to a subtree."
          },
          depth: {
            type: "integer",
            description: "Optional max descendant depth relative to the selected root. 0 returns only roots."
          },
          noHost: noHostSchema,
          limit: limitSchema,
          cursor: cursorSchema
        }
      },
      pagination: cursorPagination({
        fields: [
          "nodeId",
          "label",
          "displayName",
          "elementType",
          "key",
          "childCount",
          "parentId",
          "parentLabel",
          "childIds",
          "depth",
          "errorCount",
          "warningCount"
        ],
        defaultFields: [
          "nodeId",
          "label",
          "displayName",
          "elementType",
          "childCount",
          "depth",
          "errorCount",
          "warningCount"
        ]
      })
    },
    {
      name: "getComponent",
      description: "Get a React node summary plus inspected props, state, and hooks in one response.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            ...nodeIdentifierSchema,
            description: "React DevTools node ID or component label."
          },
          nodeId: {
            ...nodeIdentifierSchema,
            description: "React DevTools node ID or component label."
          },
          include: {
            type: "array",
            items: {
              type: "string",
              enum: ["props", "state", "hooks"]
            },
            description: "Optional sections to include. Defaults to props, state, and hooks."
          },
          valueDepth: {
            type: "integer",
            description: "Max nested serialization depth. Default 4, max 8."
          },
          maxValueLength: maxValueLengthSchema
        },
        anyOf: [{ required: ["id"] }, { required: ["nodeId"] }]
      }
    },
    {
      name: "getNode",
      description: "Get a single React node summary by node ID or label.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            ...nodeIdentifierSchema,
            description: "React DevTools node ID or component label."
          },
          nodeId: {
            ...nodeIdentifierSchema,
            description: "React DevTools node ID or component label."
          }
        },
        ...nodeIdentifierRequirement
      }
    },
    {
      name: "getChildren",
      description: "Get a node's direct children by node ID or label with cursor-based pagination. With noHost, a hidden host is replaced by its own children.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            ...nodeIdentifierSchema,
            description: "Parent node ID or component label."
          },
          nodeId: {
            ...nodeIdentifierSchema,
            description: "Parent node ID or component label."
          },
          noHost: noHostSchema,
          limit: limitSchema,
          cursor: cursorSchema
        },
        ...nodeIdentifierRequirement
      },
      pagination: cursorPagination({
        fields: [
          "nodeId",
          "label",
          "displayName",
          "elementType",
          "key",
          "childCount",
          "parentId",
          "parentLabel",
          "errorCount",
          "warningCount"
        ],
        defaultFields: [
          "nodeId",
          "label",
          "displayName",
          "elementType",
          "childCount",
          "errorCount",
          "warningCount"
        ]
      })
    },
    {
      name: "getProps",
      description: "Get inspected props for a node with cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            ...nodeIdentifierSchema,
            description: "Node ID or component label to read props for."
          },
          nodeId: {
            ...nodeIdentifierSchema,
            description: "Node ID or component label to read props for."
          },
          maxValueLength: maxValueLengthSchema,
          limit: limitSchema,
          cursor: cursorSchema
        },
        ...nodeIdentifierRequirement
      },
      pagination: cursorPagination({
        // Only two fields exist; there is nothing sensible to trim.
        fields: ["name", "value"]
      })
    },
    {
      name: "getState",
      description: "Get inspected state for a node with cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            ...nodeIdentifierSchema,
            description: "Node ID or component label to read state for."
          },
          nodeId: {
            ...nodeIdentifierSchema,
            description: "Node ID or component label to read state for."
          },
          maxValueLength: maxValueLengthSchema,
          limit: limitSchema,
          cursor: cursorSchema
        },
        ...nodeIdentifierRequirement
      },
      pagination: cursorPagination({
        // Only two fields exist; there is nothing sensible to trim.
        fields: ["name", "value"]
      })
    },
    {
      name: "getHooks",
      description: "Get inspected hooks for a node with cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            ...nodeIdentifierSchema,
            description: "Node ID or component label to read hooks for."
          },
          nodeId: {
            ...nodeIdentifierSchema,
            description: "Node ID or component label to read hooks for."
          },
          path: {
            type: "array",
            items: {
              oneOf: [{ type: "string" }, { type: "integer" }]
            },
            description: 'Optional path into hooks tree, e.g. [0, "subHooks"].'
          },
          maxValueLength: maxValueLengthSchema,
          limit: limitSchema,
          cursor: cursorSchema
        },
        ...nodeIdentifierRequirement
      },
      pagination: cursorPagination({
        // Only two fields exist; there is nothing sensible to trim.
        fields: ["name", "value"]
      })
    },
    {
      name: "searchNodes",
      description: "Search React component tree nodes by display name or key.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query. Required and non-empty."
          },
          rootId: {
            ...nodeIdentifierSchema,
            description: "Optional root node ID or component label to scope search to a subtree."
          },
          match: {
            type: "string",
            enum: ["name", "name-or-key"],
            description: 'Matching mode. Defaults to "name".'
          },
          noHost: noHostSchema,
          limit: limitSchema,
          cursor: cursorSchema
        },
        required: ["query"]
      },
      pagination: cursorPagination({
        fields: [
          "nodeId",
          "label",
          "displayName",
          "elementType",
          "key",
          "childCount",
          "parentId",
          "parentLabel",
          "errorCount",
          "warningCount"
        ],
        defaultFields: [
          "nodeId",
          "label",
          "displayName",
          "elementType",
          "childCount",
          "parentLabel",
          "errorCount",
          "warningCount"
        ]
      })
    },
    {
      name: "getErrors",
      description: "List the components React logged errors or warnings against, most errors first. Covers warnings as well as errors; counts are cumulative and reset when a component remounts.",
      inputSchema: {
        type: "object",
        properties: {
          root: {
            ...nodeIdentifierSchema,
            description: "Optional root node ID or component label to scope the search."
          },
          limit: limitSchema,
          cursor: cursorSchema
        }
      },
      pagination: cursorPagination({
        fields: [
          "nodeId",
          "label",
          "displayName",
          "elementType",
          "key",
          "childCount",
          "parentId",
          "parentLabel",
          "errorCount",
          "warningCount"
        ],
        defaultFields: ["nodeId", "label", "displayName", "errorCount", "warningCount"]
      })
    },
    {
      name: "startProfiling",
      description: "Start React profiling or request reload-and-profile when supported.",
      inputSchema: {
        type: "object",
        properties: {
          shouldRestart: {
            type: "boolean",
            description: "If true, requests reload-and-profile instead of starting immediately."
          }
        }
      }
    },
    {
      name: "isProfilingStarted",
      description: "Get current React profiling status and recorded data availability.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "stopProfiling",
      description: "Stop React profiling and return a compact summary of the captured session.",
      inputSchema: {
        type: "object",
        properties: {
          waitForDataMs: {
            type: "number",
            description: "Max wait for backend profiling data processing. Default 3000ms, max 10000ms."
          },
          slowRenderThresholdMs: slowRenderThresholdSchema
        }
      }
    },
    {
      name: "getComponentRenders",
      description: `Get per-component render totals aggregated across every commit of the captured profiling session: render count, total/average/max render time, and why each component rendered. This is the tool that answers "what was slow" and "what re-rendered too often" in one call — reach for getRenderData only to drill into a single commit afterwards. Pass id/fiberId to get one component's report.`,
      inputSchema: {
        type: "object",
        properties: {
          rootId: {
            type: "integer",
            description: "Optional React root ID. Defaults to every root in the session."
          },
          id: {
            ...nodeIdentifierSchema,
            description: "Optional node ID or component label to report on a single component."
          },
          fiberId: {
            ...nodeIdentifierSchema,
            description: "Optional node ID or component label to report on a single component."
          },
          sort: {
            type: "string",
            enum: [
              "total-duration-desc",
              "avg-duration-desc",
              "max-duration-desc",
              "render-count-desc",
              "name-asc"
            ],
            description: 'Sort order. Defaults to "total-duration-desc".'
          },
          slowRenderThresholdMs: slowRenderThresholdSchema,
          limit: limitSchema,
          cursor: cursorSchema
        }
      },
      pagination: cursorPagination({
        fields: [
          "rootId",
          "fiberId",
          "label",
          "displayName",
          "renderCount",
          "totalDurationMs",
          "avgDurationMs",
          "maxDurationMs",
          "totalSelfDurationMs",
          "slowRenderCount",
          "slowestCommitIndex",
          "changeTypeHints",
          "changedKeys"
        ],
        defaultFields: [
          "fiberId",
          "label",
          "displayName",
          "renderCount",
          "totalDurationMs",
          "avgDurationMs",
          "maxDurationMs",
          "changeTypeHints"
        ]
      })
    },
    {
      name: "getProfileTimeline",
      description: "List every commit in the captured profiling session with its duration and how many fibers rendered, chronologically or slowest first. Use it to pick a commitIndex for getRenderData; unlike stopProfiling it stays queryable and pages through all commits. Request the effectDurationMs, passiveEffectDurationMs, priorityLevel, updaterCount and hasChangeDescriptions fields to see commit cost beyond render time.",
      inputSchema: {
        type: "object",
        properties: {
          rootId: {
            type: "integer",
            description: "Optional React root ID. Defaults to every root in the session."
          },
          sort: {
            type: "string",
            enum: ["timeline", "duration-desc"],
            description: 'Sort order. Defaults to "timeline" (chronological).'
          },
          slowRenderThresholdMs: slowRenderThresholdSchema,
          limit: limitSchema,
          cursor: cursorSchema
        }
      },
      pagination: cursorPagination({
        fields: [
          "rootId",
          "commitIndex",
          "durationMs",
          "timestampMs",
          "renderedFiberCount",
          "isSlow",
          "effectDurationMs",
          "passiveEffectDurationMs",
          "priorityLevel",
          "updaterCount",
          "hasChangeDescriptions"
        ],
        defaultFields: ["rootId", "commitIndex", "durationMs", "renderedFiberCount", "isSlow"]
      })
    },
    {
      name: "getRenderData",
      description: "Get a paged summary of a single React commit by rootId and commitIndex. Each item is a fiber that rendered, with its displayName, timing, and why it rendered (changeTypeHints plus the specific changed prop/state/context key names in changedKeys).",
      inputSchema: {
        type: "object",
        properties: {
          rootId: {
            type: "integer",
            description: "React root ID."
          },
          commitIndex: {
            type: "integer",
            description: "Zero-based commit index within the selected root."
          },
          sort: {
            type: "string",
            enum: ["duration-desc", "name-asc"],
            description: 'Sort order. Defaults to "duration-desc".'
          },
          slowRenderThresholdMs: {
            type: "number",
            description: "Threshold used to classify slow fibers. Default 16ms."
          },
          limit: limitSchema,
          cursor: cursorSchema
        },
        required: ["rootId", "commitIndex"]
      },
      pagination: cursorPagination({
        fields: [
          "fiberId",
          "displayName",
          "actualDurationMs",
          "selfDurationMs",
          "isSlow",
          "changeTypeHints",
          "changedKeys"
        ],
        defaultFields: ["fiberId", "displayName", "actualDurationMs", "selfDurationMs", "isSlow"]
      })
    }
  ];
  const sessionDeviceId = `react-session:${deps.sessionId}`;
  const store = createReactTreeStore();
  const bindDevice = () => {
    store.registerDevice(sessionDeviceId, {
      sendMessage: deps.sendReactDevToolsMessage
    });
  };
  bindDevice();
  return {
    domainId: "react",
    getTools: () => tools,
    callTool: async (toolName, args) => {
      switch (toolName) {
        case "getTree":
          return store.getTree(sessionDeviceId, args);
        case "getComponent":
          return store.getComponent(sessionDeviceId, args);
        case "getNode":
          return store.getNode(sessionDeviceId, args);
        case "getChildren":
          return store.getChildren(sessionDeviceId, args);
        case "getProps":
          return store.getProps(sessionDeviceId, args);
        case "getState":
          return store.getState(sessionDeviceId, args);
        case "getHooks":
          return store.getHooks(sessionDeviceId, args);
        case "searchNodes":
          return store.searchNodes(sessionDeviceId, args);
        case "startProfiling":
          return store.startProfiling(sessionDeviceId, args);
        case "isProfilingStarted":
          return store.isProfilingStarted(sessionDeviceId);
        case "stopProfiling":
          return store.stopProfiling(sessionDeviceId, args);
        case "getRenderData":
          return store.getRenderData(sessionDeviceId, args);
        case "getErrors":
          return store.getErrors(sessionDeviceId, args);
        case "getProfileTimeline":
          return store.getProfileTimeline(sessionDeviceId, args);
        case "getComponentRenders":
          return store.getComponentRenders(sessionDeviceId, args);
        default:
          return void 0;
      }
    },
    captureReactDevToolsMessage: async (message) => {
      await store.ingestReactDevToolsMessage(sessionDeviceId, message);
    },
    onDisconnected: () => {
      store.unregisterDevice(sessionDeviceId);
      bindDevice();
    },
    dispose: async () => {
      store.unregisterDevice(sessionDeviceId);
    }
  };
};
const createMemoryDomainService = (deps) => {
  const tools = [
    {
      name: "takeHeapSnapshot",
      description: "Capture a heap snapshot and write it to a Metro-managed artifact path.",
      inputSchema: {
        type: "object",
        properties: {
          nameHint: NAME_HINT_SCHEMA
        }
      }
    },
    {
      name: "startSampling",
      description: "Start heap allocation sampling for the current session target.",
      inputSchema: {
        type: "object",
        properties: {
          samplingInterval: {
            type: "number",
            description: "Average sampling interval in bytes."
          },
          includeObjectsCollectedByMajorGC: {
            type: "boolean",
            description: "Include objects collected by major GC."
          },
          includeObjectsCollectedByMinorGC: {
            type: "boolean",
            description: "Include objects collected by minor GC."
          }
        }
      }
    },
    {
      name: "stopSampling",
      description: "Stop heap allocation sampling and write the profile to a Metro-managed artifact path.",
      inputSchema: {
        type: "object",
        properties: {
          nameHint: NAME_HINT_SCHEMA
        }
      }
    }
  ];
  let samplingState = null;
  let heapSnapshotInProgress = false;
  const takeHeapSnapshot = async (args) => {
    if (heapSnapshotInProgress) {
      throw new Error("A heap snapshot is already in progress for this session");
    }
    const input = getRecord(args);
    const startedAt = Date.now();
    const writer = await deps.createArtifactWriter(
      "memory",
      "heapsnapshot",
      getString(input.nameHint)
    );
    heapSnapshotInProgress = true;
    let reportCompleted = false;
    let pendingChunkWrites = Promise.resolve();
    const chunkUnsubscribe = deps.subscribeToCDPEvent(
      "HeapProfiler.addHeapSnapshotChunk",
      (params) => {
        const chunk = getString(params.chunk);
        if (chunk) {
          pendingChunkWrites = pendingChunkWrites.then(() => writer.write(chunk));
        }
      }
    );
    let unsubscribeProgress = () => {
    };
    let progressTimer = null;
    const clearProgressTimer = () => {
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = null;
      }
    };
    const progressPromise = new Promise((resolve, reject) => {
      unsubscribeProgress = deps.subscribeToCDPEvent(
        "HeapProfiler.reportHeapSnapshotProgress",
        (params) => {
          if (params.finished === true) {
            reportCompleted = true;
            clearProgressTimer();
            unsubscribeProgress();
            resolve();
          }
        }
      );
      progressTimer = setTimeout(() => {
        unsubscribeProgress();
        reject(
          new CdpEventTimeoutError(
            "HeapProfiler.reportHeapSnapshotProgress",
            HEAP_SNAPSHOT_TIMEOUT_MS,
            "The device accepted takeHeapSnapshot but never reported completion."
          )
        );
      }, HEAP_SNAPSHOT_TIMEOUT_MS);
    });
    try {
      await deps.sendCommand("HeapProfiler.takeHeapSnapshot", {
        reportProgress: true
      });
      if (!reportCompleted) {
        await progressPromise;
      }
      await pendingChunkWrites;
      const artifact = await writer.finalize();
      return createProfileResult("heap-snapshot", startedAt, artifact);
    } catch (error2) {
      await writer.abort();
      throw error2;
    } finally {
      chunkUnsubscribe();
      clearProgressTimer();
      unsubscribeProgress();
      heapSnapshotInProgress = false;
    }
  };
  const startSampling = async (args) => {
    if (samplingState) {
      throw new Error("Heap sampling is already active for this session");
    }
    const input = getRecord(args);
    const samplingInterval = getOptionalNumber(input.samplingInterval);
    const includeObjectsCollectedByMajorGC = getOptionalBoolean(
      input.includeObjectsCollectedByMajorGC
    );
    const includeObjectsCollectedByMinorGC = getOptionalBoolean(
      input.includeObjectsCollectedByMinorGC
    );
    await deps.sendCommand("HeapProfiler.startSampling", {
      ...samplingInterval !== void 0 ? { samplingInterval } : {},
      ...includeObjectsCollectedByMajorGC !== void 0 ? { includeObjectsCollectedByMajorGC } : {},
      ...includeObjectsCollectedByMinorGC !== void 0 ? { includeObjectsCollectedByMinorGC } : {}
    });
    samplingState = {
      startedAt: Date.now(),
      ...samplingInterval !== void 0 ? { samplingInterval } : {},
      ...includeObjectsCollectedByMajorGC !== void 0 ? { includeObjectsCollectedByMajorGC } : {},
      ...includeObjectsCollectedByMinorGC !== void 0 ? { includeObjectsCollectedByMinorGC } : {}
    };
    return {
      started: true,
      sampling: samplingState
    };
  };
  const stopSampling = async (args) => {
    if (!samplingState) {
      throw new Error("No active heap sampling session");
    }
    const input = getRecord(args);
    const startedAt = samplingState.startedAt;
    const writer = await deps.createArtifactWriter(
      "profiles",
      "heapprofile",
      getString(input.nameHint)
    );
    try {
      const result = await deps.sendCommand("HeapProfiler.stopSampling");
      await writer.write(JSON.stringify(result.profile ?? {}, null, 2));
      const artifact = await writer.finalize();
      return createProfileResult("sampling-profile", startedAt, artifact);
    } catch (error2) {
      await writer.abort();
      throw error2;
    } finally {
      samplingState = null;
    }
  };
  return {
    domainId: "memory",
    getTools: () => tools,
    callTool: async (toolName, args) => {
      if (toolName === "takeHeapSnapshot") {
        return takeHeapSnapshot(args);
      }
      if (toolName === "startSampling") {
        return startSampling(args);
      }
      if (toolName === "stopSampling") {
        return stopSampling(args);
      }
      return void 0;
    },
    onDisconnected: () => {
      samplingState = null;
      heapSnapshotInProgress = false;
    },
    dispose: async () => {
      samplingState = null;
      heapSnapshotInProgress = false;
    }
  };
};
const createNetworkDomainService = (deps) => {
  const tools = [
    {
      name: "startRecording",
      description: "Start recording raw CDP network activity for the current session target.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "stopRecording",
      description: "Stop recording network activity without clearing the captured request buffer.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "getRecordingStatus",
      description: "Return network recording state and buffer metadata for the current session.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "listRequests",
      description: "List captured network request summaries with cursor pagination.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: `Maximum number of requests to return. Defaults to ${DEFAULT_DOMAIN_PAGE_LIMIT}, max ${MAX_DOMAIN_PAGE_LIMIT}.`
          },
          cursor: {
            type: "string",
            description: "Opaque pagination cursor from a previous listRequests call."
          }
        }
      },
      pagination: cursorPagination({
        fields: [
          "requestId",
          "method",
          "url",
          "status",
          "type",
          "startTimeMs",
          "endTimeMs",
          "durationMs",
          "transferSize",
          "encodedDataLength",
          "outcome"
        ],
        defaultFields: ["requestId", "method", "url", "status", "durationMs", "outcome"]
      })
    },
    {
      name: "getRequestDetails",
      description: "Return detailed metadata for a captured network request without bodies.",
      inputSchema: {
        type: "object",
        properties: {
          requestId: {
            type: "string",
            description: "Captured CDP requestId to inspect."
          }
        },
        required: ["requestId"]
      }
    },
    {
      name: "getRequestBody",
      description: "Fetch the request body for a captured network request when supported by the target.",
      inputSchema: {
        type: "object",
        properties: {
          requestId: {
            type: "string",
            description: "Captured CDP requestId to inspect."
          }
        },
        required: ["requestId"]
      }
    },
    {
      name: "getResponseBody",
      description: "Fetch the response body for a captured network request when supported by the target.",
      inputSchema: {
        type: "object",
        properties: {
          requestId: {
            type: "string",
            description: "Captured CDP requestId to inspect."
          }
        },
        required: ["requestId"]
      }
    }
  ];
  const state = {
    isRecording: false,
    requestOrder: [],
    requests: /* @__PURE__ */ new Map(),
    totalRecorded: 0,
    evictedCount: 0,
    truncated: false,
    generation: 0,
    unsubscribers: [],
    enabled: false
  };
  const resetCapture = () => {
    state.requestOrder = [];
    state.requests.clear();
    state.totalRecorded = 0;
    state.evictedCount = 0;
    state.truncated = false;
    state.startedAt = void 0;
    state.stoppedAt = void 0;
    state.generation += 1;
  };
  const clearSubscriptions = () => {
    const unsubscribers = state.unsubscribers.splice(0);
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
  const updateTiming = (record) => {
    if (record.startTimeMs !== void 0 && record.endTimeMs !== void 0) {
      record.durationMs = record.endTimeMs - record.startTimeMs;
    }
  };
  const evictOldestIfNeeded = () => {
    while (state.requestOrder.length > NETWORK_BUFFER_CAPACITY) {
      const oldestRequestId = state.requestOrder.shift();
      if (!oldestRequestId) {
        return;
      }
      state.requests.delete(oldestRequestId);
      state.evictedCount += 1;
      state.truncated = true;
    }
  };
  const ensureRecord = (requestId) => {
    const existing = state.requests.get(requestId);
    if (existing) {
      return existing;
    }
    const record = {
      requestId,
      sequence: state.totalRecorded + 1
    };
    state.requests.set(requestId, record);
    state.requestOrder.push(requestId);
    state.totalRecorded += 1;
    evictOldestIfNeeded();
    return record;
  };
  const getRecordById = (requestId) => {
    const record = state.requests.get(requestId);
    if (!record) {
      throw new Error(`Unknown request "${requestId}"`);
    }
    return record;
  };
  const subscribeRecordingEvents = () => {
    clearSubscriptions();
    state.unsubscribers.push(
      deps.subscribeToCDPEvent("Network.requestWillBeSent", (params) => {
        const requestId = getString(params.requestId);
        if (!requestId) {
          return;
        }
        const record = ensureRecord(requestId);
        const request = getOptionalRecord(params.request);
        const redirectResponse = getOptionalRecord(params.redirectResponse);
        if (redirectResponse) {
          const redirectChain = record.redirectChain || [];
          redirectChain.push({
            url: getString(redirectResponse.url),
            status: typeof redirectResponse.status === "number" ? redirectResponse.status : void 0,
            statusText: getString(redirectResponse.statusText)
          });
          record.redirectChain = redirectChain;
        }
        record.url = getString(request?.url) || getString(params.documentURL) || record.url;
        record.method = getString(request?.method) || record.method;
        record.type = getString(params.type) || record.type;
        record.startTimeMs = toMilliseconds(params.timestamp) ?? record.startTimeMs;
        record.wallTimeMs = toMilliseconds(params.wallTime) ?? record.wallTimeMs;
        record.initiator = params.initiator ?? record.initiator;
        record.priority = getString(request?.initialPriority) || record.priority;
        record.request = {
          url: getString(request?.url),
          method: getString(request?.method),
          headers: getOptionalRecord(request?.headers),
          mixedContentType: getString(request?.mixedContentType),
          initialPriority: getString(request?.initialPriority),
          referrerPolicy: getString(request?.referrerPolicy),
          isSameSite: getOptionalBoolean(request?.isSameSite),
          postDataEntries: Array.isArray(request?.postDataEntries) ? request?.postDataEntries : void 0,
          hasPostData: request ? Boolean(request.hasPostData) : record.request?.hasPostData
        };
      }),
      deps.subscribeToCDPEvent("Network.requestWillBeSentExtraInfo", (params) => {
        const requestId = getString(params.requestId);
        if (!requestId) {
          return;
        }
        const record = ensureRecord(requestId);
        record.requestHeadersExtra = getOptionalRecord(params.headers) || record.requestHeadersExtra;
        record.requestAssociatedCookies = Array.isArray(params.associatedCookies) ? params.associatedCookies : record.requestAssociatedCookies;
      }),
      deps.subscribeToCDPEvent("Network.responseReceived", (params) => {
        const requestId = getString(params.requestId);
        if (!requestId) {
          return;
        }
        const record = ensureRecord(requestId);
        const response = getOptionalRecord(params.response);
        record.type = getString(params.type) || record.type;
        record.status = typeof response?.status === "number" ? response.status : record.status;
        record.statusText = getString(response?.statusText) || record.statusText;
        record.mimeType = getString(response?.mimeType) || record.mimeType;
        record.protocol = getString(response?.protocol) || record.protocol;
        record.remoteIPAddress = getString(response?.remoteIPAddress) || record.remoteIPAddress;
        record.remotePort = getOptionalNumber(response?.remotePort) || record.remotePort;
        record.fromDiskCache = getOptionalBoolean(response?.fromDiskCache) ?? record.fromDiskCache;
        record.fromMemoryCache = getOptionalBoolean(response?.fromMemoryCache) ?? record.fromMemoryCache;
        record.fromPrefetchCache = getOptionalBoolean(response?.fromPrefetchCache) ?? record.fromPrefetchCache;
        record.encodedDataLength = getOptionalNumber(response?.encodedDataLength) ?? record.encodedDataLength;
        record.response = {
          url: getString(response?.url),
          status: typeof response?.status === "number" ? response.status : void 0,
          statusText: getString(response?.statusText),
          headers: getOptionalRecord(response?.headers),
          mimeType: getString(response?.mimeType),
          protocol: getString(response?.protocol),
          securityState: getString(response?.securityState),
          connectionReused: getOptionalBoolean(response?.connectionReused),
          connectionId: getOptionalNumber(response?.connectionId),
          encodedDataLength: getOptionalNumber(response?.encodedDataLength),
          fromDiskCache: getOptionalBoolean(response?.fromDiskCache),
          fromServiceWorker: getOptionalBoolean(response?.fromServiceWorker),
          fromPrefetchCache: getOptionalBoolean(response?.fromPrefetchCache),
          timing: response?.timing,
          responseTime: getOptionalNumber(response?.responseTime),
          cacheStorageCacheName: getString(response?.cacheStorageCacheName)
        };
      }),
      deps.subscribeToCDPEvent("Network.responseReceivedExtraInfo", (params) => {
        const requestId = getString(params.requestId);
        if (!requestId) {
          return;
        }
        const record = ensureRecord(requestId);
        record.responseHeadersExtra = getOptionalRecord(params.headers) || record.responseHeadersExtra;
        record.responseBlockedCookies = Array.isArray(params.blockedCookies) ? params.blockedCookies : record.responseBlockedCookies;
      }),
      deps.subscribeToCDPEvent("Network.requestServedFromCache", (params) => {
        const requestId = getString(params.requestId);
        if (!requestId) {
          return;
        }
        const record = ensureRecord(requestId);
        record.servedFromCache = true;
      }),
      deps.subscribeToCDPEvent("Network.loadingFinished", (params) => {
        const requestId = getString(params.requestId);
        if (!requestId) {
          return;
        }
        const record = ensureRecord(requestId);
        record.loadingFinished = true;
        record.loadingFailed = false;
        record.endTimeMs = toMilliseconds(params.timestamp) ?? record.endTimeMs;
        record.encodedDataLength = getOptionalNumber(params.encodedDataLength) ?? record.encodedDataLength;
        record.transferSize = getOptionalNumber(params.encodedDataLength) ?? record.transferSize;
        updateTiming(record);
      }),
      deps.subscribeToCDPEvent("Network.loadingFailed", (params) => {
        const requestId = getString(params.requestId);
        if (!requestId) {
          return;
        }
        const record = ensureRecord(requestId);
        record.loadingFinished = false;
        record.loadingFailed = true;
        record.endTimeMs = toMilliseconds(params.timestamp) ?? record.endTimeMs;
        record.failureText = getString(params.errorText) || record.failureText;
        record.blockedReason = getString(params.blockedReason) || record.blockedReason;
        record.corsErrorStatus = params.corsErrorStatus ?? record.corsErrorStatus;
        updateTiming(record);
      })
    );
  };
  const startRecording = async () => {
    if (state.isRecording) {
      throw new Error("Network recording is already active for this session");
    }
    resetCapture();
    if (!state.enabled) {
      await deps.sendCommand("Network.enable");
      state.enabled = true;
    }
    state.isRecording = true;
    state.startedAt = Date.now();
    subscribeRecordingEvents();
    return {
      started: true,
      ...createNetworkStatus(state)
    };
  };
  const stopRecording = async () => {
    if (!state.isRecording) {
      throw new Error("No active network recording for this session");
    }
    clearSubscriptions();
    state.isRecording = false;
    state.stoppedAt = Date.now();
    return {
      stopped: true,
      ...createNetworkStatus(state)
    };
  };
  const getRecordingStatus = async () => {
    return createNetworkStatus(state);
  };
  const listRequests = async (args) => {
    const input = getRecord(args);
    const limit = Math.min(
      getOptionalPositiveInteger(input.limit) ?? DEFAULT_DOMAIN_PAGE_LIMIT,
      MAX_DOMAIN_PAGE_LIMIT
    );
    const cursor = getString(input.cursor);
    const rows = state.requestOrder.map((requestId) => state.requests.get(requestId)).filter((record) => Boolean(record)).reverse().map(createNetworkSummary);
    const page = paginateRows(rows, {
      scope: "network:requests",
      limit,
      cursor,
      generation: state.generation
    });
    return {
      ...createNetworkStatus(state),
      items: page.items,
      page: page.page
    };
  };
  const getRequestDetails = async (args) => {
    const input = getRecord(args);
    const requestId = getString(input.requestId);
    if (!requestId) {
      throw new Error('"requestId" is required');
    }
    const record = getRecordById(requestId);
    return {
      ...createNetworkStatus(state),
      request: {
        requestId: record.requestId,
        method: record.method || record.request?.method || null,
        url: record.url || record.request?.url || null,
        type: record.type ?? null,
        priority: record.priority ?? null,
        initiator: record.initiator ?? null,
        startTimeMs: record.startTimeMs ?? null,
        wallTimeMs: record.wallTimeMs ?? null,
        endTimeMs: record.endTimeMs ?? null,
        durationMs: record.durationMs ?? null,
        request: record.request ?? null,
        requestHeadersExtra: record.requestHeadersExtra ?? null,
        requestAssociatedCookies: record.requestAssociatedCookies ?? null,
        response: record.response ?? null,
        responseHeadersExtra: record.responseHeadersExtra ?? null,
        responseBlockedCookies: record.responseBlockedCookies ?? null,
        redirectChain: record.redirectChain ?? [],
        servedFromCache: record.servedFromCache ?? false,
        loadingFinished: record.loadingFinished ?? false,
        loadingFailed: record.loadingFailed ?? false,
        failureText: record.failureText ?? null,
        blockedReason: record.blockedReason ?? null,
        corsErrorStatus: record.corsErrorStatus ?? null
      }
    };
  };
  const getRequestBody = async (args) => {
    const input = getRecord(args);
    const requestId = getString(input.requestId);
    if (!requestId) {
      throw new Error('"requestId" is required');
    }
    const record = getRecordById(requestId);
    if (!record.request?.hasPostData) {
      return {
        requestId,
        available: false,
        reason: "No request body is available for this request."
      };
    }
    try {
      const response = await deps.sendCommand("Network.getRequestPostData", {
        requestId
      });
      const result = getCDPCommandResult(response);
      const body = getString(result.postData);
      if (!body) {
        return {
          requestId,
          available: false,
          reason: "The target returned no request body for this request."
        };
      }
      return {
        requestId,
        available: true,
        body,
        base64Encoded: false
      };
    } catch (error2) {
      return {
        requestId,
        available: false,
        reason: getErrorMessage(error2)
      };
    }
  };
  const getResponseBody = async (args) => {
    const input = getRecord(args);
    const requestId = getString(input.requestId);
    if (!requestId) {
      throw new Error('"requestId" is required');
    }
    const record = getRecordById(requestId);
    if (record.loadingFailed) {
      return {
        requestId,
        available: false,
        reason: "Response body is unavailable because the request failed."
      };
    }
    if (!record.loadingFinished) {
      return {
        requestId,
        available: false,
        reason: "Response body is unavailable until the request finishes loading."
      };
    }
    try {
      const response = await deps.sendCommand("Network.getResponseBody", {
        requestId
      });
      const result = getCDPCommandResult(response);
      const body = getString(result.body);
      const base64Encoded = getOptionalBoolean(result.base64Encoded) ?? false;
      const mimeType = record.response?.mimeType || record.mimeType;
      if (body === void 0) {
        return {
          requestId,
          available: false,
          reason: "The target returned no response body for this request."
        };
      }
      if (base64Encoded && isTextLikeMimeType(mimeType)) {
        try {
          return {
            requestId,
            available: true,
            body: Buffer.from(body, "base64").toString("utf8"),
            base64Encoded: false,
            decoded: true,
            mimeType
          };
        } catch (error2) {
          return {
            requestId,
            available: false,
            reason: `Failed to decode base64 response body: ${getErrorMessage(error2)}`
          };
        }
      }
      return {
        requestId,
        available: true,
        body,
        base64Encoded,
        decoded: false,
        mimeType
      };
    } catch (error2) {
      return {
        requestId,
        available: false,
        reason: getErrorMessage(error2)
      };
    }
  };
  return {
    domainId: "network",
    getTools: () => tools,
    callTool: async (toolName, args) => {
      if (toolName === "startRecording") {
        return startRecording();
      }
      if (toolName === "stopRecording") {
        return stopRecording();
      }
      if (toolName === "getRecordingStatus") {
        return getRecordingStatus();
      }
      if (toolName === "listRequests") {
        return listRequests(args);
      }
      if (toolName === "getRequestDetails") {
        return getRequestDetails(args);
      }
      if (toolName === "getRequestBody") {
        return getRequestBody(args);
      }
      if (toolName === "getResponseBody") {
        return getResponseBody(args);
      }
      return void 0;
    },
    onDisconnected: () => {
      clearSubscriptions();
      state.isRecording = false;
      state.enabled = false;
      resetCapture();
    },
    dispose: async () => {
      clearSubscriptions();
      if (state.enabled) {
        try {
          await deps.sendCommand("Network.disable");
        } catch {
        }
      }
      state.isRecording = false;
      state.enabled = false;
    }
  };
};
const EXPO_DEBUGGER_TIMEOUT_MS = 2e3;
const formatHost = (host) => host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
const getDebuggerWebSocketOrigin = (webSocketDebuggerUrl) => {
  const url = new URL(webSocketDebuggerUrl);
  const protocol = url.protocol === "wss:" ? "https:" : "http:";
  return `${protocol}//${url.host}`;
};
const requestExpoInspectorApp = (host, port, appId) => {
  const url = new URL(`http://${formatHost(host)}:${port}/_expo/debugger`);
  url.searchParams.set("appId", appId);
  return new Promise((resolve) => {
    const req = node_http.request(url, { method: "GET" }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.setTimeout(EXPO_DEBUGGER_TIMEOUT_MS, () => req.destroy());
    req.once("error", () => resolve(null));
    req.end();
  });
};
const fetchExpoDebuggerOrigin = async (host, port, appId) => {
  if (!appId) {
    return null;
  }
  const app = await requestExpoInspectorApp(host, port, appId);
  if (!app || typeof app.webSocketDebuggerUrl !== "string") {
    return null;
  }
  try {
    return getDebuggerWebSocketOrigin(app.webSocketDebuggerUrl);
  } catch {
    return null;
  }
};
const resolveDebuggerOrigin = async (options) => {
  const expoOrigin = await fetchExpoDebuggerOrigin(options.host, options.port, options.appId);
  return expoOrigin ?? getDebuggerWebSocketOrigin(options.webSocketDebuggerUrl);
};
const RUNTIME_GLOBAL = "__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__";
const MAIN_EXECUTION_CONTEXT_NAME = "main";
const BOOTSTRAP_DELAY_MS = 500;
const DISPATCHER_INIT_MAX_ATTEMPTS = 20;
const DISPATCHER_INIT_RETRY_MS = 250;
const PLUGIN_READINESS_QUIET_WINDOW_MS = 50;
const PLUGIN_READINESS_MAX_WAIT_MS = 250;
const RECOVERY_RETRY_DELAY_MS = 500;
const RECOVERY_MAX_ATTEMPTS = 16;
const MAX_QUEUED_DOMAIN_MESSAGES = 1e3;
const RECOVERABLE_CLOSE_REASONS = /* @__PURE__ */ new Set([
  "[RECREATING_DEVICE]",
  "[PAGE_NOT_FOUND]",
  "[CONNECTION_LOST]"
]);
const DEVTOOLS_TOOK_CONNECTION_REASON = "[NEW_DEBUGGER_OPENED]";
const getCloseReason = (reason) => Buffer.isBuffer(reason) ? reason.toString() : String(reason ?? "");
const markPromiseAsHandled = (promise) => {
  void promise.catch(() => void 0);
  return promise;
};
const getToolCount = (target, handler, services) => {
  const localToolCount = services.reduce((count, service) => count + service.getTools().length, 0);
  return handler.getTools(target.id).length + localToolCount;
};
const createAgentSession = (options) => {
  let target = options.target;
  const integration = options.integration ?? DEFAULT_AGENT_TARGET_INTEGRATION;
  const capabilityProfile = resolveCapabilityProfile(integration);
  const handler = createAgentMessageHandler();
  const artifacts = createAgentArtifacts(options.projectRoot, options.target.id);
  const tap = createTapEmitter();
  const createdAt = Date.now();
  let lastActivityAt = createdAt;
  let connectedAt;
  let lastError;
  let status = "connecting";
  let ws = null;
  let stopped = false;
  let nextCommandId = 1;
  let bootstrapTimer = null;
  let bindingName = null;
  let bootstrapped = false;
  let terminationNotified = false;
  let disconnectLogged = false;
  let startReadiness = null;
  let pluginReadiness = null;
  let recoveryPromise = null;
  let connectionGeneration = 0;
  let socketAttempt = 0;
  let activeSocketAttempt = 0;
  let expectedPluginToolNames = /* @__PURE__ */ new Set();
  let pluginReadinessSatisfied = false;
  let healing;
  const activeAccumulatedDomains = /* @__PURE__ */ new Map();
  const lostAccumulatedDomains = /* @__PURE__ */ new Map();
  const pendingCommands = /* @__PURE__ */ new Map();
  const cdpEventListeners = /* @__PURE__ */ new Map();
  const notifyTerminated = () => {
    if (terminationNotified) {
      return;
    }
    terminationNotified = true;
    options.onTerminated?.(options.target.id);
  };
  const getSessionInfoFields = () => ({
    sessionId: options.target.id,
    pageId: target.pageId,
    deviceId: options.target.id
  });
  const subscribeToCDPEvent = (method, listener) => {
    const listeners = cdpEventListeners.get(method) || /* @__PURE__ */ new Set();
    listeners.add(listener);
    cdpEventListeners.set(method, listeners);
    return () => {
      const current = cdpEventListeners.get(method);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        cdpEventListeners.delete(method);
      }
    };
  };
  const touch = () => {
    lastActivityAt = Date.now();
  };
  const clearPluginReadiness = () => {
    if (!pluginReadiness) {
      return;
    }
    if (pluginReadiness.quietTimer) {
      clearTimeout(pluginReadiness.quietTimer);
    }
    if (pluginReadiness.timeoutTimer) {
      clearTimeout(pluginReadiness.timeoutTimer);
    }
    pluginReadiness = null;
  };
  const createStartReadiness = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = () => {
        clearPluginReadiness();
        startReadiness = null;
        resolvePromise();
      };
      reject = (error2) => {
        clearPluginReadiness();
        startReadiness = null;
        rejectPromise(error2);
      };
    });
    startReadiness = {
      promise,
      resolve,
      reject
    };
    return promise;
  };
  const resolveStartReadiness = () => {
    if (!stopped && bootstrapped) {
      status = "connected";
    }
    startReadiness?.resolve();
  };
  const rejectStartReadiness = (error2) => {
    startReadiness?.reject(error2);
  };
  const schedulePluginReadinessQuietTimer = () => {
    if (!pluginReadiness) {
      return;
    }
    if (pluginReadiness.quietTimer) {
      clearTimeout(pluginReadiness.quietTimer);
    }
    pluginReadiness.quietTimer = setTimeout(() => {
      pluginReadinessSatisfied = true;
      if (bootstrapped) {
        resolveStartReadiness();
      }
    }, PLUGIN_READINESS_QUIET_WINDOW_MS);
  };
  const beginPluginReadinessWait = () => {
    if (!startReadiness) {
      return;
    }
    clearPluginReadiness();
    pluginReadinessSatisfied = false;
    if (expectedPluginToolNames.size === 0) {
      pluginReadinessSatisfied = true;
      return;
    }
    pluginReadiness = {
      quietTimer: null,
      timeoutTimer: setTimeout(() => {
        rejectStartReadiness(
          new Error("Plugin tools did not re-register after the agent session became ready")
        );
      }, PLUGIN_READINESS_MAX_WAIT_MS)
    };
  };
  const notePluginReadinessActivity = () => {
    if (!pluginReadiness) {
      return;
    }
    const registeredToolNames = new Set(
      handler.getRegisteredPluginTools(options.target.id).map((tool) => tool.name)
    );
    if (Array.from(expectedPluginToolNames).every((name2) => registeredToolNames.has(name2))) {
      schedulePluginReadinessQuietTimer();
    }
  };
  const isCurrentGeneration = (generation) => !stopped && generation === connectionGeneration;
  const emitCDPEvent = (method, params) => {
    const listeners = cdpEventListeners.get(method);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      void listener(params);
    }
  };
  const sendCommand = (method, params) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return markPromiseAsHandled(Promise.reject(new Error("CDP websocket is not connected")));
    }
    const commandId = nextCommandId++;
    const payload = JSON.stringify({ id: commandId, method, params });
    touch();
    const promise = new Promise((resolve, reject) => {
      pendingCommands.set(commandId, { method, resolve, reject });
      ws.send(payload, (error2) => {
        if (!error2) {
          return;
        }
        pendingCommands.delete(commandId);
        reject(error2);
      });
    });
    return markPromiseAsHandled(promise);
  };
  const localServices = [
    createReactDomainService({
      sessionId: options.target.id,
      sendReactDevToolsMessage: (message) => {
        void sendDomainMessage("react-devtools", message);
      }
    }),
    createPerformanceDomainService({
      getSessionInfo: getSessionInfoFields,
      sendCommand,
      subscribeToCDPEvent,
      createArtifactWriter: artifacts.createWriter
    }),
    createMemoryDomainService({
      getSessionInfo: getSessionInfoFields,
      sendCommand,
      subscribeToCDPEvent,
      createArtifactWriter: artifacts.createWriter
    }),
    createNetworkDomainService({
      getSessionInfo: getSessionInfoFields,
      sendCommand,
      subscribeToCDPEvent
    })
  ].map((service) => withCapabilityFilter(service, capabilityProfile));
  const clearBootstrapTimer = () => {
    if (!bootstrapTimer) {
      return;
    }
    clearTimeout(bootstrapTimer);
    bootstrapTimer = null;
  };
  const scheduleBootstrap = () => {
    clearBootstrapTimer();
    bootstrapTimer = setTimeout(() => {
      void bootstrap();
    }, BOOTSTRAP_DELAY_MS);
  };
  const readyDomains = /* @__PURE__ */ new Set();
  let queuedDomainMessages = [];
  const evaluateDomainMessage = (domain, message) => {
    const serializedMessage = JSON.stringify(message);
    const escapedMessage = JSON.stringify(serializedMessage);
    return markPromiseAsHandled(
      sendCommand("Runtime.evaluate", {
        expression: `void (() => { try { ${RUNTIME_GLOBAL}.sendMessage(${JSON.stringify(domain)}, ${escapedMessage}); } catch (e) {} })()`
      }).then(() => void 0)
    );
  };
  const sendDomainMessage = (domain, message) => {
    if (!readyDomains.has(domain)) {
      queuedDomainMessages.push([domain, message]);
      if (queuedDomainMessages.length > MAX_QUEUED_DOMAIN_MESSAGES) {
        queuedDomainMessages.shift();
      }
      return Promise.resolve();
    }
    return evaluateDomainMessage(domain, message);
  };
  const resetDomains = () => {
    readyDomains.clear();
    queuedDomainMessages = [];
  };
  const sendAgentSessionReady = async () => {
    const message = {
      type: "agent-session-ready",
      payload: {
        sessionId: options.target.id
      }
    };
    await sendDomainMessage("rozenite", {
      pluginId: AGENT_PLUGIN_ID,
      type: message.type,
      payload: message.payload
    });
  };
  const logConnected = () => {
    logger.info(
      `Rozenite for Agents connected to device ${options.target.name} (${options.target.id}).`
    );
    if (options.cliVersion && options.metroVersion && options.cliVersion !== options.metroVersion) {
      logger.warn(
        `Connected Rozenite agent uses version ${options.cliVersion}, but Metro is running version ${options.metroVersion}. Integration may not work correctly.`
      );
    }
    disconnectLogged = false;
  };
  const logDisconnected = () => {
    if (disconnectLogged || connectedAt === void 0) {
      return;
    }
    logger.info(
      `Rozenite for Agents disconnected from device ${options.target.name} (${options.target.id}).`
    );
    disconnectLogged = true;
  };
  const evaluateRuntime = async (expression, returnByValue = false) => {
    return await sendCommand("Runtime.evaluate", {
      expression,
      ...returnByValue ? { returnByValue } : {}
    });
  };
  const waitForFuseboxDispatcherToBeInitialized = async (attempt = 1) => {
    if (attempt >= DISPATCHER_INIT_MAX_ATTEMPTS) {
      throw new Error("Failed to wait for initialization: it took too long");
    }
    const response = await evaluateRuntime(`globalThis.${RUNTIME_GLOBAL} != undefined`, true);
    if (response.exceptionDetails) {
      throw new Error(
        "Failed to wait for React DevTools dispatcher initialization: " + response.exceptionDetails.text
      );
    }
    if (response.result?.value === false) {
      await new Promise((resolve) => {
        setTimeout(resolve, DISPATCHER_INIT_RETRY_MS);
      });
      return waitForFuseboxDispatcherToBeInitialized(attempt + 1);
    }
  };
  const initializeRuntimeDomain = async (domain) => {
    const response = await evaluateRuntime(
      `(() => { try { ${RUNTIME_GLOBAL}.initializeDomain(${JSON.stringify(domain)}); return true; } catch (e) { return String(e && e.message || e); } })()`,
      true
    );
    if (response.result?.value !== true) {
      throw new Error(
        `Failed to initialize the ${domain} domain: ${String(response.result?.value ?? response.exceptionDetails?.text)}`
      );
    }
    readyDomains.add(domain);
    const flushed = queuedDomainMessages.filter(([queuedDomain]) => queuedDomain === domain);
    queuedDomainMessages = queuedDomainMessages.filter(([queuedDomain]) => queuedDomain !== domain);
    for (const [, queuedMessage] of flushed) {
      void evaluateDomainMessage(domain, queuedMessage);
    }
  };
  const getBindingName = async () => {
    const response = await evaluateRuntime(`${RUNTIME_GLOBAL}.BINDING_NAME`);
    if (response.exceptionDetails) {
      throw new Error(
        "Failed to get binding name for Agent session on a global: " + response.exceptionDetails.text
      );
    }
    const bindingValue = response.result?.value;
    if (bindingValue === null || bindingValue === void 0) {
      throw new Error(
        "Failed to get binding name for Agent session on a global: returned value is " + String(bindingValue)
      );
    }
    if (bindingValue === "") {
      throw new Error(
        "Failed to get binding name for ReactDevToolsBindingsModel on a global: returned value is an empty string"
      );
    }
    if (typeof bindingValue !== "string") {
      throw new Error(
        "Failed to get binding name for Agent session on a global: returned value is not a string"
      );
    }
    return bindingValue;
  };
  const bootstrap = async () => {
    if (stopped || !ws || ws.readyState !== WebSocket.OPEN || bootstrapped) {
      return;
    }
    try {
      await waitForFuseboxDispatcherToBeInitialized();
      const bindingValue = await getBindingName();
      if (bindingName !== bindingValue) {
        await sendCommand("Runtime.addBinding", { name: bindingValue });
        bindingName = bindingValue;
      }
      await initializeRuntimeDomain("rozenite");
      beginPluginReadinessWait();
      await sendAgentSessionReady();
      await initializeRuntimeDomain("react-devtools");
      bootstrapped = true;
      if (pluginReadinessSatisfied) {
        resolveStartReadiness();
      }
      lastError = void 0;
      touch();
    } catch (error2) {
      lastError = error2 instanceof Error ? error2.message : String(error2);
      scheduleBootstrap();
    }
  };
  const disposeServices = async () => {
    await Promise.all(localServices.map((service) => service.dispose()));
  };
  const rememberLostAccumulatedState = () => {
    for (const [toolName, domain] of activeAccumulatedDomains) {
      lostAccumulatedDomains.set(toolName, domain);
    }
    activeAccumulatedDomains.clear();
  };
  const waitForRecoveryTarget = async (generation) => {
    if (!options.resolveTarget) {
      throw new Error("This session cannot resolve a fresh Metro target");
    }
    let lastRecoveryError;
    for (let attempt = 1; attempt <= RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      if (!isCurrentGeneration(generation)) {
        throw new Error("Agent session recovery was cancelled");
      }
      try {
        const resolvedTarget = await options.resolveTarget(options.target.id);
        if (!isCurrentGeneration(generation)) {
          throw new Error("Agent session recovery was cancelled");
        }
        return resolvedTarget;
      } catch (error2) {
        lastRecoveryError = error2;
        if (attempt < RECOVERY_MAX_ATTEMPTS) {
          await new Promise((resolve) => {
            setTimeout(resolve, RECOVERY_RETRY_DELAY_MS);
          });
        }
      }
    }
    throw lastRecoveryError instanceof Error ? lastRecoveryError : new Error("The app did not reconnect to Metro");
  };
  const teardownConnection = () => {
    bindingName = null;
    bootstrapped = false;
    resetDomains();
    connectedAt = void 0;
    rejectStartReadiness(new Error("CDP connection closed before bootstrap completed"));
    handler.disconnectDevice(options.target.id);
    for (const service of localServices) {
      service.onDisconnected();
    }
    for (const [commandId, pending] of pendingCommands.entries()) {
      pendingCommands.delete(commandId);
      pending.reject(new Error("CDP connection closed"));
    }
    clearBootstrapTimer();
    clearPluginReadiness();
  };
  const recover = async (reason, generation) => {
    status = "connecting";
    try {
      let connected = false;
      let lastConnectError;
      for (let attempt = 1; attempt <= 2 && !connected; attempt += 1) {
        try {
          target = await waitForRecoveryTarget(generation);
          const readinessPromise = createStartReadiness();
          void readinessPromise.catch(() => void 0);
          await connect(generation);
          await readinessPromise;
          if (!isCurrentGeneration(generation)) {
            throw new Error("Agent session recovery was cancelled");
          }
          connected = true;
        } catch (error2) {
          lastConnectError = error2;
          if (!isCurrentGeneration(generation)) {
            return;
          }
          const failedSocket = ws;
          if (failedSocket && failedSocket.readyState !== WebSocket.CLOSED) {
            teardownConnection();
            activeSocketAttempt += 1;
            ws = null;
            await new Promise((resolve) => {
              const timeout = setTimeout(resolve, 250);
              failedSocket.once("close", () => {
                clearTimeout(timeout);
                resolve();
              });
              failedSocket.close();
            });
          }
          if (attempt === 2) {
            throw error2;
          }
          await new Promise((resolve) => {
            setTimeout(resolve, RECOVERY_RETRY_DELAY_MS);
          });
        }
      }
      if (!connected) {
        throw lastConnectError;
      }
      if (!isCurrentGeneration(generation)) {
        return;
      }
      healing = {
        outcome: "recovered",
        message: lostAccumulatedDomains.size > 0 ? `Reconnected after ${reason}. Accumulated state was lost for: ${Array.from(lostAccumulatedDomains.values()).join(", ")}.` : `Reconnected after ${reason}.`,
        at: Date.now()
      };
    } catch (error2) {
      if (!isCurrentGeneration(generation)) {
        return;
      }
      const message = error2 instanceof Error ? error2.message : String(error2);
      lastError = message;
      healing = { outcome: "failed", message, at: Date.now() };
      status = "stopped";
      stopped = true;
      await disposeServices();
      notifyTerminated();
    } finally {
      if (generation === connectionGeneration) {
        recoveryPromise = null;
      }
    }
  };
  const handleSocketClosed = (reason, generation) => {
    if (generation !== connectionGeneration) {
      return;
    }
    logDisconnected();
    bindingName = null;
    bootstrapped = false;
    resetDomains();
    connectedAt = void 0;
    rejectStartReadiness(new Error("CDP connection closed before bootstrap completed"));
    const previousPluginToolNames = new Set(
      handler.getRegisteredPluginTools(options.target.id).map((tool) => tool.name)
    );
    handler.disconnectDevice(options.target.id);
    for (const service of localServices) {
      service.onDisconnected();
    }
    for (const [commandId, pending] of pendingCommands.entries()) {
      pendingCommands.delete(commandId);
      pending.reject(new Error("CDP connection closed"));
    }
    clearBootstrapTimer();
    clearPluginReadiness();
    if (stopped) {
      status = "stopped";
      notifyTerminated();
      return;
    }
    if (reason.includes(DEVTOOLS_TOOK_CONNECTION_REASON)) {
      status = "stopped";
      stopped = true;
      const message = "React Native DevTools took the connection — close it and retry.";
      lastError = message;
      healing = { outcome: "blocked", message, at: Date.now() };
      void disposeServices().finally(() => {
        notifyTerminated();
      });
      return;
    }
    const recoveryReason = Array.from(RECOVERABLE_CLOSE_REASONS).find(
      (candidate) => reason.includes(candidate)
    );
    if (recoveryReason) {
      expectedPluginToolNames = previousPluginToolNames;
      rememberLostAccumulatedState();
      recoveryPromise ??= recover(recoveryReason, generation);
      return;
    }
    status = "stopped";
    stopped = true;
    void disposeServices().finally(() => notifyTerminated());
  };
  const handleSocketMessage = (rawMessage) => {
    touch();
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }
    if (typeof message.id === "number") {
      const pending = pendingCommands.get(message.id);
      if (!pending) {
        return;
      }
      pendingCommands.delete(message.id);
      if (message.error) {
        pending.reject(createCDPCommandError(pending.method, message.error));
        return;
      }
      pending.resolve(
        message.result && typeof message.result === "object" && !Array.isArray(message.result) ? message.result : {}
      );
      return;
    }
    if (typeof message.method === "string") {
      emitCDPEvent(message.method, message.params || {});
    }
    if (message.method === "Runtime.executionContextCreated" && message.params?.context?.name === MAIN_EXECUTION_CONTEXT_NAME) {
      bootstrapped = false;
      readyDomains.clear();
      scheduleBootstrap();
    }
    if (message.method === "Runtime.executionContextsCleared") {
      bootstrapped = false;
      readyDomains.clear();
      scheduleBootstrap();
    }
    const consoleMessage = extractConsoleMessage(message);
    if (consoleMessage) {
      handler.captureConsoleMessage(options.target.id, consoleMessage);
    }
    const bindingPayload = parseRozeniteBindingPayload(message);
    if (!bindingPayload) {
      return;
    }
    logger.debug("Received Rozenite binding payload.", bindingPayload);
    if (bindingPayload.domain === "rozenite") {
      if (!bindingPayload.message || typeof bindingPayload.message !== "object") {
        return;
      }
      const devToolsMessage = bindingPayload.message;
      if (isDevToolsPluginMessage(devToolsMessage)) {
        tap.emit("in", devToolsMessage);
      }
      handler.handleDeviceMessage(options.target.id, devToolsMessage);
      if (devToolsMessage.type === "register-tool") {
        notePluginReadinessActivity();
      }
    } else if (bindingPayload.domain === "react-devtools") {
      for (const service of localServices) {
        if (service.captureReactDevToolsMessage) {
          void service.captureReactDevToolsMessage(bindingPayload.message);
        }
      }
    }
  };
  const connect = async (generation = connectionGeneration) => {
    status = "connecting";
    const origin = await resolveDebuggerOrigin({
      host: options.host,
      port: options.port,
      appId: target.appId,
      webSocketDebuggerUrl: target.webSocketDebuggerUrl
    });
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(target.webSocketDebuggerUrl, {
        headers: {
          Origin: origin
        }
      });
      let settled = false;
      const attempt = ++socketAttempt;
      activeSocketAttempt = attempt;
      ws = socket;
      socket.once("open", () => {
        if (!isCurrentGeneration(generation) || ws !== socket || activeSocketAttempt !== attempt) {
          socket.close();
          return;
        }
        settled = true;
        status = "connecting";
        connectedAt = Date.now();
        lastError = void 0;
        touch();
        handler.connectDevice(options.target.id, options.target.name, {
          sendMessage: (message) => {
            if (isDevToolsPluginMessage(message)) {
              tap.emit("out", message);
            }
            void sendDomainMessage("rozenite", message);
          }
        });
        logConnected();
        void (async () => {
          try {
            await sendCommand("ReactNativeApplication.enable");
            await sendCommand("Runtime.enable");
            scheduleBootstrap();
            resolve();
          } catch (error2) {
            const startupError = socket.readyState === WebSocket.CLOSED && !bootstrapped ? new Error("CDP connection closed before bootstrap completed") : error2 instanceof Error ? error2 : new Error(String(error2));
            lastError = startupError.message;
            clearBootstrapTimer();
            rejectStartReadiness(startupError);
            socket.close();
            reject(startupError);
          }
        })();
      });
      socket.on("message", (rawMessage) => {
        if (generation !== connectionGeneration || ws !== socket || activeSocketAttempt !== attempt) {
          return;
        }
        handleSocketMessage(String(rawMessage));
      });
      socket.once("error", (error2) => {
        if (generation !== connectionGeneration || ws !== socket || activeSocketAttempt !== attempt) {
          return;
        }
        lastError = error2 instanceof Error ? error2.message : String(error2);
        if (!settled) {
          reject(error2);
        }
      });
      socket.once("close", (_code, reason) => {
        if (ws !== socket || activeSocketAttempt !== attempt) return;
        ws = null;
        handleSocketClosed(getCloseReason(reason), generation);
        if (!settled) {
          reject(new Error("CDP websocket closed before session initialization"));
        }
      });
    });
  };
  const getInfo = () => ({
    id: options.target.id,
    host: options.host,
    port: options.port,
    deviceId: options.target.id,
    deviceName: target.name,
    appId: target.appId,
    pageId: target.pageId,
    status,
    integration,
    createdAt,
    lastActivityAt,
    ...connectedAt ? { connectedAt } : {},
    ...lastError ? { lastError } : {},
    ...healing ? { healing } : {},
    toolCount: getToolCount(target, handler, localServices)
  });
  const getTools = () => {
    return [
      ...handler.getTools(options.target.id),
      ...localServices.flatMap((service) => service.getTools())
    ];
  };
  const getIntegration = () => integration;
  const getUnsupportedDomainInfo = () => getUnsupportedDomains(capabilityProfile);
  const subscribeTap = tap.subscribe;
  const sendTapMessage = async (message) => {
    if (status !== "connected") {
      throw new Error(`Session "${options.target.id}" is not connected to a device`);
    }
    tap.emit("out", message);
    await sendDomainMessage("rozenite", message);
  };
  const callTool = async (toolName, args) => {
    if (status !== "connected") {
      const recovery = recoveryPromise;
      if (recovery && ["getTree", "getMessages", "listRequests"].includes(toolName)) {
        await recovery;
        return await callTool(toolName, args);
      }
      throw new Error(`Session "${options.target.id}" is not connected to a device`);
    }
    const lostDomain = lostAccumulatedDomains.get(toolName);
    if (lostDomain) {
      lostAccumulatedDomains.delete(toolName);
      throw new Error(
        `AGENT_SESSION_STATE_LOST: ${lostDomain} was lost while the app relaunched. Retry this operation to collect new state.`
      );
    }
    touch();
    const trackSuccessfulToolCall = () => {
      const startedBy = /* @__PURE__ */ new Map([
        ["startProfiling", ["stopProfiling", "profiling data"]],
        ["startRecording", ["stopRecording", "network recording"]],
        ["startTrace", ["stopTrace", "performance trace"]],
        ["startSampling", ["stopSampling", "memory sampling"]]
      ]);
      const started = startedBy.get(toolName);
      if (started) {
        activeAccumulatedDomains.set(started[0], started[1]);
      }
      if (["stopProfiling", "stopRecording", "stopTrace", "stopSampling"].includes(toolName)) {
        activeAccumulatedDomains.delete(toolName);
      }
    };
    try {
      for (const service of localServices) {
        const result2 = await service.callTool(toolName, args);
        if (result2 !== void 0) {
          trackSuccessfulToolCall();
          return result2;
        }
      }
      const result = await handler.callTool(toolName, args);
      trackSuccessfulToolCall();
      return result;
    } catch (error2) {
      const recovery = recoveryPromise;
      if (recovery && ["getTree", "getMessages", "listRequests"].includes(toolName)) {
        await recovery;
        return await callTool(toolName, args);
      }
      throw error2;
    }
  };
  const start = async () => {
    const readinessPromise = createStartReadiness();
    void readinessPromise.catch(() => void 0);
    try {
      await connect();
    } catch (error2) {
      if (recoveryPromise) {
        await recoveryPromise;
        if (status === "connected") {
          return;
        }
      }
      rejectStartReadiness(error2 instanceof Error ? error2 : new Error(String(error2)));
      throw error2;
    }
    await readinessPromise;
  };
  const stop = async () => {
    if (stopped && status === "stopped") {
      notifyTerminated();
      return;
    }
    stopped = true;
    connectionGeneration += 1;
    recoveryPromise = null;
    clearBootstrapTimer();
    clearPluginReadiness();
    rejectStartReadiness(new Error("Agent session stopped before bootstrap completed"));
    await disposeServices();
    logDisconnected();
    if (ws) {
      const socket = ws;
      ws = null;
      socket.close();
    }
    handler.disconnectDevice(options.target.id);
    status = "stopped";
    notifyTerminated();
  };
  return {
    id: options.target.id,
    start,
    stop,
    getInfo,
    getTools,
    getIntegration,
    getUnsupportedDomains: getUnsupportedDomainInfo,
    callTool,
    subscribeTap,
    sendTapMessage,
    isReusable: (nextTarget) => status === "connected" && target.pageId === nextTarget.pageId
  };
};
const createAgentSessionManager = (options) => {
  const metroVersion = options.metroVersion;
  const integration = options.integration ?? DEFAULT_AGENT_TARGET_INTEGRATION;
  const toHostIntegration = (value) => {
    switch (value) {
      case "react-native":
      case "react-native-web":
        return "react-native";
      case "lynx":
      case "lynx-web":
        return "lynx";
      default: {
        const exhaustive = value;
        throw new Error(`Unhandled RozeniteIntegration: ${String(exhaustive)}`);
      }
    }
  };
  const hostIntegration = toHostIntegration(integration);
  const sessions = /* @__PURE__ */ new Map();
  let currentHost = options.host ?? DEFAULT_AGENT_HOST;
  let currentPort = options.port ?? DEFAULT_AGENT_PORT;
  const syncEndpoint2 = (host, port) => {
    currentHost = host;
    currentPort = port;
  };
  const getInfo = () => {
    return {
      host: currentHost,
      port: currentPort,
      projectRoot: options.projectRoot,
      sessionCount: sessions.size
    };
  };
  const listTargets = async () => {
    return await getMetroTargets(currentHost, currentPort, hostIntegration);
  };
  const getSessionOrThrow = (sessionId) => {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session "${sessionId}"`);
    }
    return session;
  };
  const createSession = async (request = {}) => {
    const versionCheck = request.cliVersion && metroVersion && request.cliVersion !== metroVersion ? `Connected Rozenite agent uses version ${request.cliVersion}, but Metro is running version ${metroVersion}. Integration may not work correctly.` : void 0;
    const target = await resolveMetroTarget(
      currentHost,
      currentPort,
      hostIntegration,
      request.deviceId
    );
    const existing = sessions.get(target.id);
    if (existing) {
      if (existing.isReusable(target)) {
        return {
          session: existing.getInfo(),
          versionCheck
        };
      }
      sessions.delete(target.id);
      await existing.stop();
    }
    const session = createAgentSession({
      projectRoot: options.projectRoot,
      host: currentHost,
      port: currentPort,
      target,
      integration,
      cliVersion: request.cliVersion,
      metroVersion,
      resolveTarget: (deviceId) => resolveMetroTarget(currentHost, currentPort, hostIntegration, deviceId),
      onTerminated: (sessionId) => {
        const current = sessions.get(sessionId);
        if (current === session && ["blocked", "failed"].includes(session.getInfo().healing?.outcome ?? "")) {
          return;
        }
        if (current === session) {
          sessions.delete(sessionId);
        }
      }
    });
    try {
      await session.start();
      sessions.set(target.id, session);
      return {
        session: session.getInfo(),
        versionCheck
      };
    } catch (error2) {
      sessions.delete(target.id);
      try {
        await session.stop();
      } catch {
      }
      throw error2;
    }
  };
  const listSessions = () => {
    return Array.from(sessions.values()).map((session) => session.getInfo()).sort((a, b) => a.deviceName.localeCompare(b.deviceName) || a.id.localeCompare(b.id));
  };
  const getSession = (sessionId) => {
    return getSessionOrThrow(sessionId).getInfo();
  };
  const stopSession = async (sessionId) => {
    const session = getSessionOrThrow(sessionId);
    sessions.delete(sessionId);
    await session.stop();
    return { stopped: true };
  };
  const getSessionTools = (sessionId) => {
    const session = getSessionOrThrow(sessionId);
    return {
      tools: session.getTools(),
      integration: session.getIntegration(),
      unsupported: session.getUnsupportedDomains()
    };
  };
  const callSessionTool = async (sessionId, toolName, args) => {
    return await getSessionOrThrow(sessionId).callTool(toolName, args);
  };
  const subscribeSessionTap = (sessionId, listener) => {
    return getSessionOrThrow(sessionId).subscribeTap(listener);
  };
  const sendSessionTapMessage = async (sessionId, message) => {
    await getSessionOrThrow(sessionId).sendTapMessage(message);
  };
  const dispose = async () => {
    const activeSessions = Array.from(sessions.values());
    sessions.clear();
    await Promise.all(activeSessions.map((session) => session.stop()));
  };
  return {
    syncEndpoint: syncEndpoint2,
    getInfo,
    listTargets,
    createSession,
    listSessions,
    getSession,
    stopSession,
    getSessionTools,
    callSessionTool,
    subscribeSessionTap,
    sendSessionTapMessage,
    dispose
  };
};
const require$3 = node_module.createRequire(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("index.cjs", document.baseURI).href);
const getNormalizedRequestUrl = (url) => {
  if (url === "/agent" || url.startsWith("/agent/")) {
    return `/rozenite${url}`;
  }
  if (url === "/rozenite" || url.startsWith("/rozenite/")) {
    if (url === "/rozenite/agent" || url.startsWith("/rozenite/agent/")) {
      return url;
    }
    return url.replace("/rozenite", "");
  }
  return url;
};
const getMiddleware = (options, installedPlugins, destroyOnDetachPlugins, agentSessionManager, runtimeVersion) => {
  const app = express();
  const hostIntegration = options.integration ?? "react-native";
  const isLynx = hostIntegration === "lynx";
  const debuggerFrontend = isLynx ? null : require$3(getReactNativeDebuggerFrontendPath(options));
  const frameworkPath = path.resolve(require$3.resolve("@rozenite/runtime"), "..");
  const shellPath = path.join(
    path.dirname(require$3.resolve("@rozenite/shell/package.json")),
    "dist"
  );
  const appPath = path.join(path.dirname(require$3.resolve("@rozenite/app/package.json")), "dist");
  if (!isLynx) {
    logger.debug(`Debugger frontend path: ${debuggerFrontend}`);
  }
  logger.debug(`Framework path: ${frameworkPath}`);
  app.use((req, _, next) => {
    assert(req.url, "req.url is required");
    logger.debug(`Incoming request: ${req.url}`);
    req.url = getNormalizedRequestUrl(req.url);
    next();
  });
  app.get("/plugins/:plugin/*others", (req, res, next) => {
    const pluginName = req.params.plugin.replace("_", "/");
    const plugin = installedPlugins.find((plugin2) => plugin2.name === pluginName);
    if (!plugin) {
      res.status(404).send("Plugin not found");
      return;
    }
    const pluginPath = path.join(plugin.path, "dist");
    req.url = req.url.replace("plugins/" + pluginName.replace("/", "_"), "");
    express.static(pluginPath)(req, res, next);
  });
  app.get("/embedder-static/embedderScript.js", (_, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.end("");
  });
  if (!isLynx) {
    app.get("/rn_fusebox.html", (_, res) => {
      res.setHeader("Content-Type", "text/html");
      res.send(
        getEntryPointHTML(debuggerFrontend, {
          installedPlugins: installedPlugins.map((plugin) => plugin.name),
          destroyOnDetachPlugins,
          pluginDisplay: options.pluginDisplay ?? "sidebar",
          runtimeVersion
        })
      );
    });
  }
  app.get("/host.js", (_, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.end(fs.readFileSync(path.join(frameworkPath, "host.js"), "utf8"));
  });
  app.use("/shell", express.static(shellPath));
  app.get("/app/config", (_, res) => {
    const config = {
      installedPlugins: installedPlugins.map((plugin) => plugin.name),
      destroyOnDetachPlugins,
      runtimeVersion,
      hostIntegration
    };
    res.json(config);
  });
  app.get("/app", (_, res) => {
    res.sendFile("index.html", { root: appPath });
  });
  app.use("/app", express.static(appPath));
  app.use(createAgentRoutes(agentSessionManager));
  if (!isLynx) {
    app.use(express.static(debuggerFrontend));
  }
  return app;
};
const name = "@rozenite/middleware";
const version = "1.0.0";
const description = "Middleware for Rozenite.";
const keywords = ["bundler", "devtools", "middleware", "plugin", "react-native"];
const homepage = "https://github.com/callstackincubator/rozenite#readme";
const bugs = { "url": "https://github.com/callstackincubator/rozenite/issues" };
const license = "MIT";
const author = "Szymon Chmal <szymon.chmal@callstack.com>";
const repository = { "type": "git", "url": "https://github.com/callstackincubator/rozenite.git" };
const files = ["dist"];
const type = "module";
const main = "./dist/index.js";
const module$1 = "./dist/index.js";
const types = "./dist/index.d.ts";
const exports$1 = { "./package.json": "./package.json", ".": { "development": "./src/index.ts", "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" } };
const publishConfig = { "access": "public" };
const scripts = { "build": "vite build", "typecheck": "tsc -p tsconfig.lib.json --noEmit", "lint": "eslint .", "test": "vitest --run --passWithNoTests" };
const dependencies = { "@rozenite/agent-shared": "workspace:*", "@rozenite/app": "workspace:*", "@rozenite/runtime": "workspace:*", "@rozenite/shell": "workspace:*", "@rozenite/tools": "workspace:*", "express": "^5.1.0", "semver": "^7.7.2", "tslib": "^2.3.0", "ws": "^8.18.3" };
const devDependencies = { "@react-native/dev-middleware": "~0.76.0", "@types/ejs": "^3.1.5", "@types/express": "^5.0.3", "@types/semver": "^7.7.0", "@types/ws": "^8.18.1", "vitest": "^4.0.18" };
const engines = { "node": ">=20.19.0" };
const upstreamVersion = "2.4.0";
const packageJSON = {
  name,
  version,
  description,
  keywords,
  homepage,
  bugs,
  license,
  author,
  repository,
  files,
  type,
  main,
  module: module$1,
  types,
  exports: exports$1,
  publishConfig,
  scripts,
  dependencies,
  devDependencies,
  engines,
  upstreamVersion
};
const getPackageJSON = () => {
  return packageJSON;
};
path.resolve(
  node_url.fileURLToPath(new URL("../templates", typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("index.cjs", document.baseURI).href)),
  "./entry-point.ejs"
);
const ROZENITE_MANIFEST = "rozenite.json";
const require$2 = node_module.createRequire(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("index.cjs", document.baseURI).href);
const DISCOVERY_CONCURRENCY = Math.max(8, os.cpus().length);
const readPackageJsonName = async (packagePath) => {
  try {
    const packageJsonPath = path.join(packagePath, "package.json");
    const packageJson = JSON.parse(await fs$1.readFile(packageJsonPath, "utf8"));
    return typeof packageJson.name === "string" ? packageJson.name : null;
  } catch {
    return null;
  }
};
const getHoistedRootCandidate = (packageName, resolvedPath) => {
  const segments = resolvedPath.split(path.sep);
  const nodeModulesIndex = segments.lastIndexOf("node_modules");
  if (nodeModulesIndex === -1) {
    return null;
  }
  const nameSegments = packageName.split("/");
  const rootIndex = nodeModulesIndex + nameSegments.length;
  if (rootIndex >= segments.length) {
    return null;
  }
  const candidateName = segments.slice(nodeModulesIndex + 1, rootIndex + 1).join("/");
  if (candidateName !== packageName) {
    return null;
  }
  return segments.slice(0, rootIndex + 1).join(path.sep);
};
const walkUpToPackageRoot = async (packageName, resolvedPath) => {
  let currentPath = path.dirname(resolvedPath);
  while (true) {
    if (await readPackageJsonName(currentPath) === packageName) {
      return currentPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
};
const findPackageRoot = async (packageName, resolvedPath) => {
  const hoistedRoot = getHoistedRootCandidate(packageName, resolvedPath);
  if (hoistedRoot && await readPackageJsonName(hoistedRoot) === packageName) {
    return hoistedRoot;
  }
  return walkUpToPackageRoot(packageName, resolvedPath);
};
const getNodeModulesSearchDirs = (startDir) => {
  const dirs = [];
  let currentDir = path.resolve(startDir);
  while (true) {
    dirs.push(path.join(currentDir, "node_modules"));
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return dirs;
    }
    currentDir = parentDir;
  }
};
const resolveDirectNodeModulesRoot = async (projectRoot, packageName) => {
  for (const nodeModulesDir of getNodeModulesSearchDirs(projectRoot)) {
    const candidatePath = path.join(nodeModulesDir, ...packageName.split("/"));
    if (await readPackageJsonName(candidatePath) !== packageName) {
      continue;
    }
    try {
      return await fs$1.realpath(candidatePath);
    } catch {
      return null;
    }
  }
  return null;
};
const resolveViaModuleResolution = async (projectRoot, packageName) => {
  try {
    const resolvedPath = require$2.resolve(packageName, { paths: [projectRoot] });
    return await findPackageRoot(packageName, resolvedPath);
  } catch {
    return null;
  }
};
const resolvePackageRoot = async (projectRoot, packageName) => {
  const directRoot = await resolveDirectNodeModulesRoot(projectRoot, packageName);
  return directRoot ?? resolveViaModuleResolution(projectRoot, packageName);
};
const tryExtractPlugin = async (packagePath, packageName) => {
  const rozeniteConfigPath = path.join(packagePath, "dist", ROZENITE_MANIFEST);
  try {
    await fs$1.access(rozeniteConfigPath);
  } catch {
    return null;
  }
  return {
    name: packageName,
    path: packagePath
  };
};
const getIncludedPlugins = async (options) => {
  assert(options.include, "include is required");
  const plugins = [];
  const normalizedInclude = options.exclude ? options.include.filter((plugin) => !options.exclude?.includes(plugin)) : options.include;
  for (const maybePlugin of normalizedInclude) {
    const pluginPath = await resolvePackageRoot(options.projectRoot, maybePlugin);
    if (!pluginPath) {
      throw new Error(`Could not resolve plugin ${maybePlugin}.`);
    }
    const plugin = await tryExtractPlugin(pluginPath, maybePlugin);
    if (!plugin) {
      throw new Error(`Plugin ${maybePlugin} is not a valid Rozenite plugin.`);
    }
    plugins.push(plugin);
  }
  return plugins;
};
const getInstalledPlugins = async (options) => {
  if (options.include) {
    logger.info("Auto-discovery is disabled. Using only included plugins.");
    return getIncludedPlugins(options);
  }
  return getInstalledPluginsFromDependencies(options);
};
const readDependencyNames = async (projectRoot) => {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(await fs$1.readFile(packageJsonPath, "utf8"));
  return Array.from(
    /* @__PURE__ */ new Set([
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {})
    ])
  );
};
const resolveInstalledPlugin = async (projectRoot, dependency) => {
  const packagePath = await resolvePackageRoot(projectRoot, dependency);
  if (!packagePath) {
    return null;
  }
  return tryExtractPlugin(packagePath, dependency);
};
const getInstalledPluginsFromDependencies = async (options) => {
  const dependencies2 = (await readDependencyNames(options.projectRoot)).filter(
    (dependency) => !options.exclude?.includes(dependency)
  );
  const limit = createLimiter(DISCOVERY_CONCURRENCY);
  const plugins = await Promise.all(
    dependencies2.map(
      (dependency) => limit(() => resolveInstalledPlugin(options.projectRoot, dependency))
    )
  );
  return plugins.filter((plugin) => plugin !== null);
};
const matchesPrefix = (url, prefix) => {
  return url === prefix || url.startsWith(prefix + "/");
};
const withFinishedResponseGuard = (middleware) => {
  return (req, res, next) => {
    middleware(req, res, (error2) => {
      if (error2) {
        next(error2);
        return;
      }
      if (res.headersSent || res.writableEnded) {
        return;
      }
      next();
    });
  };
};
const createScopedMiddleware = (prefix, middleware) => {
  const guardedMiddleware = withFinishedResponseGuard(middleware);
  return (req, res, next) => {
    if (!req.url || !matchesPrefix(req.url, prefix)) {
      next();
      return;
    }
    const originalUrl = req.url;
    const scopedUrl = req.url.slice(prefix.length) || "/";
    req.url = scopedUrl.startsWith("/") ? scopedUrl : "/" + scopedUrl;
    guardedMiddleware(req, res, (error2) => {
      req.url = originalUrl;
      if (error2) {
        next(error2);
        return;
      }
      next();
    });
  };
};
const require$1 = node_module.createRequire(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("index.cjs", document.baseURI).href);
const getDevModePackage = (projectRoot) => {
  const packageName = process.env.ROZENITE_DEV_MODE;
  if (!packageName) {
    return null;
  }
  const packagePath = path.dirname(require$1.resolve(packageName, { paths: [projectRoot] }));
  return {
    name: packageName,
    path: packagePath
  };
};
const REQUIRED_REACT_NATIVE_VERSION = "0.76.0";
const verifyReactNativeVersion = (projectRoot) => {
  const reactNativePath = getReactNativePackagePath(projectRoot);
  const packageJsonPath = path.join(reactNativePath, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const reactNativeVersion = packageJson.version;
  if (semver.satisfies(reactNativeVersion, `>=${REQUIRED_REACT_NATIVE_VERSION}`, {
    includePrerelease: true
  })) {
    return;
  }
  logger.error(
    `React Native DevTools requires React Native ${REQUIRED_REACT_NATIVE_VERSION} or higher.
   Current version: ${reactNativeVersion}
   Please upgrade your React Native version to continue using Rozenite.`
  );
  process.exit(1);
};
const initializeRozenite = async (options, runtimeVersion) => {
  options.logLevel = process.env.ROZENITE_DEBUG === "true" ? "debug" : options.logLevel ?? "info";
  logger.setLevel(options.logLevel);
  const isLynx = options.integration === "lynx";
  if (!isLynx) {
    verifyReactNativeVersion(options.projectRoot);
  }
  logger.debug("Rozenite is running in debug mode.");
  logger.debug(`Resolution root: ${options.projectRoot}`);
  if (!isLynx) {
    logger.debug(`Resolved react-native to: ${getReactNativePackagePath(options.projectRoot)}`);
  }
  const devModePackage = getDevModePackage(options.projectRoot);
  if (devModePackage) {
    options.exclude = [...options.exclude ?? [], devModePackage.name];
    logger.info(`Dev mode is enabled for package: ${devModePackage.name}`);
  }
  const allInstalledPlugins = await getInstalledPlugins(options);
  const agentSessionManager = createAgentSessionManager({
    projectRoot: options.projectRoot,
    // The fork numbers its own releases; agents compare against the upstream release it is built from.
    metroVersion: getPackageJSON().upstreamVersion,
    // Which integration this dev server hosts. Every session it serves
    // resolves its CDP capability profile from this.
    integration: options.integration
  });
  if (allInstalledPlugins.length === 0) {
    logger.info("No plugins found.");
  } else {
    logger.info(`Loaded ${allInstalledPlugins.length} plugin(s):`);
    allInstalledPlugins.forEach((plugin) => {
      logger.info(`  - ${plugin.name}`);
    });
  }
  if (!isLynx) {
    patchDevtoolsFrontendUrl(options);
  }
  return {
    middleware: getMiddleware(
      options,
      allInstalledPlugins,
      options.destroyOnDetachPlugins || [],
      agentSessionManager,
      runtimeVersion
    ),
    devModePackage,
    dispose: async () => {
      await agentSessionManager.dispose();
    }
  };
};
exports.createScopedMiddleware = createScopedMiddleware;
exports.initializeRozenite = initializeRozenite;
