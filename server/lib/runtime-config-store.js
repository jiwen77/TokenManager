"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_IMPORT_PATH = "/api/v1/admin/accounts/data";
const ENCRYPTED_SECRET_PREFIX = "enc:v1";
const MAX_SERVER_ACCOUNT_CACHE_ITEMS = 100;

function normalizePublicPath(value, fallback = "/api/v1") {
  const raw = String(value || fallback).trim();
  if (!raw) {
    return fallback;
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function normalizeSub2ApiSelectionId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const stringValue = String(value).trim();
  return /^\d+$/.test(stringValue) ? Number.parseInt(stringValue, 10) : stringValue;
}

function normalizeSub2ApiGroupIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(normalizeSub2ApiSelectionId)
    .filter((item) => item !== null);
}

function normalizeSub2ApiSelectionIds(value) {
  return normalizeSub2ApiGroupIds(value);
}

function normalizeSub2ApiMetaOptions(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        const id = normalizeSub2ApiSelectionId(item);
        return id === null ? null : { id, name: String(item) };
      }
      const id = normalizeSub2ApiSelectionId(item.id ?? item.value ?? item.key ?? item.name);
      if (id === null) {
        return null;
      }
      return {
        id,
        name: String(item.name ?? item.label ?? item.title ?? item.id ?? id),
      };
    })
    .filter(Boolean)
    .filter((item) => {
      const key = String(item.id);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function firstDisplayValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function normalizeServerAccountCache(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, MAX_SERVER_ACCOUNT_CACHE_ITEMS)
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const credentials = item.credentials && typeof item.credentials === "object" ? item.credentials : {};
      const extra = item.extra && typeof item.extra === "object" ? item.extra : {};
      const id = firstDisplayValue(item.id, item.account_id, item.accountId, item.uuid);
      const email = firstDisplayValue(item.email, credentials.email, extra.email);
      const name = firstDisplayValue(item.name, item.display_name, item.displayName, email, credentials.chatgpt_account_id, id);
      const expiresAt = firstDisplayValue(item.expires_at, item.expiresAt, credentials.expires_at, credentials.expiresAt);
      const status = firstDisplayValue(
        item.status,
        item.state,
        item.disabled === true ? "disabled" : item.disabled === false ? "active" : "",
      );

      if (!id && !name && !email && !expiresAt && !status) {
        return null;
      }

      return {
        id,
        name,
        email,
        expires_at: expiresAt,
        status,
      };
    })
    .filter(Boolean);
}

function normalizeFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeNonNegativeInteger(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeUnixSeconds(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return Math.floor(number > 1e11 ? number / 1000 : number);
}

function normalizeSub2ApiWebsocketMode(value, fallback = "off") {
  const normalized = String(value || fallback || "off").trim().toLowerCase();
  return ["off", "ctx_pool", "passthrough"].includes(normalized) ? normalized : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function isLocalOrPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host === "0.0.0.0") {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function getHostnameFromHostPort(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end > 0 ? raw.slice(1, end) : raw;
  }
  return raw.split(":")[0];
}

function normalizeSub2ApiOrigin(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw || raw.startsWith("/")) {
    return "";
  }

  const candidate = /^https?:\/\//i.test(raw)
    ? raw
    : raw.startsWith("//")
      ? `http:${raw}`
      : (() => {
          const host = raw.split(/[/?#]/)[0];
          const protocol = isLocalOrPrivateHost(getHostnameFromHostPort(host)) ? "http" : "https";
          return `${protocol}://${raw}`;
        })();

  try {
    return new URL(candidate).origin;
  } catch {
    return raw;
  }
}

function sanitizeRuntimeConfig(value = {}, current = {}) {
  const next = { ...current };
  const origin = String(value.sub2api_default_origin ?? value.sub2apiDefaultOrigin ?? value.sub2api_origin ?? value.sub2apiOrigin ?? "").trim();
  if (origin) {
    next.sub2apiOrigin = normalizeSub2ApiOrigin(origin);
  }

  const importPath = String(value.sub2api_import_path ?? value.sub2apiImportPath ?? "").trim();
  if (importPath) {
    next.sub2apiImportPath = normalizePublicPath(importPath, DEFAULT_IMPORT_PATH);
  }

  if (value.clear_sub2api_bearer_token === true || value.clearSub2apiBearerToken === true) {
    delete next.sub2apiBearerToken;
  } else {
    const bearerToken = String(value.sub2api_bearer_token ?? value.sub2apiBearerToken ?? "").trim();
    if (bearerToken) {
      next.sub2apiBearerToken = bearerToken.replace(/^Bearer\s+/i, "");
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "group_ids") || Object.prototype.hasOwnProperty.call(value, "groupIds")) {
    next.groupIds = normalizeSub2ApiGroupIds(value.group_ids ?? value.groupIds);
  }

  if (Object.prototype.hasOwnProperty.call(value, "group_options") || Object.prototype.hasOwnProperty.call(value, "groupOptions")) {
    next.groupOptions = normalizeSub2ApiMetaOptions(value.group_options ?? value.groupOptions);
    next.metaCachedAt = new Date().toISOString();
  }

  if (Object.prototype.hasOwnProperty.call(value, "proxy_options") || Object.prototype.hasOwnProperty.call(value, "proxyOptions")) {
    next.proxyOptions = normalizeSub2ApiMetaOptions(value.proxy_options ?? value.proxyOptions);
    next.metaCachedAt = new Date().toISOString();
  }

  if (Object.prototype.hasOwnProperty.call(value, "server_account_cache") || Object.prototype.hasOwnProperty.call(value, "serverAccountCache")) {
    next.serverAccountCache = normalizeServerAccountCache(value.server_account_cache ?? value.serverAccountCache);
    next.serverAccountTotal = normalizeFiniteNumber(value.server_account_total ?? value.serverAccountTotal, next.serverAccountCache.length);
    next.serverAccountsCachedAt = new Date().toISOString();
  } else if (Object.prototype.hasOwnProperty.call(value, "server_account_total") || Object.prototype.hasOwnProperty.call(value, "serverAccountTotal")) {
    next.serverAccountTotal = normalizeFiniteNumber(value.server_account_total ?? value.serverAccountTotal, current.serverAccountTotal ?? 0);
  }

  if (Object.prototype.hasOwnProperty.call(value, "proxy_ids") || Object.prototype.hasOwnProperty.call(value, "proxyIds")) {
    next.proxyIds = normalizeSub2ApiSelectionIds(value.proxy_ids ?? value.proxyIds);
    next.proxyId = next.proxyIds.length ? next.proxyIds[0] : null;
  } else if (Object.prototype.hasOwnProperty.call(value, "proxy_id") || Object.prototype.hasOwnProperty.call(value, "proxyId")) {
    next.proxyId = normalizeSub2ApiSelectionId(value.proxy_id ?? value.proxyId);
    next.proxyIds = next.proxyId === null ? [] : [next.proxyId];
  }

  if (Object.prototype.hasOwnProperty.call(value, "priority")) {
    next.priority = normalizeFiniteNumber(value.priority, current.priority ?? 1);
  }

  if (Object.prototype.hasOwnProperty.call(value, "concurrency")) {
    next.concurrency = normalizeNonNegativeInteger(value.concurrency, current.concurrency ?? 10);
  }

  if (Object.prototype.hasOwnProperty.call(value, "expires_at") || Object.prototype.hasOwnProperty.call(value, "expiresAt")) {
    const expiresAt = normalizeUnixSeconds(value.expires_at ?? value.expiresAt);
    if (expiresAt === null) {
      delete next.expiresAt;
    } else {
      next.expiresAt = expiresAt;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "rate_multiplier") || Object.prototype.hasOwnProperty.call(value, "rateMultiplier")) {
    next.rateMultiplier = normalizeFiniteNumber(value.rate_multiplier ?? value.rateMultiplier, current.rateMultiplier ?? 1);
  }

  if (Object.prototype.hasOwnProperty.call(value, "websocket_mode") || Object.prototype.hasOwnProperty.call(value, "websocketMode") || Object.prototype.hasOwnProperty.call(value, "ws_mode") || Object.prototype.hasOwnProperty.call(value, "wsMode")) {
    next.websocketMode = normalizeSub2ApiWebsocketMode(value.websocket_mode ?? value.websocketMode ?? value.ws_mode ?? value.wsMode, current.websocketMode ?? "off");
  }

  if (Object.prototype.hasOwnProperty.call(value, "auto_passthrough") || Object.prototype.hasOwnProperty.call(value, "autoPassthrough")) {
    next.autoPassthrough = normalizeBoolean(value.auto_passthrough ?? value.autoPassthrough, current.autoPassthrough ?? false);
  }

  if (Object.prototype.hasOwnProperty.call(value, "set_privacy") || Object.prototype.hasOwnProperty.call(value, "setPrivacy")) {
    next.setPrivacy = normalizeBoolean(value.set_privacy ?? value.setPrivacy, current.setPrivacy ?? false);
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

function getKeyBuffer(keyMaterial) {
  const raw = String(keyMaterial || "");
  if (!raw) {
    throw new Error("TOKENMANAGER_ENCRYPTION_KEY or TOKENMANAGER_SESSION_SECRET is required to encrypt runtime secrets");
  }

  const trimmed = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall through to KDF.
  }

  return crypto.createHash("sha256").update(raw).digest();
}

function encryptSecret(plaintext, keyMaterial) {
  const value = String(plaintext || "");
  if (!value) {
    return "";
  }
  const key = getKeyBuffer(keyMaterial);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTED_SECRET_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

function decryptSecret(value, keyMaterial) {
  const raw = String(value || "");
  if (!raw) {
    return "";
  }
  if (!raw.startsWith(`${ENCRYPTED_SECRET_PREFIX}:`)) {
    return raw;
  }
  const [, , ivPart, tagPart, ciphertextPart] = raw.split(":");
  const key = getKeyBuffer(keyMaterial);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

class JsonRuntimeConfigStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  read() {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      return {};
    }
    try {
      return sanitizeRuntimeConfig(JSON.parse(fs.readFileSync(this.filePath, "utf8")), {});
    } catch {
      return {};
    }
  }

  write(value) {
    if (!this.filePath) {
      return value;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    try {
      fs.chmodSync(this.filePath, 0o600);
    } catch {
      // Best effort on filesystems that do not support chmod.
    }
    return value;
  }

  update(patch) {
    const current = this.read();
    const next = sanitizeRuntimeConfig(patch, current);
    return this.write(next);
  }
}

function runSqlitePython({ pythonBin, databaseFile, command, data }) {
  const script = String.raw`
import json
import os
import sqlite3
import sys

payload = json.loads(sys.stdin.read() or '{}')
database_file = payload['databaseFile']
command = payload['command']
os.makedirs(os.path.dirname(database_file) or '.', exist_ok=True)
conn = sqlite3.connect(database_file)
try:
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('CREATE TABLE IF NOT EXISTS runtime_config (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL)')
    if command == 'read':
        row = conn.execute('SELECT data FROM runtime_config WHERE id = 1').fetchone()
        print(row[0] if row else '{}')
    elif command == 'write':
        data = json.dumps(payload.get('data') or {}, ensure_ascii=False, separators=(',', ':'))
        updated_at = (payload.get('data') or {}).get('updatedAt') or ''
        conn.execute('INSERT INTO runtime_config (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at', (data, updated_at))
        conn.commit()
        print(data)
    else:
        raise SystemExit('unsupported command: ' + command)
finally:
    conn.close()
`;

  const result = spawnSync(pythonBin || "python3", ["-c", script], {
    input: JSON.stringify({ databaseFile, command, data }),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "sqlite command failed").trim());
  }
  return result.stdout.trim() || "{}";
}

class SqliteRuntimeConfigStore {
  constructor(options = {}) {
    this.databaseFile = options.databaseFile;
    this.legacyJsonFile = options.legacyJsonFile;
    this.encryptionKey = options.encryptionKey;
    this.pythonBin = options.pythonBin || "python3";
    if (!this.databaseFile) {
      throw new Error("TOKENMANAGER_DATABASE_FILE is required for sqlite runtime config storage");
    }
    this.migrateFromLegacyJsonIfNeeded();
  }

  readRaw() {
    try {
      return JSON.parse(runSqlitePython({
        pythonBin: this.pythonBin,
        databaseFile: this.databaseFile,
        command: "read",
      }));
    } catch {
      return {};
    }
  }

  writeRaw(value) {
    const parsed = JSON.parse(runSqlitePython({
      pythonBin: this.pythonBin,
      databaseFile: this.databaseFile,
      command: "write",
      data: value,
    }));
    try {
      fs.chmodSync(this.databaseFile, 0o600);
    } catch {
      // Best effort on filesystems that do not support chmod.
    }
    return parsed;
  }

  serialize(value) {
    const next = { ...value };
    if (next.sub2apiBearerToken) {
      next.sub2apiBearerTokenEncrypted = encryptSecret(next.sub2apiBearerToken, this.encryptionKey);
      delete next.sub2apiBearerToken;
    }
    return next;
  }

  deserialize(value) {
    const next = { ...value };
    if (next.sub2apiBearerTokenEncrypted) {
      next.sub2apiBearerToken = decryptSecret(next.sub2apiBearerTokenEncrypted, this.encryptionKey);
      delete next.sub2apiBearerTokenEncrypted;
    }
    return sanitizeRuntimeConfig(next, {});
  }

  hasData() {
    return Object.keys(this.readRaw()).length > 0;
  }

  migrateFromLegacyJsonIfNeeded() {
    if (!this.legacyJsonFile || !fs.existsSync(this.legacyJsonFile) || this.hasData()) {
      return;
    }
    try {
      const legacy = sanitizeRuntimeConfig(JSON.parse(fs.readFileSync(this.legacyJsonFile, "utf8")), {});
      if (Object.keys(legacy).length) {
        this.write(legacy);
      }
    } catch {
      // Ignore unreadable legacy config; the app can still start with empty runtime config.
    }
  }

  read() {
    return this.deserialize(this.readRaw());
  }

  write(value) {
    this.writeRaw(this.serialize(value));
    return value;
  }

  update(patch) {
    const current = this.read();
    const next = sanitizeRuntimeConfig(patch, current);
    return this.write(next);
  }
}

class RuntimeConfigStore {
  constructor(options = {}) {
    if (typeof options === "string") {
      this.impl = new JsonRuntimeConfigStore(options);
      return;
    }
    const backend = String(options.storageBackend || "sqlite").trim().toLowerCase();
    if (backend === "json") {
      this.impl = new JsonRuntimeConfigStore(options.runtimeConfigFile || options.filePath);
      return;
    }
    this.impl = new SqliteRuntimeConfigStore({
      databaseFile: options.databaseFile,
      legacyJsonFile: options.runtimeConfigFile || options.legacyJsonFile,
      encryptionKey: options.encryptionKey || options.sessionSecret,
      pythonBin: options.pythonBin,
    });
  }

  read() {
    return this.impl.read();
  }

  write(value) {
    return this.impl.write(value);
  }

  update(patch) {
    return this.impl.update(patch);
  }

  readRaw() {
    return typeof this.impl.readRaw === "function" ? this.impl.readRaw() : this.impl.read();
  }
}

module.exports = {
  JsonRuntimeConfigStore,
  RuntimeConfigStore,
  SqliteRuntimeConfigStore,
  decryptSecret,
  encryptSecret,
  normalizeFiniteNumber,
  normalizeNonNegativeInteger,
  normalizeUnixSeconds,
  normalizeSub2ApiWebsocketMode,
  normalizeSub2ApiGroupIds,
  normalizeSub2ApiMetaOptions,
  normalizeSub2ApiSelectionIds,
  normalizeServerAccountCache,
  normalizeSub2ApiOrigin,
  normalizeSub2ApiSelectionId,
  sanitizeRuntimeConfig,
};
