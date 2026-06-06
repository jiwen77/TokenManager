#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const {
  RuntimeConfigStore,
  normalizeFiniteNumber,
  normalizeNonNegativeInteger,
  normalizeServerAccountCache,
  normalizeSub2ApiGroupIds,
  normalizeSub2ApiMetaOptions,
  normalizeSub2ApiSelectionIds,
  normalizeUnixSeconds,
} = require("./lib/runtime-config-store");

const DEFAULT_SUB2API_BASE_URL = "http://127.0.0.1:8080/api/v1";
const DEFAULT_COOKIE_NAME = "__Host-tokenmanager-session";
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_LOGIN_MAX_FAILURES = 5;
const DEFAULT_LOGIN_WINDOW_SECONDS = 15 * 60;
const DEFAULT_LOGIN_LOCK_SECONDS = 15 * 60;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SCRYPT_PREFIX = "scrypt:v1";
const DEFAULT_APP_BASE_PATH = "/token-manager";
const LEGACY_AUTH_PREFIX = "/token-manager-auth";
const LEGACY_API_PREFIX = "/token-manager-api";

const ALLOWED_PROXY_ROUTES = [
  { method: "GET", pattern: /^\/admin\/accounts$/ },
  { method: "PUT", pattern: /^\/admin\/accounts\/\d+$/ },
  { method: "DELETE", pattern: /^\/admin\/accounts\/\d+$/ },
  { method: "POST", pattern: /^\/admin\/accounts\/\d+\/apply-oauth-credentials$/ },
  { method: "POST", pattern: /^\/admin\/accounts\/\d+\/set-privacy$/ },
  { method: "POST", pattern: /^\/admin\/accounts\/\d+\/schedulable$/ },
  { method: "POST", pattern: /^\/admin\/accounts\/batch$/ },
  { method: "POST", pattern: /^\/admin\/accounts\/data$/ },
  { method: "GET", pattern: /^\/admin\/groups\/all$/ },
  { method: "GET", pattern: /^\/admin\/proxies\/all$/ },
];

const SENSITIVE_ACCOUNT_RESPONSE_KEYS = new Set([
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "session_token",
  "sessiontoken",
  "id_token",
  "idtoken",
  "api_key",
  "apikey",
  "openai_api_key",
  "openaiapikey",
  "authorization",
  "bearer",
  "password",
  "secret",
]);

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function stripInlineComment(value) {
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? "" : quote || char;
    }
    if (char === "#" && !quote && /\s/.test(value[index - 1] || " ")) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function unquoteEnvValue(value) {
  const trimmed = stripInlineComment(value);
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      const inner = trimmed.slice(1, -1);
      return first === '"'
        ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        : inner;
    }
  }
  return trimmed;
}

function loadEnvFile(filePath, targetEnv = process.env) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }

  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (targetEnv[key] === undefined) {
      targetEnv[key] = unquoteEnvValue(rawValue);
    }
  }
  return true;
}

function loadDefaultEnvFiles() {
  const candidates = [];
  if (process.env.TOKENMANAGER_ENV_FILE) {
    candidates.push(process.env.TOKENMANAGER_ENV_FILE);
  }
  candidates.push(
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "server", ".env"),
    path.join(__dirname, ".env"),
  );

  const seen = new Set();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    loadEnvFile(resolved);
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || DEFAULT_SUB2API_BASE_URL).trim().replace(/\/+$/, "");
  const parsed = new URL(raw);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("SUB2API_BASE_URL must use http or https");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function joinUrlParts(base, suffix) {
  const left = String(base || "").trim().replace(/\/+$/, "");
  const right = String(suffix || "").trim().replace(/^\/+/, "");
  if (!left) {
    return right ? `/${right}` : "";
  }
  return right ? `${left}/${right}` : left;
}

function normalizePublicPath(value, fallback = "/api/v1") {
  const raw = String(value || fallback).trim();
  if (!raw) {
    return fallback;
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function getAdminBasePathFromImportPath(value) {
  const normalized = normalizePublicPath(value, "/api/v1/admin/accounts/data").replace(/\/+$/, "") || "/";
  const adminIndex = normalized.lastIndexOf("/admin/");
  if (adminIndex > 0) {
    return normalized.slice(0, adminIndex) || "/";
  }
  return normalized.replace(/\/admin\/accounts\/data$/, "") || "/";
}

function splitBrowserDefaultUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return {};
  }

  if (raw.startsWith("/")) {
    return { importPath: normalizePublicPath(raw, "/api/v1/admin/accounts/data") };
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return {
      origin: /^https?:\/\//i.test(raw) ? parsed.origin : raw.split(/[/?#]/)[0],
      importPath: parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : undefined,
    };
  } catch {
    return { origin: raw };
  }
}

function createSub2ApiBrowserDefaults(env = process.env) {
  const legacyApiBasePath = normalizePublicPath(
    env.TOKENMANAGER_SUB2API_API_BASE_PATH || env.TOKENMANAGER_SUB2API_DEFAULT_PATH,
    "/api/v1",
  );
  const configuredImportPath = env.TOKENMANAGER_SUB2API_IMPORT_PATH;
  let importPath = configuredImportPath
    ? normalizePublicPath(configuredImportPath, "/api/v1/admin/accounts/data")
    : joinUrlParts(legacyApiBasePath, "/admin/accounts/data");

  // Backward compatibility: older configs stored only the suffix in
  // TOKENMANAGER_SUB2API_IMPORT_PATH and the API prefix separately.
  if (configuredImportPath && importPath.startsWith("/admin/")) {
    importPath = joinUrlParts(legacyApiBasePath, importPath);
  }

  let origin = String(env.TOKENMANAGER_SUB2API_DEFAULT_ORIGIN || env.TOKENMANAGER_SUB2API_DEFAULT_HOST || "").trim();

  const legacyDefaultUrl = String(env.TOKENMANAGER_SUB2API_DEFAULT_URL || "").trim();
  if (legacyDefaultUrl) {
    const parsed = splitBrowserDefaultUrl(legacyDefaultUrl);
    origin = parsed.origin || origin;
    if (parsed.importPath) {
      importPath = parsed.importPath.includes("/admin/")
        ? parsed.importPath
        : joinUrlParts(parsed.importPath, "/admin/accounts/data");
    }
  }

  const adminBasePath = getAdminBasePathFromImportPath(importPath);

  return {
    origin,
    adminBasePath,
    apiBasePath: adminBasePath,
    importPath,
    defaultUrl: origin || "",
  };
}

function createSub2ApiBrowserDefaultUrl(env = process.env) {
  return createSub2ApiBrowserDefaults(env).defaultUrl;
}

function defaultEnvFilePath(env = process.env) {
  if (env.TOKENMANAGER_ENV_FILE) {
    return env.TOKENMANAGER_ENV_FILE;
  }
  const candidates = [
    path.join(process.cwd(), "server", ".env"),
    path.join(process.cwd(), ".env"),
    path.join(__dirname, ".env"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function databaseFileFromEnv(env = process.env) {
  const explicit = String(env.TOKENMANAGER_DATABASE_FILE || env.TOKENMANAGER_DB_FILE || "").trim();
  if (explicit) {
    return explicit;
  }
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    return path.join(__dirname, "tokenmanager.sqlite");
  }
  if (databaseUrl.startsWith("file:")) {
    return databaseUrl.slice("file:".length);
  }
  return databaseUrl;
}

function getEffectiveSub2ApiProxyConfig(config, runtimeConfig = {}) {
  const defaults = config.sub2apiBrowserDefaults || createSub2ApiBrowserDefaults({});
  const importPath = runtimeConfig.sub2apiImportPath || defaults.importPath || "/api/v1/admin/accounts/data";
  const origin = runtimeConfig.sub2apiOrigin || defaults.origin || "";
  const adminBasePath = getAdminBasePathFromImportPath(importPath);
  return {
    sub2apiBaseUrl: origin ? joinUrlParts(origin, adminBasePath) : config.sub2apiBaseUrl,
    sub2apiAdminApiKey: config.sub2apiAdminApiKey,
    sub2apiAdminBearerToken: runtimeConfig.sub2apiBearerToken || config.sub2apiAdminBearerToken,
    importPath,
    adminBasePath,
    origin,
  };
}

function createSecretPreview(value, visibleChars = 6) {
  const token = String(value || "").trim().replace(/^Bearer\s+/i, "");
  if (!token) {
    return "";
  }

  const visibleLength = token.length <= visibleChars
    ? Math.max(1, Math.floor(token.length / 2))
    : visibleChars;
  return `${token.slice(0, visibleLength)}••••••••`;
}

function buildPublicConfig(config, runtimeConfig = {}) {
  const defaults = config.sub2apiBrowserDefaults || createSub2ApiBrowserDefaults({});
  const importPath = runtimeConfig.sub2apiImportPath || defaults.importPath || "/api/v1/admin/accounts/data";
  const origin = runtimeConfig.sub2apiOrigin || defaults.origin || "";
  const savedBearerToken = runtimeConfig.sub2apiBearerToken || config.sub2apiAdminBearerToken || "";
  const adminBasePath = getAdminBasePathFromImportPath(importPath);
  const proxyIds = Array.isArray(runtimeConfig.proxyIds)
    ? normalizeSub2ApiSelectionIds(runtimeConfig.proxyIds)
    : runtimeConfig.proxyId === null || runtimeConfig.proxyId === undefined
      ? []
      : normalizeSub2ApiSelectionIds([runtimeConfig.proxyId]);
  return {
    sub2api_proxy_enabled: !config.authOnly,
    sub2api_default_origin: origin,
    sub2api_admin_base_path: adminBasePath,
    sub2api_import_path: importPath,
    sub2api_api_base_path: adminBasePath,
    sub2api_default_url: origin ? joinUrlParts(origin, adminBasePath) : adminBasePath,
    sub2api_has_bearer_token: Boolean(savedBearerToken),
    sub2api_bearer_token_preview: createSecretPreview(savedBearerToken),
    sub2api_server_auth_configured: Boolean(runtimeConfig.sub2apiBearerToken || config.sub2apiAdminApiKey || config.sub2apiAdminBearerToken || config.sub2apiJwtSecret || config.sub2apiAdminPassword),
    group_ids: normalizeSub2ApiGroupIds(runtimeConfig.groupIds),
    group_options: normalizeSub2ApiMetaOptions(runtimeConfig.groupOptions),
    proxy_ids: proxyIds,
    proxy_id: proxyIds.length ? proxyIds[0] : null,
    proxy_options: normalizeSub2ApiMetaOptions(runtimeConfig.proxyOptions),
    meta_cached_at: runtimeConfig.metaCachedAt,
    server_account_cache: normalizeServerAccountCache(runtimeConfig.serverAccountCache),
    server_account_total: normalizeFiniteNumber(runtimeConfig.serverAccountTotal, Array.isArray(runtimeConfig.serverAccountCache) ? runtimeConfig.serverAccountCache.length : 0),
    server_accounts_cached_at: runtimeConfig.serverAccountsCachedAt,
    priority: normalizeFiniteNumber(runtimeConfig.priority, 1),
    concurrency: normalizeNonNegativeInteger(runtimeConfig.concurrency, 10),
    expires_at: normalizeUnixSeconds(runtimeConfig.expiresAt),
    rate_multiplier: normalizeFiniteNumber(runtimeConfig.rateMultiplier, 1),
    websocket_mode: runtimeConfig.websocketMode || "off",
    auto_passthrough: runtimeConfig.autoPassthrough === true,
    set_privacy: runtimeConfig.setPrivacy === true,
    updated_at: runtimeConfig.updatedAt,
  };
}


function createConfig(env = process.env) {
  const cookieSecure = parseBoolean(env.TOKENMANAGER_COOKIE_SECURE, env.NODE_ENV !== "development");
  const cookieName = env.TOKENMANAGER_COOKIE_NAME
    || (cookieSecure ? DEFAULT_COOKIE_NAME : "tokenmanager-session");

  return {
    host: env.TOKENMANAGER_HOST || "127.0.0.1",
    port: parsePositiveInteger(env.TOKENMANAGER_PORT || env.PORT, 8787),
    authOnly: parseBoolean(env.TOKENMANAGER_AUTH_ONLY, false),
    sub2apiBaseUrl: normalizeBaseUrl(env.SUB2API_BASE_URL),
    sub2apiBrowserDefaults: createSub2ApiBrowserDefaults(env),
    sub2apiAdminApiKey: String(env.SUB2API_ADMIN_API_KEY || "").trim(),
    sub2apiAdminBearerToken: String(env.SUB2API_ADMIN_BEARER_TOKEN || env.SUB2API_BEARER_TOKEN || "").trim(),
    sub2apiJwtSecret: String(env.SUB2API_JWT_SECRET || ""),
    sub2apiAdminUserId: String(env.SUB2API_ADMIN_USER_ID || "").trim(),
    sub2apiAdminRole: String(env.SUB2API_ADMIN_ROLE || "admin").trim(),
    sub2apiAdminTokenVersion: String(env.SUB2API_ADMIN_TOKEN_VERSION || "0").trim(),
    sub2apiSignedTokenTtlSeconds: parsePositiveInteger(env.SUB2API_SIGNED_TOKEN_TTL_SECONDS, 3600),
    sub2apiAdminEmail: String(env.SUB2API_ADMIN_EMAIL || env.SUB2API_EMAIL || "").trim(),
    sub2apiAdminPassword: String(env.SUB2API_ADMIN_PASSWORD || env.SUB2API_PASSWORD || ""),
    loginUsername: String(env.TOKENMANAGER_LOGIN_USERNAME || "").trim(),
    loginPasswordHash: String(env.TOKENMANAGER_PASSWORD_HASH || "").trim(),
    loginPassword: String(env.TOKENMANAGER_PASSWORD || ""),
    sessionSecret: String(env.TOKENMANAGER_SESSION_SECRET || ""),
    sessionTtlSeconds: parsePositiveInteger(env.TOKENMANAGER_SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_SECONDS),
    cookieName,
    cookieSecure,
    cookieSameSite: env.TOKENMANAGER_COOKIE_SAMESITE || "Lax",
    cookiePath: env.TOKENMANAGER_COOKIE_PATH || "/",
    loginMaxFailures: parseNonNegativeInteger(env.TOKENMANAGER_LOGIN_MAX_FAILURES, DEFAULT_LOGIN_MAX_FAILURES),
    loginWindowSeconds: parsePositiveInteger(env.TOKENMANAGER_LOGIN_WINDOW_SECONDS, DEFAULT_LOGIN_WINDOW_SECONDS),
    loginLockSeconds: parsePositiveInteger(env.TOKENMANAGER_LOGIN_LOCK_SECONDS, DEFAULT_LOGIN_LOCK_SECONDS),
    appBasePath: normalizePublicPath(env.TOKENMANAGER_BASE_PATH || DEFAULT_APP_BASE_PATH, DEFAULT_APP_BASE_PATH).replace(/\/+$/, "") || DEFAULT_APP_BASE_PATH,
    staticDir: path.resolve(env.TOKENMANAGER_STATIC_DIR || path.join(__dirname, "..", "docs")),
    envFile: path.resolve(defaultEnvFilePath(env)),
    storageBackend: String(env.TOKENMANAGER_STORAGE_BACKEND || "sqlite").trim().toLowerCase(),
    databaseFile: path.resolve(databaseFileFromEnv(env)),
    encryptionKey: String(env.TOKENMANAGER_ENCRYPTION_KEY || env.TOKENMANAGER_SESSION_SECRET || ""),
    pythonBin: String(env.TOKENMANAGER_PYTHON || "python3"),
    runtimeConfigFile: env.TOKENMANAGER_CONFIG_FILE || path.join(__dirname, "runtime-config.json"),
    maxBodyBytes: parsePositiveInteger(env.TOKENMANAGER_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES),
    upstreamTimeoutMs: parsePositiveInteger(env.TOKENMANAGER_UPSTREAM_TIMEOUT_MS, 30000),
  };
}

function validateRuntimeConfig(config) {
  const errors = [];
  if (!config.sessionSecret || Buffer.byteLength(config.sessionSecret) < 32) {
    errors.push("TOKENMANAGER_SESSION_SECRET must be at least 32 bytes");
  }
  if (!config.loginPasswordHash && !config.loginPassword) {
    errors.push("TOKENMANAGER_PASSWORD_HASH is required (TOKENMANAGER_PASSWORD is accepted only for emergency fallback)");
  }
  if (!["sqlite", "json"].includes(config.storageBackend)) {
    errors.push("TOKENMANAGER_STORAGE_BACKEND must be sqlite or json");
  }
  if (config.storageBackend === "sqlite" && !config.encryptionKey) {
    errors.push("TOKENMANAGER_ENCRYPTION_KEY or TOKENMANAGER_SESSION_SECRET is required for sqlite runtime config storage");
  }
  const canSignSub2ApiJwt = Boolean(config.sub2apiJwtSecret && config.sub2apiAdminUserId && config.sub2apiAdminEmail);
  if (!config.authOnly && !config.sub2apiAdminApiKey && !config.sub2apiAdminBearerToken && !canSignSub2ApiJwt) {
    if (!config.sub2apiAdminEmail) {
      errors.push("SUB2API_ADMIN_EMAIL is required when SUB2API_ADMIN_API_KEY, SUB2API_ADMIN_BEARER_TOKEN, or SUB2API_JWT_SECRET signing is not set");
    }
    if (!config.sub2apiAdminPassword) {
      errors.push("SUB2API_ADMIN_PASSWORD is required when SUB2API_ADMIN_API_KEY, SUB2API_ADMIN_BEARER_TOKEN, or SUB2API_JWT_SECRET signing is not set");
    }
  }
  if (errors.length) {
    throw new Error(errors.join("; "));
  }
}

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeStringEqual(a, b) {
  const left = crypto.createHash("sha256").update(String(a)).digest();
  const right = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function scryptAsync(password, salt, keylen, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

async function hashPassword(password, options = {}) {
  const salt = options.salt ? Buffer.from(options.salt) : crypto.randomBytes(16);
  const N = options.N || 32768;
  const r = options.r || 8;
  const p = options.p || 1;
  const keylen = options.keylen || 32;
  const maxmem = options.maxmem || 64 * 1024 * 1024;
  const key = await scryptAsync(String(password), salt, keylen, { N, r, p, maxmem });
  return `${SCRYPT_PREFIX}:${N}:${r}:${p}:${base64url(salt)}:${base64url(key)}`;
}

async function verifyPasswordHash(password, encodedHash) {
  const parts = String(encodedHash || "").split(":");
  if (parts.length !== 7 || `${parts[0]}:${parts[1]}` !== SCRYPT_PREFIX) {
    return false;
  }

  const N = Number.parseInt(parts[2], 10);
  const r = Number.parseInt(parts[3], 10);
  const p = Number.parseInt(parts[4], 10);
  if (![N, r, p].every((value) => Number.isFinite(value) && value > 0)) {
    return false;
  }

  const salt = Buffer.from(parts[5], "base64url");
  const expected = Buffer.from(parts[6], "base64url");
  const actual = await scryptAsync(String(password), salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function verifyLoginPassword(password, config) {
  if (config.loginPasswordHash) {
    return verifyPasswordHash(password, config.loginPasswordHash);
  }
  return timingSafeStringEqual(password, config.loginPassword);
}

function parseCookies(header) {
  const cookies = new Map();
  for (const item of String(header || "").split(";")) {
    const index = item.indexOf("=");
    if (index < 0) {
      continue;
    }
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key) {
      try {
        cookies.set(key, decodeURIComponent(value));
      } catch {
        cookies.set(key, value);
      }
    }
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const chunks = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) chunks.push(`Max-Age=${Math.trunc(options.maxAge)}`);
  if (options.expires) chunks.push(`Expires=${options.expires.toUTCString()}`);
  chunks.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) chunks.push("HttpOnly");
  if (options.secure) chunks.push("Secure");
  chunks.push(`SameSite=${options.sameSite || "Lax"}`);
  return chunks.join("; ");
}

class SessionManager {
  constructor(config) {
    this.config = config;
    this.sessions = new Map();
  }

  sign(sessionId) {
    return hmac(this.config.sessionSecret, sessionId);
  }

  create() {
    const sessionId = base64url(crypto.randomBytes(32));
    const expiresAt = Date.now() + this.config.sessionTtlSeconds * 1000;
    this.sessions.set(sessionId, { expiresAt });
    return {
      value: `${sessionId}.${this.sign(sessionId)}`,
      expiresAt,
    };
  }

  verify(cookieValue) {
    const value = String(cookieValue || "");
    const separator = value.lastIndexOf(".");
    if (separator < 1) {
      return null;
    }
    const sessionId = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    const expectedSignature = this.sign(sessionId);
    if (!timingSafeStringEqual(signature, expectedSignature)) {
      return null;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      return null;
    }
    return { id: sessionId, expiresAt: session.expiresAt };
  }

  fromRequest(req) {
    const cookies = parseCookies(req.headers.cookie);
    return this.verify(cookies.get(this.config.cookieName));
  }

  destroy(cookieValue) {
    const value = String(cookieValue || "");
    const separator = value.lastIndexOf(".");
    if (separator > 0) {
      this.sessions.delete(value.slice(0, separator));
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

function getClientAddress(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const address = forwardedFor || req.socket?.remoteAddress || "unknown";
  return address.replace(/^::ffff:/, "") || "unknown";
}

function getLoginRateLimitKey(req, username) {
  const source = getClientAddress(req);
  const normalizedUsername = String(username || "_password_only").trim().toLowerCase() || "_password_only";
  return `${source}|${normalizedUsername}`;
}

class LoginRateLimiter {
  constructor(config, options = {}) {
    this.config = config;
    this.entries = new Map();
    this.now = options.now || (() => Date.now());
  }

  isEnabled() {
    return Number(this.config.loginMaxFailures) > 0
      && Number(this.config.loginWindowSeconds) > 0
      && Number(this.config.loginLockSeconds) > 0;
  }

  cleanup(now = this.now()) {
    for (const [key, entry] of this.entries.entries()) {
      const windowExpired = !entry.firstFailureAt || now - entry.firstFailureAt > this.config.loginWindowSeconds * 1000;
      const lockExpired = !entry.lockedUntil || entry.lockedUntil <= now;
      if (windowExpired && lockExpired) {
        this.entries.delete(key);
      }
    }
  }

  check(key) {
    if (!this.isEnabled()) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const now = this.now();
    const entry = this.entries.get(key);
    if (!entry || !entry.lockedUntil || entry.lockedUntil <= now) {
      if (entry && entry.lockedUntil && entry.lockedUntil <= now) {
        this.entries.delete(key);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
    };
  }

  recordFailure(key) {
    if (!this.isEnabled()) {
      return { locked: false, retryAfterSeconds: 0 };
    }

    const now = this.now();
    const windowMs = this.config.loginWindowSeconds * 1000;
    const lockMs = this.config.loginLockSeconds * 1000;
    const current = this.entries.get(key);
    const entry = current && current.firstFailureAt && now - current.firstFailureAt <= windowMs
      ? current
      : { firstFailureAt: now, failures: 0, lockedUntil: 0 };

    entry.failures += 1;
    entry.lastFailureAt = now;
    if (entry.failures >= this.config.loginMaxFailures) {
      entry.lockedUntil = now + lockMs;
    }
    this.entries.set(key, entry);
    this.cleanup(now);

    return entry.lockedUntil && entry.lockedUntil > now
      ? { locked: true, retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)) }
      : { locked: false, retryAfterSeconds: 0 };
  }

  recordSuccess(key) {
    this.entries.delete(key);
  }
}

function jsonResponse(res, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
}

function htmlResponse(res, status, html, headers = {}) {
  const body = Buffer.from(html);
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  res.end(body);
}

function redirectResponse(res, location, status = 308) {
  res.writeHead(status, {
    Location: location,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": 0,
  });
  res.end();
}

const STATIC_CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
]);

function buildContentSecurityPolicy(options = {}) {
  const nonce = options.nonce ? ` 'nonce-${options.nonce}'` : "";
  return [
    "default-src 'self'",
    `script-src 'self'${nonce}`,
    `style-src 'self'${nonce}`,
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function tokenManagerSecurityHeaders(headers = {}, options = {}) {
  return {
    "Content-Security-Policy": buildContentSecurityPolicy(options),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers,
  };
}

function normalizeAppBasePath(config) {
  return String(config.appBasePath || DEFAULT_APP_BASE_PATH).replace(/\/+$/, "") || DEFAULT_APP_BASE_PATH;
}

function getNestedAuthPrefix(config) {
  return `${normalizeAppBasePath(config)}/auth`;
}

function getNestedApiPrefix(config) {
  return `${normalizeAppBasePath(config)}/api`;
}

function pathStartsWithPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getNormalizedAuthPath(pathname, config) {
  if (pathStartsWithPrefix(pathname, LEGACY_AUTH_PREFIX)) {
    return `${LEGACY_AUTH_PREFIX}${pathname.slice(LEGACY_AUTH_PREFIX.length) || "/"}`;
  }
  const nestedPrefix = getNestedAuthPrefix(config);
  if (pathStartsWithPrefix(pathname, nestedPrefix)) {
    return `${LEGACY_AUTH_PREFIX}${pathname.slice(nestedPrefix.length) || "/"}`;
  }
  return "";
}

function getApiPrefix(pathname, config) {
  if (pathStartsWithPrefix(pathname, LEGACY_API_PREFIX)) {
    return LEGACY_API_PREFIX;
  }
  const nestedPrefix = getNestedApiPrefix(config);
  if (pathStartsWithPrefix(pathname, nestedPrefix)) {
    return nestedPrefix;
  }
  return "";
}

function getSafeStaticFilePath(staticDir, requestPath) {
  let decoded = "/";
  try {
    decoded = decodeURIComponent(requestPath || "/");
  } catch {
    decoded = "/";
  }
  const normalized = path.posix.normalize(`/${decoded}`).replace(/^\/+/, "");
  const requested = normalized && normalized !== "." ? normalized : "index.html";
  const resolved = path.resolve(staticDir, requested);
  const root = path.resolve(staticDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return "";
  }
  return resolved;
}

function serveStaticFile(req, res, filePath) {
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    return methodNotAllowed(res);
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    notFound(res);
    return;
  }
  if (!stat.isFile()) {
    notFound(res);
    return;
  }

  const contentType = STATIC_CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
  res.writeHead(200, tokenManagerSecurityHeaders({
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Cache-Control": "no-store",
  }));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function tokenManagerLoginPage(options = {}) {
  const nonceAttribute = options.nonce ? ` nonce="${options.nonce}"` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TokenManager 登录</title>
  <style${nonceAttribute}>
    :root { color-scheme: light; --bg: #f4efe7; --card: #fffaf2; --text: #172326; --muted: #6f7a7d; --accent: #24505a; --line: #ded4c5; --danger: #9f2d20; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top, #fff7e8, var(--bg)); color: var(--text); }
    main { width: min(100%, 420px); border: 1px solid var(--line); border-radius: 20px; background: var(--card); box-shadow: 0 24px 80px rgba(23, 35, 38, 0.14); padding: 26px; }
    h1 { margin: 0 0 20px; font-size: 1.35rem; }
    label { display: block; margin-bottom: 8px; font-weight: 800; color: var(--accent); }
    input { width: 100%; min-height: 44px; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; font-size: 1rem; background: #fff; color: var(--text); }
    input:focus { outline: 3px solid rgba(36, 80, 90, 0.18); border-color: var(--accent); }
    button { width: 100%; min-height: 44px; margin-top: 14px; border: 0; border-radius: 12px; background: var(--accent); color: #fff; font-weight: 900; font-size: 1rem; cursor: pointer; }
    button:disabled { opacity: 0.68; cursor: wait; }
    .status { min-height: 22px; margin-top: 12px; color: var(--danger); font-size: 0.92rem; }
  </style>
</head>
<body>
  <main>
    <h1>TokenManager</h1>
    <form id="login-form" autocomplete="off">
      <label for="password">密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
      <button id="submit" type="submit">进入</button>
      <div class="status" id="status" role="status" aria-live="polite"></div>
    </form>
  </main>
  <script${nonceAttribute}>
    const form = document.querySelector('#login-form');
    const password = document.querySelector('#password');
    const submit = document.querySelector('#submit');
    const status = document.querySelector('#status');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = '';
      submit.disabled = true;
      try {
        const response = await fetch('/token-manager/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ password: password.value }),
        });
        if (!response.ok) {
          status.textContent = response.status === 401
            ? '密码不正确。'
            : response.status === 429
              ? '尝试次数过多，请稍后再试。'
              : '登录失败，请稍后重试。';
          submit.disabled = false;
          password.select();
          return;
        }
        window.location.replace('/token-manager/');
      } catch {
        status.textContent = '网络错误，请稍后重试。';
        submit.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

function loginPageResponse(res, status = 401) {
  const nonce = base64url(crypto.randomBytes(16));
  htmlResponse(res, status, tokenManagerLoginPage({ nonce }), tokenManagerSecurityHeaders({}, { nonce }));
}

function methodNotAllowed(res) {
  jsonResponse(res, 405, { error: "method_not_allowed" });
}

function notFound(res) {
  jsonResponse(res, 404, { error: "not_found" });
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("request_body_too_large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req, maxBytes) {
  const buffer = await readRequestBody(req, maxBytes);
  if (!buffer.length) {
    return {};
  }
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid_json"), { statusCode: 400 });
  }
}

function unwrapApiData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.prototype.hasOwnProperty.call(value, "data")) {
    return value;
  }
  const keys = Object.keys(value);
  const looksLikeEnvelope = Object.prototype.hasOwnProperty.call(value, "code")
    || Object.prototype.hasOwnProperty.call(value, "message")
    || keys.every((key) => ["code", "message", "data"].includes(key));
  return looksLikeEnvelope ? value.data : value;
}

async function parseFetchJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFromBody(body, fallback) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body.message || body.detail || body.error || fallback;
  }
  return typeof body === "string" && body.trim() ? body.trim() : fallback;
}

function joinUrl(baseUrl, suffixPath, search = "") {
  const base = String(baseUrl).replace(/\/+$/, "");
  const suffix = String(suffixPath || "/").startsWith("/") ? suffixPath : `/${suffixPath}`;
  return `${base}${suffix}${search || ""}`;
}

function jwtExpiryMs(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) {
    return 0;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const exp = Number(payload.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

class Sub2ApiTokenManager {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.accessToken = config.sub2apiAdminBearerToken || "";
    this.staticAccessToken = config.sub2apiAdminBearerToken || "";
    this.jwtSigningEnabled = Boolean(config.sub2apiJwtSecret && config.sub2apiAdminUserId && config.sub2apiAdminEmail);
    this.refreshToken = "";
    this.accessTokenExpiresAt = 0;
    this.inflight = null;
  }

  clear() {
    this.accessToken = this.staticAccessToken || "";
    this.refreshToken = "";
    this.accessTokenExpiresAt = 0;
  }

  tokenStillUsable() {
    return this.accessToken && (!this.accessTokenExpiresAt || this.accessTokenExpiresAt - Date.now() > 60000);
  }

  updateFromAuthData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("sub2api auth returned invalid data");
    }
    if (data.requires_2fa) {
      throw new Error("sub2api admin account requires 2FA; BFF cannot complete login automatically");
    }
    const accessToken = String(data.access_token || "");
    if (!accessToken) {
      throw new Error("sub2api auth response did not include access_token");
    }

    this.accessToken = accessToken;
    this.refreshToken = String(data.refresh_token || this.refreshToken || "");
    const expiresIn = Number(data.expires_in);
    const jwtExpiry = jwtExpiryMs(accessToken);
    this.accessTokenExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0
      ? Date.now() + expiresIn * 1000
      : jwtExpiry;
  }

  async authFetch(pathname, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.upstreamTimeoutMs);
    try {
      const response = await fetch(joinUrl(this.config.sub2apiBaseUrl, pathname), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await parseFetchJson(response);
      if (!response.ok) {
        throw new Error(errorMessageFromBody(payload, `sub2api auth HTTP ${response.status}`));
      }
      if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "code") && payload.code !== 0 && payload.code !== "SUCCESS") {
        throw new Error(errorMessageFromBody(payload, "sub2api auth returned an error"));
      }
      return unwrapApiData(payload);
    } finally {
      clearTimeout(timer);
    }
  }

  mintSignedJwt() {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.config.sub2apiSignedTokenTtlSeconds;
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      user_id: Number(this.config.sub2apiAdminUserId),
      email: this.config.sub2apiAdminEmail,
      role: this.config.sub2apiAdminRole || "admin",
      token_version: Number(this.config.sub2apiAdminTokenVersion || 0),
      exp: expiresAt,
      iat: now,
      nbf: now,
    };
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = hmac(this.config.sub2apiJwtSecret, `${encodedHeader}.${encodedPayload}`);
    this.accessToken = `${encodedHeader}.${encodedPayload}.${signature}`;
    this.accessTokenExpiresAt = expiresAt * 1000;
    return this.accessToken;
  }

  async login() {
    if (this.jwtSigningEnabled) {
      this.logger.info?.("sub2api admin token minted from server-side JWT secret");
      return this.mintSignedJwt();
    }
    const data = await this.authFetch("/auth/login", {
      email: this.config.sub2apiAdminEmail,
      password: this.config.sub2apiAdminPassword,
    });
    this.updateFromAuthData(data);
    this.logger.info?.("sub2api admin token refreshed by login");
    return this.accessToken;
  }

  async refresh() {
    if (this.jwtSigningEnabled) {
      return this.login();
    }
    if (!this.refreshToken) {
      return this.login();
    }
    try {
      const data = await this.authFetch("/auth/refresh", { refresh_token: this.refreshToken });
      this.updateFromAuthData(data);
      this.logger.info?.("sub2api admin token refreshed by refresh_token");
      return this.accessToken;
    } catch (error) {
      this.logger.warn?.("sub2api refresh failed; retrying login", { error: error.message });
      this.clear();
      return this.login();
    }
  }

  async getAccessToken(options = {}) {
    if (this.staticAccessToken) {
      return this.staticAccessToken;
    }
    if (!options.force && this.tokenStillUsable()) {
      return this.accessToken;
    }
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }
}

function getExpectedOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (req.socket.encrypted ? "https" : "http");
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || req.headers.host;
  return host ? `${proto}://${host}` : "";
}

function assertStateChangingRequestIsSameOrigin(req) {
  if (SAFE_METHODS.has(req.method || "GET")) {
    return;
  }
  const origin = req.headers.origin;
  const expectedOrigin = getExpectedOrigin(req);
  if (origin && expectedOrigin && origin !== expectedOrigin) {
    throw Object.assign(new Error("cross_origin_request_rejected"), { statusCode: 403 });
  }
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw Object.assign(new Error("cross_site_request_rejected"), { statusCode: 403 });
  }
}

function isAllowedProxyRoute(method, pathname) {
  return ALLOWED_PROXY_ROUTES.some((route) => route.method === method && route.pattern.test(pathname));
}

function normalizeSensitiveResponseKey(key) {
  return String(key || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function sanitizeAccountProxyPayload(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAccountProxyPayload(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeSensitiveResponseKey(key);
    if (SENSITIVE_ACCOUNT_RESPONSE_KEYS.has(key) || SENSITIVE_ACCOUNT_RESPONSE_KEYS.has(normalizedKey)) {
      continue;
    }
    next[key] = sanitizeAccountProxyPayload(child);
  }
  return next;
}

function sanitizeProxyResponseBuffer(proxyPath, method, responseBuffer, upstreamHeaders) {
  if (method !== "GET" || proxyPath !== "/admin/accounts") {
    return responseBuffer;
  }
  const contentType = String(upstreamHeaders.get("content-type") || "");
  if (contentType && !/json/i.test(contentType)) {
    return responseBuffer;
  }
  try {
    const payload = JSON.parse(responseBuffer.toString("utf8"));
    return Buffer.from(JSON.stringify(sanitizeAccountProxyPayload(payload)));
  } catch {
    return responseBuffer;
  }
}

function getProxyPath(requestPathname, config) {
  const prefix = getApiPrefix(requestPathname, config) || LEGACY_API_PREFIX;
  const stripped = requestPathname.slice(prefix.length) || "/";
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

function copyUpstreamHeaders(upstreamHeaders) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  for (const [key, value] of upstreamHeaders.entries()) {
    const lower = key.toLowerCase();
    if (["connection", "content-encoding", "content-length", "keep-alive", "set-cookie", "transfer-encoding"].includes(lower)) {
      continue;
    }
    headers[key] = value;
  }
  return headers;
}

async function proxyOnce(req, parsedUrl, bodyBuffer, config, tokenManager, runtimeConfig = {}, forceTokenRefresh = false) {
  const effective = getEffectiveSub2ApiProxyConfig(config, runtimeConfig);
  const usesStaticCredential = Boolean(effective.sub2apiAdminApiKey || effective.sub2apiAdminBearerToken);
  const accessToken = usesStaticCredential ? effective.sub2apiAdminBearerToken : await tokenManager.getAccessToken({ force: forceTokenRefresh });
  const targetUrl = joinUrl(effective.sub2apiBaseUrl, getProxyPath(parsedUrl.pathname, config), parsedUrl.search);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  try {
    const headers = {
      Accept: req.headers.accept || "application/json",
    };
    if (effective.sub2apiAdminApiKey) {
      headers["x-api-key"] = effective.sub2apiAdminApiKey;
    } else {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    if (bodyBuffer.length) {
      headers["Content-Type"] = req.headers["content-type"] || "application/json";
    }
    return await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyBuffer.length ? bodyBuffer : undefined,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function handleProxy(req, res, parsedUrl, context) {
  const { config, sessions, tokenManager, runtimeConfigStore } = context;
  if (!sessions.fromRequest(req)) {
    jsonResponse(res, 401, { error: "not_authenticated" });
    return;
  }

  assertStateChangingRequestIsSameOrigin(req);

  const proxyPath = getProxyPath(parsedUrl.pathname, config);
  if (!isAllowedProxyRoute(req.method, proxyPath)) {
    jsonResponse(res, 403, { error: "proxy_route_not_allowed" });
    return;
  }

  const bodyBuffer = SAFE_METHODS.has(req.method) ? Buffer.alloc(0) : await readRequestBody(req, config.maxBodyBytes);
  const runtimeConfig = runtimeConfigStore.read();
  const effective = getEffectiveSub2ApiProxyConfig(config, runtimeConfig);
  let upstream = await proxyOnce(req, parsedUrl, bodyBuffer, config, tokenManager, runtimeConfig, false);
  if (upstream.status === 401 && !effective.sub2apiAdminApiKey && !effective.sub2apiAdminBearerToken) {
    tokenManager.clear();
    upstream = await proxyOnce(req, parsedUrl, bodyBuffer, config, tokenManager, runtimeConfig, true);
  }

  const responseBuffer = sanitizeProxyResponseBuffer(
    proxyPath,
    req.method,
    Buffer.from(await upstream.arrayBuffer()),
    upstream.headers,
  );
  res.writeHead(upstream.status, {
    ...copyUpstreamHeaders(upstream.headers),
    "Content-Length": responseBuffer.length,
  });
  res.end(responseBuffer);
}

async function handleApp(req, res, parsedUrl, context) {
  const { config, sessions } = context;
  const appBasePath = normalizeAppBasePath(config);
  const pathname = parsedUrl.pathname;

  if (pathname === appBasePath) {
    redirectResponse(res, `${appBasePath}/`);
    return;
  }

  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    methodNotAllowed(res);
    return;
  }

  const relativePath = pathname.slice(`${appBasePath}/`.length) || "index.html";
  if (relativePath === "favicon.svg") {
    const faviconPath = getSafeStaticFilePath(config.staticDir, relativePath);
    if (!faviconPath || !fs.existsSync(faviconPath)) {
      notFound(res);
      return;
    }
    serveStaticFile(req, res, faviconPath);
    return;
  }

  const session = sessions.fromRequest(req);
  if (!session) {
    loginPageResponse(res, 401);
    return;
  }

  const staticPath = getSafeStaticFilePath(config.staticDir, relativePath);
  if (!staticPath) {
    notFound(res);
    return;
  }

  if (!fs.existsSync(staticPath)) {
    const fallbackPath = getSafeStaticFilePath(config.staticDir, "index.html");
    serveStaticFile(req, res, fallbackPath);
    return;
  }

  serveStaticFile(req, res, staticPath);
}

async function handleAuth(req, res, parsedUrl, context) {
  const { config, sessions, runtimeConfigStore, loginRateLimiter } = context;
  const pathname = getNormalizedAuthPath(parsedUrl.pathname, config);

  if (pathname === "/token-manager-auth/health") {
    if (req.method !== "GET") return methodNotAllowed(res);
    jsonResponse(res, 200, { ok: true });
    return;
  }

  if (pathname === "/token-manager-auth/check") {
    if (req.method !== "GET") return methodNotAllowed(res);
    const session = sessions.fromRequest(req);
    if (session) {
      res.writeHead(204, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end();
    } else {
      loginPageResponse(res, 401);
    }
    return;
  }

  if (pathname === "/token-manager-auth/login-page") {
    if (req.method !== "GET") return methodNotAllowed(res);
    loginPageResponse(res, 200);
    return;
  }

  if (pathname === "/token-manager-auth/me") {
    if (req.method !== "GET") return methodNotAllowed(res);
    const session = sessions.fromRequest(req);
    jsonResponse(res, 200, session
      ? { authenticated: true, expires_at: new Date(session.expiresAt).toISOString() }
      : { authenticated: false });
    return;
  }

  if (pathname === "/token-manager-auth/config") {
    if (!["GET", "POST"].includes(req.method)) return methodNotAllowed(res);
    const session = sessions.fromRequest(req);
    if (!session) {
      jsonResponse(res, 401, { error: "not_authenticated" });
      return;
    }
    if (req.method === "POST") {
      assertStateChangingRequestIsSameOrigin(req);
      const payload = await readJsonBody(req, config.maxBodyBytes);
      const next = runtimeConfigStore.update(payload);
      jsonResponse(res, 200, buildPublicConfig(config, next), { "Cache-Control": "no-store" });
      return;
    }
    jsonResponse(res, 200, buildPublicConfig(config, runtimeConfigStore.read()), {
      "Cache-Control": "no-store",
    });
    return;
  }

  if (pathname === "/token-manager-auth/password") {
    if (req.method !== "POST") return methodNotAllowed(res);
    const session = sessions.fromRequest(req);
    if (!session) {
      jsonResponse(res, 401, { error: "not_authenticated" });
      return;
    }
    assertStateChangingRequestIsSameOrigin(req);
    const payload = await readJsonBody(req, config.maxBodyBytes);
    const password = String(payload.new_password || payload.password || "");
    if (password.length < 8) {
      jsonResponse(res, 400, { error: "password_too_short" });
      return;
    }
    const encoded = await hashPassword(password);
    writeEnvFileValue(config.envFile, "TOKENMANAGER_PASSWORD_HASH", encoded);
    config.loginPasswordHash = encoded;
    config.loginPassword = "";
    jsonResponse(res, 200, { ok: true, updated: true });
    return;
  }

  if (pathname === "/token-manager-auth/login") {
    if (req.method !== "POST") return methodNotAllowed(res);
    assertStateChangingRequestIsSameOrigin(req);
    const payload = await readJsonBody(req, config.maxBodyBytes);
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");
    const rateLimitKey = getLoginRateLimitKey(req, username);
    const rateLimit = loginRateLimiter.check(rateLimitKey);
    if (!rateLimit.allowed) {
      jsonResponse(res, 429, {
        error: "too_many_login_attempts",
        retry_after_seconds: rateLimit.retryAfterSeconds,
      }, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
      return;
    }
    const usernameOk = !config.loginUsername || timingSafeStringEqual(username, config.loginUsername);
    const passwordOk = password && await verifyLoginPassword(password, config);
    if (!usernameOk || !passwordOk) {
      const failure = loginRateLimiter.recordFailure(rateLimitKey);
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (failure.locked) {
        jsonResponse(res, 429, {
          error: "too_many_login_attempts",
          retry_after_seconds: failure.retryAfterSeconds,
        }, {
          "Retry-After": String(failure.retryAfterSeconds),
        });
        return;
      }
      jsonResponse(res, 401, { error: "invalid_credentials" });
      return;
    }

    loginRateLimiter.recordSuccess(rateLimitKey);
    sessions.cleanup();
    const session = sessions.create();
    const cookie = serializeCookie(config.cookieName, session.value, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: config.cookieSameSite,
      path: config.cookiePath,
      maxAge: config.sessionTtlSeconds,
      expires: new Date(session.expiresAt),
    });
    jsonResponse(res, 200, {
      authenticated: true,
      expires_at: new Date(session.expiresAt).toISOString(),
    }, { "Set-Cookie": cookie });
    return;
  }

  if (pathname === "/token-manager-auth/logout") {
    if (req.method !== "POST") return methodNotAllowed(res);
    assertStateChangingRequestIsSameOrigin(req);
    const cookies = parseCookies(req.headers.cookie);
    sessions.destroy(cookies.get(config.cookieName));
    const cookie = serializeCookie(config.cookieName, "", {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: config.cookieSameSite,
      path: config.cookiePath,
      maxAge: 0,
      expires: new Date(0),
    });
    jsonResponse(res, 200, { authenticated: false }, { "Set-Cookie": cookie });
    return;
  }

  notFound(res);
}

function createTokenManagerServer(options = {}) {
  const config = options.config || createConfig(options.env || process.env);
  const logger = options.logger || console;
  const sessions = options.sessions || new SessionManager(config);
  const loginRateLimiter = options.loginRateLimiter || new LoginRateLimiter(config);
  const tokenManager = options.tokenManager || new Sub2ApiTokenManager(config, logger);
  const runtimeConfigStore = options.runtimeConfigStore || new RuntimeConfigStore(config);
  const context = { config, logger, sessions, loginRateLimiter, tokenManager, runtimeConfigStore };

  return http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      if (getNormalizedAuthPath(parsedUrl.pathname, config)) {
        await handleAuth(req, res, parsedUrl, context);
        return;
      }
      if (getApiPrefix(parsedUrl.pathname, config)) {
        if (config.authOnly) {
          notFound(res);
        } else {
          await handleProxy(req, res, parsedUrl, context);
        }
        return;
      }
      if (pathStartsWithPrefix(parsedUrl.pathname, normalizeAppBasePath(config))) {
        await handleApp(req, res, parsedUrl, context);
        return;
      }
      notFound(res);
    } catch (error) {
      const status = error.statusCode || (error.name === "AbortError" ? 504 : 500);
      const publicMessage = status >= 500 ? "internal_server_error" : error.message;
      logger.error?.("tokenmanager request failed", { status, error: error.message });
      if (!res.headersSent) {
        jsonResponse(res, status, { error: publicMessage });
      } else {
        res.end();
      }
    }
  });
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateEnvFileText(text, key, value) {
  const assignment = `${key}=${value}`;
  const lines = String(text || "").split(/\r?\n/);
  const matcher = new RegExp(`^(\\s*)(export\\s+)?${escapeRegExp(key)}\\s*=`);
  let replaced = false;
  const next = lines.map((line) => {
    if (!replaced && !line.trimStart().startsWith("#") && matcher.test(line)) {
      const [, indent = "", exportPrefix = ""] = line.match(matcher) || [];
      replaced = true;
      return `${indent}${exportPrefix || ""}${assignment}`;
    }
    return line;
  });

  while (next.length && next[next.length - 1] === "") {
    next.pop();
  }
  if (!replaced) {
    next.push(assignment);
  }
  return `${next.join("\n")}\n`;
}

function writeEnvFileValue(filePath, key, value) {
  const resolved = path.resolve(filePath);
  const current = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : "";
  const next = updateEnvFileText(current, key, value);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tmp = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, next, { mode: 0o600 });
  fs.renameSync(tmp, resolved);
  try {
    fs.chmodSync(resolved, 0o600);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }
  return resolved;
}

async function setLoginPassword(argv = []) {
  let envFile = process.env.TOKENMANAGER_ENV_FILE || path.join(process.cwd(), "server", ".env");
  const passwordParts = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env") {
      index += 1;
      envFile = argv[index] || envFile;
    } else if (arg.startsWith("--env=")) {
      envFile = arg.slice("--env=".length);
    } else {
      passwordParts.push(arg);
    }
  }

  const password = passwordParts.length
    ? passwordParts.join(" ")
    : (await readStdin()).replace(/[\r\n]+$/, "");
  if (!password) {
    throw new Error("password is required on stdin or argv");
  }

  const encoded = await hashPassword(password);
  const updatedFile = writeEnvFileValue(envFile, "TOKENMANAGER_PASSWORD_HASH", encoded);
  process.stdout.write(`Updated TOKENMANAGER_PASSWORD_HASH in ${updatedFile}\n`);
  process.stdout.write("Restart tokenmanager-bff for the new password to take effect.\n");
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === "hash-password") {
    const password = argv[1] !== undefined ? argv.slice(1).join(" ") : (await readStdin()).replace(/[\r\n]+$/, "");
    if (!password) {
      throw new Error("password is required on stdin or argv");
    }
    process.stdout.write(`${await hashPassword(password)}\n`);
    return;
  }
  if (argv[0] === "set-login-password" || argv[0] === "set-password") {
    await setLoginPassword(argv.slice(1));
    return;
  }

  loadDefaultEnvFiles();
  const config = createConfig();
  validateRuntimeConfig(config);
  const server = createTokenManagerServer({ config });
  server.listen(config.port, config.host, () => {
    console.log(`TokenManager BFF listening on ${config.host}:${config.port}`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  ALLOWED_PROXY_ROUTES,
  LoginRateLimiter,
  RuntimeConfigStore,
  SessionManager,
  Sub2ApiTokenManager,
  createConfig,
  createSub2ApiBrowserDefaults,
  createSub2ApiBrowserDefaultUrl,
  createTokenManagerServer,
  getEffectiveSub2ApiProxyConfig,
  hashPassword,
  hmac,
  loadEnvFile,
  setLoginPassword,
  updateEnvFileText,
  validateRuntimeConfig,
  verifyPasswordHash,
  writeEnvFileValue,
};
