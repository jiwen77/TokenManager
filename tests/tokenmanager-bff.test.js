#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { RuntimeConfigStore, createSub2ApiBrowserDefaults, createSub2ApiBrowserDefaultUrl, createTokenManagerServer, hashPassword, updateEnvFileText, verifyPasswordHash } = require("../server/tokenmanager-bff");
const { normalizeServerAccountCache } = require("../server/lib/runtime-config-store");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function startMockSub2Api(handler) {
  const server = http.createServer(handler);
  const baseUrl = await listen(server);
  return {
    server,
    baseUrl: `${baseUrl}/api/v1`,
    close: () => close(server),
  };
}

async function startBff(configOverrides = {}, sub2apiBaseUrl) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenmanager-bff-"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    sub2apiBaseUrl,
    sub2apiAdminEmail: "admin@example.com",
    sub2apiAdminPassword: "sub2api-admin-password",
    loginUsername: "",
    loginPasswordHash: "",
    loginPassword: "tokenmanager-password",
    sessionSecret: "test-session-secret-that-is-long-enough-12345",
    sessionTtlSeconds: 3600,
    cookieName: "tokenmanager-session",
    cookieSecure: true,
    cookieSameSite: "Lax",
    cookiePath: "/",
    loginMaxFailures: 5,
    loginWindowSeconds: 900,
    loginLockSeconds: 900,
    maxBodyBytes: 1024 * 1024,
    upstreamTimeoutMs: 5000,
    sub2apiBrowserDefaults: { origin: "", adminBasePath: "/api/v1", apiBasePath: "/api/v1", importPath: "/api/v1/admin/accounts/data", defaultUrl: "" },
    staticDir: path.join(__dirname, "..", "docs"),
    storageBackend: "sqlite",
    databaseFile: path.join(tempDir, "tokenmanager.sqlite"),
    encryptionKey: "test-session-secret-that-is-long-enough-12345",
    envFile: path.join(tempDir, ".env"),
    pythonBin: "python3",
    runtimeConfigFile: path.join(tempDir, "runtime-config.json"),
    ...configOverrides,
  };
  const server = createTokenManagerServer({ config, logger: { info() {}, warn() {}, error() {} } });
  const baseUrl = await listen(server);
  return { server, baseUrl, close: () => close(server) };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null,
  };
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  return {
    response,
    body: await response.text(),
  };
}

test("hashPassword creates verifiable scrypt hashes", async () => {
  const encoded = await hashPassword("secret-password", { salt: Buffer.from("1234567890123456"), N: 1024, r: 8, p: 1 });
  assert.match(encoded, /^scrypt:v1:/);
  assert.equal(await verifyPasswordHash("secret-password", encoded), true);
  assert.equal(await verifyPasswordHash("wrong-password", encoded), false);
});

test("updateEnvFileText replaces or appends login password hash", () => {
  const updated = updateEnvFileText([
    "# TOKENMANAGER_PASSWORD_HASH=commented",
    "TOKENMANAGER_SESSION_SECRET=session-secret",
    "export TOKENMANAGER_PASSWORD_HASH=old-hash",
    "SUB2API_BASE_URL=http://127.0.0.1:8080/api/v1",
    "",
  ].join("\n"), "TOKENMANAGER_PASSWORD_HASH", "new-hash");

  assert.match(updated, /^# TOKENMANAGER_PASSWORD_HASH=commented/m);
  assert.match(updated, /^TOKENMANAGER_SESSION_SECRET=session-secret/m);
  assert.match(updated, /^export TOKENMANAGER_PASSWORD_HASH=new-hash/m);
  assert.doesNotMatch(updated, /old-hash/);
  assert.match(updated, /^SUB2API_BASE_URL=http:\/\/127\.0\.0\.1:8080\/api\/v1/m);

  const appended = updateEnvFileText("TOKENMANAGER_SESSION_SECRET=session-secret\n", "TOKENMANAGER_PASSWORD_HASH", "new-hash");
  assert.match(appended, /^TOKENMANAGER_PASSWORD_HASH=new-hash/m);
  assert.equal(appended.endsWith("\n"), true);
});

test("server account cache normalization preserves sub2api account fields", () => {
  assert.deepEqual(normalizeServerAccountCache([{
    id: 127,
    name: "beailcgggw@teamtc.lol",
    platform: "openai",
    type: "oauth",
    credentials: {
      email: "beailcgggw@teamtc.lol",
      plan_type: "team",
      refresh_token: "must-not-be-persisted",
    },
    extra: {
      privacy_mode: "enabled",
      openai_passthrough: true,
    },
    proxy_id: 7,
    proxy: { id: 7, name: "1024Proxy LA" },
    concurrency: 2,
    current_concurrency: 0,
    priority: 2,
    rate_multiplier: 1,
    status: "active",
    expires_at: 1781580950,
    last_used_at: 0,
    created_at: "2026-06-06T23:17:41.474312+08:00",
    updated_at: "2026-06-06T23:20:53.473457+08:00",
    account_groups: [
      { group_id: 5, priority: 1, group: { id: 5, name: "Codex额度" } },
      { group_id: 2, priority: 2, group: { id: 2, name: "Codex" } },
    ],
    group_ids: [5, 2],
  }]), [{
    id: "127",
    name: "beailcgggw@teamtc.lol",
    email: "beailcgggw@teamtc.lol",
    platform: "openai",
    type: "oauth",
    plan_type: "team",
    status: "active",
    privacy_mode: "enabled",
    groups: "Codex额度、Codex",
    proxy: "1024Proxy LA (#7)",
    concurrency: "0 / 2",
    priority: "2",
    rate_multiplier: "1",
    expires_at: "1781580950",
    created_at: "2026-06-06T23:17:41.474312+08:00",
    updated_at: "2026-06-06T23:20:53.473457+08:00",
    last_used_at: "",
  }]);
});

test("browser-facing sub2api defaults keep server origin separate from API paths", () => {
  assert.deepEqual(createSub2ApiBrowserDefaults({}), {
    origin: "",
    adminBasePath: "/api/v1",
    apiBasePath: "/api/v1",
    importPath: "/api/v1/admin/accounts/data",
    defaultUrl: "",
  });
  assert.deepEqual(
    createSub2ApiBrowserDefaults({
      TOKENMANAGER_SUB2API_DEFAULT_ORIGIN: "https://api.example.com",
      TOKENMANAGER_SUB2API_API_BASE_PATH: "custom/api",
      TOKENMANAGER_SUB2API_IMPORT_PATH: "admin/import",
    }),
    {
      origin: "https://api.example.com",
      adminBasePath: "/custom/api",
      apiBasePath: "/custom/api",
      importPath: "/custom/api/admin/import",
      defaultUrl: "https://api.example.com",
    },
  );
  assert.deepEqual(
    createSub2ApiBrowserDefaults({ TOKENMANAGER_SUB2API_DEFAULT_URL: "https://sub2api.example.com/api/v1" }),
    {
      origin: "https://sub2api.example.com",
      adminBasePath: "/api/v1",
      apiBasePath: "/api/v1",
      importPath: "/api/v1/admin/accounts/data",
      defaultUrl: "https://sub2api.example.com",
    },
  );
  assert.equal(createSub2ApiBrowserDefaultUrl({ TOKENMANAGER_SUB2API_DEFAULT_ORIGIN: "api.example.com" }), "api.example.com");
});


test("unauthenticated proxy calls are rejected before sub2api is contacted", async () => {
  let upstreamCalls = 0;
  const mock = await startMockSub2Api((_req, res) => {
    upstreamCalls += 1;
    res.writeHead(500).end();
  });
  const bff = await startBff({}, mock.baseUrl);

  try {
    const { response, body } = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts`);
    assert.equal(response.status, 401);
    assert.equal(body.error, "not_authenticated");
    assert.equal(upstreamCalls, 0);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("malformed cookie values do not crash authentication checks", async () => {
  const mock = await startMockSub2Api((_req, res) => res.writeHead(404).end());
  const bff = await startBff({ authOnly: true, sub2apiAdminEmail: "", sub2apiAdminPassword: "" }, mock.baseUrl);

  try {
    const checked = await fetchJson(`${bff.baseUrl}/token-manager-auth/config`, {
      headers: { Cookie: "tokenmanager-session=%E0%A4%A" },
    });
    assert.equal(checked.response.status, 401);
    assert.equal(checked.body.error, "not_authenticated");
  } finally {
    await bff.close();
    await mock.close();
  }
});


test("page gate shows an in-page password form and needs no username", async () => {
  const mock = await startMockSub2Api((_req, res) => res.writeHead(404).end());
  const bff = await startBff({ authOnly: true, sub2apiAdminEmail: "", sub2apiAdminPassword: "" }, mock.baseUrl);

  try {
    const gate = await fetchText(`${bff.baseUrl}/token-manager-auth/check`);
    assert.equal(gate.response.status, 401);
    assert.match(gate.response.headers.get("content-type") || "", /text\/html/);
    assert.doesNotMatch(gate.response.headers.get("content-security-policy") || "", /unsafe-inline/);
    assert.match(gate.response.headers.get("content-security-policy") || "", /script-src 'self' 'nonce-[^']+'/);
    assert.match(gate.body, /<script nonce="/);
    assert.match(gate.body, /<style nonce="/);
    assert.match(gate.body, /<h1>TokenManager<\/h1>/);
    assert.doesNotMatch(gate.body, /无需用户名/);
    assert.doesNotMatch(gate.body, /name=["']username["']/);
    assert.equal(gate.response.headers.has("www-authenticate"), false);

    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const allowed = await fetchText(`${bff.baseUrl}/token-manager-auth/check`, {
      headers: { Cookie: cookie },
    });
    assert.equal(allowed.response.status, 204);
    assert.equal(allowed.body, "");
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("login rate limiter locks repeated failed attempts and rejects even a correct password while locked", async () => {
  const mock = await startMockSub2Api((_req, res) => res.writeHead(404).end());
  const bff = await startBff({
    authOnly: true,
    sub2apiAdminEmail: "",
    sub2apiAdminPassword: "",
    loginMaxFailures: 2,
    loginWindowSeconds: 60,
    loginLockSeconds: 60,
  }, mock.baseUrl);

  try {
    const badOne = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.5" },
      body: JSON.stringify({ password: "wrong-one" }),
    });
    assert.equal(badOne.response.status, 401);

    const badTwo = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.5" },
      body: JSON.stringify({ password: "wrong-two" }),
    });
    assert.equal(badTwo.response.status, 429);
    assert.equal(badTwo.body.error, "too_many_login_attempts");
    assert.equal(badTwo.response.headers.get("retry-after"), "60");

    const correctWhileLocked = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.5" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    assert.equal(correctWhileLocked.response.status, 429);

    const correctDifferentIp = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.6" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    assert.equal(correctDifferentIp.response.status, 200);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("successful login clears previous failed attempts before threshold", async () => {
  const mock = await startMockSub2Api((_req, res) => res.writeHead(404).end());
  const bff = await startBff({
    authOnly: true,
    sub2apiAdminEmail: "",
    sub2apiAdminPassword: "",
    loginMaxFailures: 2,
    loginWindowSeconds: 60,
    loginLockSeconds: 60,
  }, mock.baseUrl);

  try {
    const bad = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.9" },
      body: JSON.stringify({ password: "wrong" }),
    });
    assert.equal(bad.response.status, 401);

    const good = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.9" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    assert.equal(good.response.status, 200);

    const badAgain = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.9" },
      body: JSON.stringify({ password: "wrong-again" }),
    });
    assert.equal(badAgain.response.status, 401);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("state-changing auth/config/proxy requests reject cross-origin callers", async () => {
  let upstreamCalls = 0;
  const mock = await startMockSub2Api((_req, res) => {
    upstreamCalls += 1;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const bff = await startBff({ sub2apiAdminBearerToken: "static-admin-token", sub2apiAdminPassword: "" }, mock.baseUrl);

  try {
    const crossOriginLogin = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    assert.equal(crossOriginLogin.response.status, 403);

    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const crossOriginConfig = await fetchJson(`${bff.baseUrl}/token-manager-auth/config`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ priority: 9 }),
    });
    assert.equal(crossOriginConfig.response.status, 403);

    const crossOriginProxy = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts/batch`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ accounts: [] }),
    });
    assert.equal(crossOriginProxy.response.status, 403);
    assert.equal(upstreamCalls, 0);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("BFF serves the TokenManager app and nested routes under one app prefix", async () => {
  const upstreamRequests = [];
  const mock = await startMockSub2Api((req, res) => {
    upstreamRequests.push(req.url);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: { items: [], total: 0 } }));
  });
  const bff = await startBff({
    sub2apiAdminApiKey: "test-api-key",
    sub2apiAdminEmail: "",
    sub2apiAdminPassword: "",
  }, mock.baseUrl);

  try {
    const redirect = await fetchText(`${bff.baseUrl}/token-manager`, { redirect: "manual" });
    assert.equal(redirect.response.status, 308);
    assert.equal(redirect.response.headers.get("location"), "/token-manager/");

    const unauthenticatedPage = await fetchText(`${bff.baseUrl}/token-manager/`);
    assert.equal(unauthenticatedPage.response.status, 401);
    assert.match(unauthenticatedPage.body, /<h1>TokenManager<\/h1>/);
    assert.match(unauthenticatedPage.body, /\/token-manager\/auth\/login/);

    const unauthenticatedIcon = await fetchText(`${bff.baseUrl}/token-manager/favicon.svg`);
    assert.equal(unauthenticatedIcon.response.status, 200);
    assert.match(unauthenticatedIcon.response.headers.get("content-type") || "", /image\/svg\+xml/);
    assert.match(unauthenticatedIcon.body, /<svg/);

    const login = await fetchJson(`${bff.baseUrl}/token-manager/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const app = await fetchText(`${bff.baseUrl}/token-manager/`, {
      headers: { Cookie: cookie },
    });
    assert.equal(app.response.status, 200);
    assert.doesNotMatch(app.response.headers.get("content-security-policy") || "", /unsafe-inline/);
    assert.match(app.response.headers.get("content-security-policy") || "", /script-src 'self'(?:;|$)/);
    assert.doesNotMatch(app.body, /style="/);
    assert.match(app.body, /id="save-sub2api-config"/);
    assert.match(app.body, /id="logout-button"/);
    assert.match(app.body, /href="\.\/styles\.css\?v=20260607-delete-accounts"/);
    assert.match(app.body, /src="\.\/app\.js\?v=20260607-delete-accounts"/);

    const appScript = await fetchText(`${bff.baseUrl}/token-manager/app.js`, {
      headers: { Cookie: cookie },
    });
    assert.equal(appScript.response.status, 200);
    assert.match(appScript.response.headers.get("content-type") || "", /text\/javascript/);
    assert.equal(appScript.response.headers.get("cache-control"), "no-store");
    assert.match(appScript.body, /\/token-manager\/auth\/config/);
    assert.match(appScript.body, /\/token-manager\/api/);

    const icon = await fetchText(`${bff.baseUrl}/token-manager/favicon.svg`, {
      headers: { Cookie: cookie },
    });
    assert.equal(icon.response.status, 200);
    assert.match(icon.response.headers.get("content-type") || "", /image\/svg\+xml/);

    const config = await fetchJson(`${bff.baseUrl}/token-manager/auth/config`, {
      headers: { Cookie: cookie },
    });
    assert.equal(config.response.status, 200);
    assert.equal(config.body.sub2api_proxy_enabled, true);

    const proxied = await fetchJson(`${bff.baseUrl}/token-manager/api/admin/accounts?page=1`, {
      headers: { Cookie: cookie },
    });
    assert.equal(proxied.response.status, 200);
    assert.equal(upstreamRequests.some((url) => url === "/api/v1/admin/accounts?page=1"), true);

    const schedulable = await fetchJson(`${bff.baseUrl}/token-manager/api/admin/accounts/7/schedulable`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ schedulable: true }),
    });
    assert.equal(schedulable.response.status, 200);
    assert.equal(upstreamRequests.some((url) => url === "/api/v1/admin/accounts/7/schedulable"), true);

    const deleted = await fetchJson(`${bff.baseUrl}/token-manager/api/admin/accounts/7`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(upstreamRequests.some((url) => url === "/api/v1/admin/accounts/7"), true);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("authenticated config exposes only non-secret browser defaults", async () => {
  const mock = await startMockSub2Api((_req, res) => res.writeHead(404).end());
  const bff = await startBff({
    authOnly: true,
    sub2apiAdminEmail: "",
    sub2apiAdminPassword: "",
    sub2apiBrowserDefaults: { origin: "https://api.example.com", adminBasePath: "/custom-api", apiBasePath: "/custom-api", importPath: "/custom-api/admin/accounts/data", defaultUrl: "https://api.example.com" },
  }, mock.baseUrl);

  try {
    const unauthenticated = await fetchJson(`${bff.baseUrl}/token-manager-auth/config`);
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(unauthenticated.body.error, "not_authenticated");

    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const config = await fetchJson(`${bff.baseUrl}/token-manager-auth/config`, {
      headers: { Cookie: cookie },
    });
    assert.equal(config.response.status, 200);
    assert.equal(config.body.sub2api_proxy_enabled, false);
    assert.equal(config.body.sub2api_default_origin, "https://api.example.com");
    assert.equal(config.body.sub2api_api_base_path, "/custom-api");
    assert.equal(config.body.sub2api_import_path, "/custom-api/admin/accounts/data");
    assert.equal(config.body.sub2api_admin_base_path, "/custom-api");
    assert.equal(config.body.sub2api_default_url, "https://api.example.com/custom-api");
    assert.equal(config.body.bearer_token, undefined);
    assert.equal(config.response.headers.get("cache-control"), "no-store");
  } finally {
    await bff.close();
    await mock.close();
  }
});


test("login sets an HttpOnly cookie without returning any bearer token", async () => {
  const mock = await startMockSub2Api((_req, res) => res.writeHead(404).end());
  const bff = await startBff({}, mock.baseUrl);

  try {
    const { response, body } = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const setCookie = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 200);
    assert.equal(body.authenticated, true);
    assert.equal(body.access_token, undefined);
    assert.equal(body.refresh_token, undefined);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);

    const cookie = setCookie.split(";")[0];
    const logout = await fetchJson(`${bff.baseUrl}/token-manager-auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(logout.response.status, 200);
    assert.equal(logout.body.authenticated, false);
    assert.match(logout.response.headers.get("set-cookie") || "", /Max-Age=0/);

    const afterLogout = await fetchJson(`${bff.baseUrl}/token-manager-auth/config`, {
      headers: { Cookie: cookie },
    });
    assert.equal(afterLogout.response.status, 401);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("authenticated user can update TokenManager login password without manual hash editing", async () => {
  const mock = await startMockSub2Api((_req, res) => res.writeHead(404).end());
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenmanager-password-"));
  const envFile = path.join(tempDir, ".env");
  fs.writeFileSync(envFile, "TOKENMANAGER_SESSION_SECRET=test-session-secret-that-is-long-enough-12345\nTOKENMANAGER_PASSWORD_HASH=old\n");
  const bff = await startBff({ authOnly: true, envFile, sub2apiAdminEmail: "", sub2apiAdminPassword: "" }, mock.baseUrl);

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const tooShort = await fetchJson(`${bff.baseUrl}/token-manager/auth/password`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: "short" }),
    });
    assert.equal(tooShort.response.status, 400);

    const changed = await fetchJson(`${bff.baseUrl}/token-manager/auth/password`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: "new-tokenmanager-password" }),
    });
    assert.equal(changed.response.status, 200);
    assert.equal(changed.body.ok, true);
    const envText = fs.readFileSync(envFile, "utf8");
    assert.match(envText, /^TOKENMANAGER_PASSWORD_HASH=scrypt:v1:/m);
    assert.doesNotMatch(envText, /new-tokenmanager-password/);

    const oldLogin = await fetchJson(`${bff.baseUrl}/token-manager/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    assert.equal(oldLogin.response.status, 401);

    const newLogin = await fetchJson(`${bff.baseUrl}/token-manager/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "new-tokenmanager-password" }),
    });
    assert.equal(newLogin.response.status, 200);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("config save persists server-side sub2api settings and proxy uses saved bearer", async () => {
  const upstreamRequests = [];
  const mock = await startMockSub2Api(async (req, res) => {
    upstreamRequests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: { items: [], total: 0 } }));
  });
  const runtimeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenmanager-config-"));
  const databaseFile = path.join(runtimeConfigDir, "tokenmanager.sqlite");
  const bff = await startBff({ databaseFile }, mock.baseUrl);
  const mockOrigin = new URL(mock.baseUrl).origin;
  const bareMockHost = new URL(mock.baseUrl).host;

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const saved = await fetchJson(`${bff.baseUrl}/token-manager-auth/config`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        sub2api_default_origin: bareMockHost,
        sub2api_import_path: "/api/v1/admin/accounts/data",
        sub2api_bearer_token: "runtime-bearer-token",
        group_ids: [1, "custom"],
        group_options: [{ id: 1, name: "Default Group" }],
        proxy_ids: [7, "pool-b"],
        proxy_options: [{ id: 7, name: "Default Proxy" }, { id: "pool-b", name: "Pool B" }],
        server_account_cache: [{
          id: 42,
          name: "Saved Account",
          credentials: {
            email: "saved@example.com",
            refresh_token: "must-not-be-persisted",
          },
          status: "active",
        }],
        server_account_total: 1,
        priority: 3,
        concurrency: 4,
        expires_at: 1780473960,
        rate_multiplier: 1.5,
        websocket_mode: "passthrough",
        auto_passthrough: true,
        set_privacy: true,
      }),
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.sub2api_default_origin, mockOrigin);
    assert.equal(saved.body.sub2api_has_bearer_token, true);
    assert.equal(saved.body.sub2api_bearer_token_preview, "runtim••••••••");
    assert.deepEqual(saved.body.group_ids, [1, "custom"]);
    assert.deepEqual(saved.body.group_options, [{ id: 1, name: "Default Group" }]);
    assert.deepEqual(saved.body.proxy_ids, [7, "pool-b"]);
    assert.equal(saved.body.proxy_id, 7);
    assert.deepEqual(saved.body.proxy_options, [{ id: 7, name: "Default Proxy" }, { id: "pool-b", name: "Pool B" }]);
    assert.deepEqual(saved.body.server_account_cache, [{
      id: "42",
      name: "Saved Account",
      email: "saved@example.com",
      platform: "",
      type: "",
      plan_type: "",
      status: "active",
      privacy_mode: "",
      groups: "",
      proxy: "",
      concurrency: "",
      priority: "",
      rate_multiplier: "",
      expires_at: "",
      created_at: "",
      updated_at: "",
      last_used_at: "",
    }]);
    assert.equal(saved.body.server_account_total, 1);
    assert.doesNotMatch(JSON.stringify(saved.body), /must-not-be-persisted/);
    assert.equal(saved.body.priority, 3);
    assert.equal(saved.body.concurrency, 4);
    assert.equal(saved.body.expires_at, 1780473960);
    assert.equal(saved.body.rate_multiplier, 1.5);
    assert.equal(saved.body.websocket_mode, "passthrough");
    assert.equal(saved.body.auto_passthrough, true);
    assert.equal(saved.body.set_privacy, true);
    assert.equal(saved.body.sub2api_bearer_token, undefined);
    assert.doesNotMatch(JSON.stringify(saved.body), /runtime-bearer-token/);

    const store = new RuntimeConfigStore({
      storageBackend: "sqlite",
      databaseFile,
      encryptionKey: "test-session-secret-that-is-long-enough-12345",
      pythonBin: "python3",
    });
    const persisted = store.read();
    assert.equal(persisted.sub2apiOrigin, mockOrigin);
    assert.equal(persisted.sub2apiBearerToken, "runtime-bearer-token");
    assert.deepEqual(persisted.groupOptions, [{ id: 1, name: "Default Group" }]);
    assert.deepEqual(persisted.proxyIds, [7, "pool-b"]);
    assert.equal(persisted.proxyId, 7);
    assert.deepEqual(persisted.proxyOptions, [{ id: 7, name: "Default Proxy" }, { id: "pool-b", name: "Pool B" }]);
    assert.deepEqual(persisted.serverAccountCache, [{
      id: "42",
      name: "Saved Account",
      email: "saved@example.com",
      platform: "",
      type: "",
      plan_type: "",
      status: "active",
      privacy_mode: "",
      groups: "",
      proxy: "",
      concurrency: "",
      priority: "",
      rate_multiplier: "",
      expires_at: "",
      created_at: "",
      updated_at: "",
      last_used_at: "",
    }]);
    assert.equal(persisted.serverAccountTotal, 1);
    assert.doesNotMatch(JSON.stringify(persisted), /must-not-be-persisted/);
    assert.equal(persisted.priority, 3);
    assert.equal(persisted.concurrency, 4);
    assert.equal(persisted.expiresAt, 1780473960);
    assert.equal(persisted.rateMultiplier, 1.5);
    assert.equal(persisted.websocketMode, "passthrough");
    assert.equal(persisted.autoPassthrough, true);
    assert.equal(persisted.setPrivacy, true);
    const rawDatabase = fs.readFileSync(databaseFile);
    assert.equal(rawDatabase.includes(Buffer.from("runtime-bearer-token")), false);

    const proxied = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts?page=1`, {
      headers: { Cookie: cookie },
    });
    assert.equal(proxied.response.status, 200);
    assert.equal(
      upstreamRequests.some((request) => request.url === "/api/v1/admin/accounts?page=1" && request.authorization === "Bearer runtime-bearer-token"),
      true,
    );
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("sqlite runtime config migrates legacy JSON and encrypts bearer token", () => {
  const runtimeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenmanager-migrate-"));
  const runtimeConfigFile = path.join(runtimeConfigDir, "runtime-config.json");
  const databaseFile = path.join(runtimeConfigDir, "tokenmanager.sqlite");
  fs.writeFileSync(runtimeConfigFile, JSON.stringify({
    sub2apiOrigin: "127.0.0.1:8080",
    sub2apiImportPath: "/api/v1/admin/accounts/data",
    sub2apiBearerToken: "legacy-secret-token",
    groupIds: [1, "custom"],
    proxyIds: [7, "pool-b"],
    priority: 3,
    concurrency: 4,
    expiresAt: 1780473960,
    rateMultiplier: 1.5,
    websocketMode: "ctx_pool",
    autoPassthrough: true,
    setPrivacy: true,
  }));

  const store = new RuntimeConfigStore({
    storageBackend: "sqlite",
    databaseFile,
    runtimeConfigFile,
    encryptionKey: "test-session-secret-that-is-long-enough-12345",
    pythonBin: "python3",
  });

  const migrated = store.read();
  assert.equal(migrated.sub2apiOrigin, "http://127.0.0.1:8080");
  assert.equal(migrated.sub2apiBearerToken, "legacy-secret-token");
  assert.deepEqual(migrated.groupIds, [1, "custom"]);
  assert.deepEqual(migrated.proxyIds, [7, "pool-b"]);
  assert.equal(migrated.proxyId, 7);
  assert.equal(migrated.priority, 3);
  assert.equal(migrated.concurrency, 4);
  assert.equal(migrated.expiresAt, 1780473960);
  assert.equal(migrated.rateMultiplier, 1.5);
  assert.equal(migrated.websocketMode, "ctx_pool");
  assert.equal(migrated.autoPassthrough, true);
  assert.equal(migrated.setPrivacy, true);
  assert.equal(fs.readFileSync(databaseFile).includes(Buffer.from("legacy-secret-token")), false);
});


test("config reports proxy mode when auth-only is disabled", async () => {
  const mock = await startMockSub2Api((_req, res) => res.writeHead(404).end());
  const bff = await startBff({}, mock.baseUrl);

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const config = await fetchJson(`${bff.baseUrl}/token-manager-auth/config`, {
      headers: { Cookie: cookie },
    });
    assert.equal(config.response.status, 200);
    assert.equal(config.body.sub2api_proxy_enabled, true);
  } finally {
    await bff.close();
    await mock.close();
  }
});


test("authenticated proxy injects sub2api bearer server-side only", async () => {
  const upstreamRequests = [];
  const mock = await startMockSub2Api(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    upstreamRequests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body });

    if (req.url === "/api/v1/auth/login") {
      assert.equal(req.method, "POST");
      assert.ok(body.includes("admin@example.com"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        code: 0,
        message: "success",
        data: {
          access_token: "admin-access-token",
          refresh_token: "admin-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
        },
      }));
      return;
    }

    if (req.url === "/api/v1/admin/accounts?page=1") {
      assert.equal(req.headers.authorization, "Bearer admin-access-token");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { items: [], total: 0 } }));
      return;
    }

    res.writeHead(404).end();
  });
  const bff = await startBff({}, mock.baseUrl);

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const proxied = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts?page=1`, {
      headers: { Cookie: cookie },
    });

    assert.equal(proxied.response.status, 200);
    assert.deepEqual(proxied.body.data, { items: [], total: 0 });
    assert.equal(proxied.body.access_token, undefined);
    assert.equal(upstreamRequests.some((item) => item.url === "/api/v1/auth/login"), true);
    assert.equal(
      upstreamRequests.some((item) => item.url === "/api/v1/admin/accounts?page=1" && item.authorization === "Bearer admin-access-token"),
      true,
    );
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("account list proxy strips credential secrets before returning data to browser", async () => {
  const mock = await startMockSub2Api(async (req, res) => {
    if (req.url === "/api/v1/admin/accounts?page=1") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        data: {
          items: [{
            id: 1,
            name: "Account",
            credentials: {
              email: "safe@example.com",
              plan_type: "plus",
              access_token: "must-not-reach-browser",
              refreshToken: "must-not-reach-browser",
              id_token: "must-not-reach-browser",
              apiKey: "must-not-reach-browser",
            },
            tokens: {
              sessionToken: "must-not-reach-browser",
              account_id: "acct-safe",
            },
            credentials_status: {
              has_access_token: true,
              has_refresh_token: true,
              has_api_key: true,
            },
            extra: {
              openai_apikey_responses_websockets_v2_enabled: true,
            },
          }],
        },
      }));
      return;
    }
    res.writeHead(404).end();
  });
  const bff = await startBff({ sub2apiAdminBearerToken: "static-admin-token", sub2apiAdminPassword: "" }, mock.baseUrl);

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    const proxied = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts?page=1`, {
      headers: { Cookie: cookie },
    });
    const account = proxied.body.data.items[0];
    const text = JSON.stringify(proxied.body);

    assert.equal(proxied.response.status, 200);
    assert.equal(account.credentials.email, "safe@example.com");
    assert.equal(account.credentials.plan_type, "plus");
    assert.equal(account.tokens.account_id, "acct-safe");
    assert.equal(account.credentials_status.has_access_token, true);
    assert.equal(account.credentials_status.has_api_key, true);
    assert.equal(account.extra.openai_apikey_responses_websockets_v2_enabled, true);
    assert.doesNotMatch(text, /must-not-reach-browser/);
    assert.equal(account.credentials.access_token, undefined);
    assert.equal(account.credentials.refreshToken, undefined);
    assert.equal(account.credentials.id_token, undefined);
    assert.equal(account.credentials.apiKey, undefined);
    assert.equal(account.tokens.sessionToken, undefined);
  } finally {
    await bff.close();
    await mock.close();
  }
});




test("authenticated proxy forwards batch account creation fields", async () => {
  const upstreamRequests = [];
  const mock = await startMockSub2Api(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    upstreamRequests.push({
      url: req.url,
      method: req.method,
      authorization: req.headers.authorization,
      body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null,
    });
    if (req.url === "/api/v1/admin/accounts/batch" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { success: 1, failed: 0 } }));
      return;
    }
    res.writeHead(404).end();
  });
  const bff = await startBff({ sub2apiAdminBearerToken: "static-admin-token", sub2apiAdminPassword: "" }, mock.baseUrl);

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const proxied = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts/batch`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: [{
          name: "tokenmanager-test",
          platform: "openai",
          type: "oauth",
          group_ids: [11, 13],
          proxy_id: 6,
          concurrency: 4,
          expires_at: 1780473960,
          credentials: { access_token: "redacted" },
        }],
      }),
    });

    assert.equal(proxied.response.status, 200);
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].authorization, "Bearer static-admin-token");
    assert.deepEqual(upstreamRequests[0].body.accounts[0].group_ids, [11, 13]);
    assert.equal(upstreamRequests[0].body.accounts[0].proxy_id, 6);
    assert.equal(upstreamRequests[0].body.accounts[0].concurrency, 4);
    assert.equal(upstreamRequests[0].body.accounts[0].expires_at, 1780473960);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("authenticated proxy forwards account update and privacy endpoints", async () => {
  const upstreamRequests = [];
  const mock = await startMockSub2Api(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    upstreamRequests.push({
      url: req.url,
      method: req.method,
      authorization: req.headers.authorization,
      body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null,
    });
    if (
      (req.url === "/api/v1/admin/accounts/42/apply-oauth-credentials" && req.method === "POST")
      || (req.url === "/api/v1/admin/accounts/42" && req.method === "PUT")
      || (req.url === "/api/v1/admin/accounts/42" && req.method === "DELETE")
      || (req.url === "/api/v1/admin/accounts/42/set-privacy" && req.method === "POST")
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { id: 42 } }));
      return;
    }
    res.writeHead(404).end();
  });
  const bff = await startBff({ sub2apiAdminBearerToken: "static-admin-token", sub2apiAdminPassword: "" }, mock.baseUrl);

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(cookie);

    const apply = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts/42/apply-oauth-credentials`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "oauth",
        credentials: { access_token: "redacted" },
        extra: { email: "mark@example.com" },
      }),
    });
    const update = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts/42`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        group_ids: [11, 13],
        proxy_id: 6,
        concurrency: 4,
        confirm_mixed_channel_risk: true,
      }),
    });
    const privacy = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts/42/set-privacy`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const deleted = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/accounts/42`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });

    assert.equal(apply.response.status, 200);
    assert.equal(update.response.status, 200);
    assert.equal(privacy.response.status, 200);
    assert.equal(deleted.response.status, 200);
    assert.deepEqual(
      upstreamRequests.map((request) => [request.method, request.url, request.authorization]),
      [
        ["POST", "/api/v1/admin/accounts/42/apply-oauth-credentials", "Bearer static-admin-token"],
        ["PUT", "/api/v1/admin/accounts/42", "Bearer static-admin-token"],
        ["POST", "/api/v1/admin/accounts/42/set-privacy", "Bearer static-admin-token"],
        ["DELETE", "/api/v1/admin/accounts/42", "Bearer static-admin-token"],
      ],
    );
    assert.equal(upstreamRequests[0].body.credentials.access_token, "redacted");
    assert.deepEqual(upstreamRequests[1].body.group_ids, [11, 13]);
    assert.equal(upstreamRequests[1].body.confirm_mixed_channel_risk, true);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("admin api key mode injects x-api-key instead of bearer", async () => {
  const upstreamRequests = [];
  const mock = await startMockSub2Api(async (req, res) => {
    upstreamRequests.push({ url: req.url, authorization: req.headers.authorization, apiKey: req.headers["x-api-key"] });
    if (req.url === "/api/v1/admin/proxies/all") {
      assert.equal(req.headers["x-api-key"], "admin-test-key");
      assert.equal(req.headers.authorization, undefined);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
      return;
    }
    res.writeHead(404).end();
  });
  const bff = await startBff({
    sub2apiAdminApiKey: "admin-test-key",
    sub2apiAdminEmail: "",
    sub2apiAdminPassword: "",
  }, mock.baseUrl);

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    const proxied = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/proxies/all`, {
      headers: { Cookie: cookie },
    });

    assert.equal(proxied.response.status, 200);
    assert.equal(upstreamRequests.some((item) => item.url === "/api/v1/auth/login"), false);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("jwt-secret mode mints sub2api admin bearer without browser exposure", async () => {
  const upstreamRequests = [];
  const mock = await startMockSub2Api(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    upstreamRequests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });

    if (req.url === "/api/v1/admin/groups/all") {
      assert.match(req.headers.authorization || "", /^Bearer /);
      const token = req.headers.authorization.slice("Bearer ".length);
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      assert.equal(payload.user_id, 42);
      assert.equal(payload.email, "admin@example.com");
      assert.equal(payload.role, "admin");
      assert.equal(payload.token_version, 7);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
      return;
    }

    res.writeHead(404).end();
  });
  const bff = await startBff({
    sub2apiAdminPassword: "",
    sub2apiJwtSecret: "sub2api-jwt-secret",
    sub2apiAdminUserId: "42",
    sub2apiAdminTokenVersion: "7",
    sub2apiSignedTokenTtlSeconds: 600,
  }, mock.baseUrl);

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    const proxied = await fetchJson(`${bff.baseUrl}/token-manager-api/admin/groups/all`, {
      headers: { Cookie: cookie },
    });

    assert.equal(proxied.response.status, 200);
    assert.equal(upstreamRequests.some((item) => item.url === "/api/v1/auth/login"), false);
  } finally {
    await bff.close();
    await mock.close();
  }
});

test("proxy whitelist blocks unrelated sub2api paths", async () => {
  const mock = await startMockSub2Api((_req, res) => {
    res.writeHead(200).end("should not be reached");
  });
  const bff = await startBff({}, mock.baseUrl);

  try {
    const login = await fetchJson(`${bff.baseUrl}/token-manager-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "tokenmanager-password" }),
    });
    const cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
    const blocked = await fetchJson(`${bff.baseUrl}/token-manager-api/auth/login`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(blocked.response.status, 403);
    assert.equal(blocked.body.error, "proxy_route_not_allowed");
  } finally {
    await bff.close();
    await mock.close();
  }
});
