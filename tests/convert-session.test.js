#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createFakeElement(selector, options = {}) {
  const classes = new Set();

  return {
    selector,
    attributes: {},
    dataset: options.dataset || {},
    disabled: false,
    files: [],
    innerHTML: "",
    listeners: {},
    selectedOptions: [],
    style: {},
    textContent: "",
    value: "",
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      toggle(name, force) {
        if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    append() {},
    click() {
      this.listeners.click?.({ target: this });
    },
    dispatchEvent(event) {
      this.listeners[event.type]?.({ target: this });
      return true;
    },
    remove() {},
    select() {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function loadPageScript(overrides = {}) {
  const htmlPath = path.join(__dirname, "..", "docs", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);

  assert.ok(match, "expected docs/index.html to contain one inline script");

  const elements = new Map();
  const formatButtons = ["sub2api", "cpa", "cockpit", "9router", "codex", "axonhub", "codexmanager"].map((format) =>
    createFakeElement(`[data-format="${format}"]`, { dataset: { format } })
  );

  const document = {
    body: createFakeElement("body"),
    createElement(selector) {
      return createFakeElement(selector);
    },
    execCommand() {
      return true;
    },
    querySelector(selector) {
      if (!elements.has(selector)) {
        elements.set(selector, createFakeElement(selector));
      }
      return elements.get(selector);
    },
    querySelectorAll(selector) {
      return selector === "[data-format]" ? formatButtons : [];
    },
  };

  const context = {
    TextDecoder,
    TextEncoder,
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {},
    },
    atob,
    btoa,
    clearTimeout,
    console,
    document,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    fetch: async (url) => {
      if (String(url) === "/token-manager-auth/me") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ authenticated: false }),
        };
      }
      throw new Error(`fetch is not mocked: ${url}`);
    },
    localStorage: {
      getItem() {
        return null;
      },
      removeItem() {},
      setItem() {},
    },
    sessionStorage: {
      getItem() {
        return null;
      },
      removeItem() {},
      setItem() {},
    },
    navigator: {
      clipboard: {
        async writeText() {},
      },
    },
    setTimeout,
    URLSearchParams,
    window: {
      location: {
        search: "",
      },
    },
    ...overrides,
  };

  vm.runInNewContext(match[1], context, { filename: "docs/index.html" });

  return { elements, formatButtons };
}

function dispatch(element, type) {
  assert.equal(typeof element.listeners[type], "function", `missing ${type} listener on ${element.selector}`);
  element.listeners[type]({ target: element, preventDefault() {} });
}

function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

function jwtWithPayload(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "sig",
  ].join(".");
}

function testReferencedDomIdsExist() {
  const htmlPath = path.join(__dirname, "..", "docs", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const ids = new Set(Array.from(html.matchAll(/\bid=(["'])(.*?)\1/g), (match) => match[2]));
  const referencedIds = new Set(
    Array.from(html.matchAll(/document\.querySelector\(\s*(["'])#([^"']+)\1\s*\)/g), (match) => match[2])
  );
  const missing = Array.from(referencedIds)
    .filter((id) => !ids.has(id))
    .sort();

  assert.deepEqual(missing, [], "script must not reference missing DOM ids");
}

function testSub2apiAccountUsesAccessTokenExpiry() {
  const { elements } = loadPageScript();
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    accessToken: jwtWithPayload({
      exp: 1780473960,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "chatgpt-account-1",
      },
    }),
  });
  dispatch(input, "input");

  const document = JSON.parse(output.value);
  const account = document.accounts[0];

  assert.equal(document.expires_at, undefined);
  assert.equal(document.auto_pause_on_expired, undefined);
  assert.equal(document.accounts.length, 1);
  assert.equal(account.expires_at, 1780473960);
  assert.equal(account.auto_pause_on_expired, true);
}

function testSub2apiAccountsUseTheirOwnAccessTokenExpiry() {
  const { elements } = loadPageScript();
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  input.value = JSON.stringify([
    {
      email: "late@example.com",
      accessToken: jwtWithPayload({
        exp: 1780473960,
        "https://api.openai.com/auth": {
          chatgpt_account_id: "chatgpt-account-late",
        },
      }),
    },
    {
      email: "early@example.com",
      accessToken: jwtWithPayload({
        exp: 1780000000,
        "https://api.openai.com/auth": {
          chatgpt_account_id: "chatgpt-account-early",
        },
      }),
    },
  ]);
  dispatch(input, "input");

  const document = JSON.parse(output.value);

  assert.equal(document.expires_at, undefined);
  assert.equal(document.auto_pause_on_expired, undefined);
  assert.equal(document.accounts.length, 2);
  assert.equal(document.accounts[0].expires_at, 1780473960);
  assert.equal(document.accounts[0].auto_pause_on_expired, true);
  assert.equal(document.accounts[1].expires_at, 1780000000);
  assert.equal(document.accounts[1].auto_pause_on_expired, true);
}

function testSyntheticIdTokenHasCodexParseableJwtFormat() {
  const { elements, formatButtons } = loadPageScript();
  const cpaButton = formatButtons.find((button) => button.dataset.format === "cpa");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(cpaButton, "click");
  input.value = JSON.stringify({
    user: {
      id: "user-test",
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    sessionToken: "session-token",
  });
  dispatch(input, "input");

  const cpa = JSON.parse(output.value);
  const parts = cpa.id_token.split(".");

  assert.equal(cpa.id_token_synthetic, true);
  assert.equal(parts.length, 3);
  assert.ok(
    parts.every((part) => part.length > 0),
    "synthetic id_token must use non-empty header, payload, and signature segments"
  );

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.equal(payload.email, "mark@example.com");
  assert.equal(payload["https://api.openai.com/auth"].chatgpt_account_id, "00000000-0000-4000-9000-000000000000");
}

function testAxonHubAuthJsonUsesPlaceholderRefreshTokenWhenMissing() {
  const { elements, formatButtons } = loadPageScript();
  const axonHubButton = formatButtons.find((button) => button.dataset.format === "axonhub");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(axonHubButton, "click");
  input.value = JSON.stringify({
    user: {
      id: "user-test",
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    sessionToken: "session-token",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.auth_mode, "chatgpt");
  assert.equal(authJson.tokens.access_token, "access-token");
  assert.equal(authJson.tokens.refresh_token, "__missing_refresh_token__");
  assert.equal(authJson.tokens.id_token.split(".").length, 3);
  assert.equal(authJson.last_refresh, "2026-08-06T13:29:36.155Z");
  assert.equal(authJson.axonhub_refresh_token_placeholder, true);
  assert.equal(authJson.axonhub_note, "refresh_token is a placeholder; access_token works only until it expires.");
}

function testAxonHubAuthJsonPreservesRealRefreshToken() {
  const { elements, formatButtons } = loadPageScript();
  const axonHubButton = formatButtons.find((button) => button.dataset.format === "axonhub");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(axonHubButton, "click");
  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    refreshToken: "real-refresh-token",
    idToken: "real.header.signature",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.tokens.refresh_token, "real-refresh-token");
  assert.equal(authJson.tokens.id_token, "real.header.signature");
  assert.equal(authJson.axonhub_refresh_token_placeholder, undefined);
  assert.equal(authJson.axonhub_note, undefined);
}

function testCodexAuthJsonMatchesNativeShapeWhenMissingRefreshToken() {
  const { elements, formatButtons } = loadPageScript();
  const codexButton = formatButtons.find((button) => button.dataset.format === "codex");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(codexButton, "click");
  input.value = JSON.stringify({
    user: {
      id: "user-test",
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    sessionToken: "session-token",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.auth_mode, "chatgpt");
  assert.equal(authJson.OPENAI_API_KEY, null);
  assert.equal(authJson.tokens.access_token, "access-token");
  assert.equal(authJson.tokens.refresh_token, "");
  assert.equal(authJson.tokens.id_token.split(".").length, 3);
  assert.equal(authJson.tokens.account_id, "00000000-0000-4000-9000-000000000000");
  assert.match(authJson.last_refresh, /^\d{4}-\d{2}-\d{2}T/);
}

function testCodexAuthJsonPreservesRealRefreshTokenAndIdToken() {
  const { elements, formatButtons } = loadPageScript();
  const codexButton = formatButtons.find((button) => button.dataset.format === "codex");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(codexButton, "click");
  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    accessToken: "access-token",
    refreshToken: "real-refresh-token",
    idToken: "real.header.signature",
    tokens: {
      account_id: "chatgpt-account-1",
    },
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.auth_mode, "chatgpt");
  assert.equal(authJson.OPENAI_API_KEY, null);
  assert.equal(authJson.tokens.access_token, "access-token");
  assert.equal(authJson.tokens.refresh_token, "real-refresh-token");
  assert.equal(authJson.tokens.id_token, "real.header.signature");
  assert.equal(authJson.tokens.account_id, "chatgpt-account-1");
}

function testCodexManagerAuthJsonUsesEmptyRefreshTokenWhenMissing() {
  const { elements, formatButtons } = loadPageScript();
  const codexManagerButton = formatButtons.find((button) => button.dataset.format === "codexmanager");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(codexManagerButton, "click");
  input.value = JSON.stringify({
    user: {
      id: "user-test",
      email: "mark@example.com",
    },
    expires: "2026-08-06T14:29:36.155Z",
    account: {
      id: "00000000-0000-4000-9000-000000000000",
      planType: "plus",
    },
    accessToken: "access-token",
    sessionToken: "session-token",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.tokens.access_token, "access-token");
  assert.equal(authJson.tokens.refresh_token, "");
  assert.equal(authJson.tokens.id_token, "");
  assert.equal(authJson.tokens.account_id, "00000000-0000-4000-9000-000000000000");
  assert.equal(authJson.meta.label, "mark@example.com");
  assert.equal(authJson.meta.note, "Imported from ChatGPT session");
}

function testCodexManagerAuthJsonPreservesRealRefreshAndMetadata() {
  const { elements, formatButtons } = loadPageScript();
  const codexManagerButton = formatButtons.find((button) => button.dataset.format === "codexmanager");
  const input = elements.get("#session-input");
  const output = elements.get("#output");

  dispatch(codexManagerButton, "click");
  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    accessToken: "access-token",
    refreshToken: "real-refresh-token",
    idToken: "real.header.signature",
    workspaceId: "workspace-1",
    chatgptAccountId: "chatgpt-account-1",
  });
  dispatch(input, "input");

  const authJson = JSON.parse(output.value);

  assert.equal(authJson.tokens.refresh_token, "real-refresh-token");
  assert.equal(authJson.tokens.id_token, "real.header.signature");
  assert.equal(authJson.tokens.chatgpt_account_id, "chatgpt-account-1");
  assert.equal(authJson.meta.workspace_id, "workspace-1");
  assert.equal(authJson.meta.chatgpt_account_id, "chatgpt-account-1");
}

async function testImportToSub2ApiPostsCurrentSub2apiPayload() {
  const capturedRequests = [];
  const { elements } = loadPageScript({
    fetch: async (url, options = {}) => {
      capturedRequests.push({ url, options });
      if (String(url) === "/token-manager-auth/me") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ authenticated: true, expires_at: "2026-08-06T14:29:36.155Z" }),
        };
      }
      if (String(url).includes("/admin/accounts?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            data: {
              items: [],
              total: 0,
            },
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: {
            account_created: 1,
            account_failed: 0,
            proxy_created: 0,
            proxy_reused: 0,
          },
        }),
      };
    },
  });

  await flushAsync();

  const input = elements.get("#session-input");
  const outputStatus = elements.get("#output-status");
  const importButton = elements.get("#import-sub2api");
  const sub2apiUrl = elements.get("#sub2api-url");
  const accessToken = jwtWithPayload({
    exp: 1780473960,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "chatgpt-account-1",
    },
  });

  assert.equal(sub2apiUrl.value, "/token-manager-api/admin/accounts/data");

  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    accessToken,
  });
  dispatch(input, "input");
  dispatch(importButton, "click");

  await flushAsync();

  const capturedRequest = capturedRequests.find((request) => request.options?.method === "POST" && request.url === "/token-manager-api/admin/accounts/data");
  assert.ok(capturedRequest, "expected import fetch to be called");
  assert.equal(capturedRequest.url, "/token-manager-api/admin/accounts/data");
  assert.equal(capturedRequest.options.method, "POST");
  assert.equal(capturedRequest.options.credentials, "same-origin");
  assert.equal(capturedRequest.options.headers.Authorization, undefined);
  assert.equal(capturedRequest.options.headers.authorization, undefined);

  const body = JSON.parse(capturedRequest.options.body);
  assert.equal(body.skip_default_group_bind, true);
  assert.equal(body.data.proxies.length, 0);
  assert.equal(body.data.accounts.length, 1);
  assert.equal(body.data.accounts[0].platform, "openai");
  assert.equal(body.data.accounts[0].type, "oauth");
  assert.equal(body.data.accounts[0].credentials.access_token, accessToken);
  assert.match(outputStatus.textContent, /已导入 sub2api/);
  assert.ok(
    capturedRequests.some((request) => String(request.url).startsWith("/token-manager-api/admin/accounts?")),
    "successful import should refresh persisted server accounts"
  );
}

async function testRefreshServerAccountsFetchesPersistedAccounts() {
  const capturedRequests = [];
  const { elements } = loadPageScript({
    fetch: async (url, options = {}) => {
      capturedRequests.push({ url, options });
      if (String(url) === "/token-manager-auth/me") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ authenticated: true }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: {
            items: [{
              id: 7,
              name: "Saved Account",
              credentials: {
                email: "saved@example.com",
                expires_at: "2026-08-06T14:29:36.155Z",
              },
              status: "active",
            }],
            total: 1,
          },
        }),
      };
    },
  });

  await flushAsync();
  dispatch(elements.get("#refresh-server-accounts"), "click");
  await flushAsync();

  const accountRequest = capturedRequests.find((request) => String(request.url).startsWith("/token-manager-api/admin/accounts?"));
  assert.ok(accountRequest, "expected account refresh fetch");
  assert.equal(
    accountRequest.url,
    "/token-manager-api/admin/accounts?page=1&page_size=50&sort_by=created_at&sort_order=desc"
  );
  assert.equal(accountRequest.options.credentials, "same-origin");
  assert.equal(accountRequest.options.headers.Authorization, undefined);
  assert.match(elements.get("#server-account-body").innerHTML, /saved@example\.com/);
  assert.match(elements.get("#server-account-status").textContent, /服务器已保存 1 个账号/);
}

function testBrowserDoesNotExposeSub2apiBearerControls() {
  const htmlPath = path.join(__dirname, "..", "docs", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.equal(html.includes("sub2api-token"), false);
  assert.equal(/Authorization\s*:\s*`?Bearer/.test(html), false);
  assert.equal(/localStorage\.(setItem|getItem)\(["']auth_/.test(html), false);
  assert.equal(/sessionStorage\.(setItem|getItem)/.test(html), false);
}

async function testUrlTokenDoesNotHydrateBrowserBearerOrRefreshAccounts() {
  const capturedRequests = [];
  loadPageScript({
    window: {
      location: {
        search: "?token=url-token",
      },
    },
    fetch: async (url, options = {}) => {
      capturedRequests.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ authenticated: false }),
      };
    },
  });

  await flushAsync();

  assert.deepEqual(capturedRequests.map((request) => request.url), ["/token-manager-auth/me"]);
}

async function testFetchSub2ApiMetaUsesSub2apiAllEndpoints() {
  const capturedUrls = [];
  const { elements } = loadPageScript({
    fetch: async (url) => {
      capturedUrls.push(String(url));
      if (String(url) === "/token-manager-auth/me") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ authenticated: true }),
        };
      }
      if (String(url).includes("/admin/accounts?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: { items: [], total: 0 } }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: String(url).includes("/admin/groups/all")
            ? [{ id: 1, name: "Default Group" }]
            : [{ id: 2, name: "Default Proxy" }],
        }),
      };
    },
  });

  await flushAsync();
  dispatch(elements.get("#fetch-sub2api-meta"), "click");
  await flushAsync();

  assert.deepEqual(capturedUrls.filter((url) => url.includes("/admin/groups") || url.includes("/admin/proxies")).sort(), [
    "/token-manager-api/admin/groups/all",
    "/token-manager-api/admin/proxies/all",
  ]);
  assert.match(elements.get("#sub2api-groups").innerHTML, /Default Group/);
  assert.match(elements.get("#sub2api-proxy").innerHTML, /Default Proxy/);
}

async function testTokenManagerLoginUsesHttpOnlySessionFlowWithoutStorage() {
  const calls = [];
  const throwingStorage = {
    getItem() { throw new Error("storage must not be read"); },
    removeItem() { throw new Error("storage must not be written"); },
    setItem() { throw new Error("storage must not be written"); },
  };
  const { elements } = loadPageScript({
    localStorage: throwingStorage,
    sessionStorage: throwingStorage,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (String(url) === "/token-manager-auth/me") {
        return { ok: true, status: 200, text: async () => JSON.stringify({ authenticated: false }) };
      }
      if (String(url) === "/token-manager-auth/login") {
        return { ok: true, status: 200, text: async () => JSON.stringify({ authenticated: true, expires_at: "2026-08-06T14:29:36.155Z" }) };
      }
      if (String(url).includes("/admin/accounts?")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ data: { items: [], total: 0 } }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
  });

  await flushAsync();
  elements.get("#tokenmanager-password").value = "login-password";
  dispatch(elements.get("#tokenmanager-login-form"), "submit");
  await flushAsync();

  const loginCall = calls.find((call) => call.url === "/token-manager-auth/login");
  assert.ok(loginCall, "expected login fetch");
  assert.equal(loginCall.options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(loginCall.options.body), { password: "login-password" });
  assert.match(elements.get("#tokenmanager-auth-status").textContent, /已登录服务器/);
}

async function main() {
  testReferencedDomIdsExist();
  testSub2apiAccountUsesAccessTokenExpiry();
  testSub2apiAccountsUseTheirOwnAccessTokenExpiry();
  testSyntheticIdTokenHasCodexParseableJwtFormat();
  testAxonHubAuthJsonUsesPlaceholderRefreshTokenWhenMissing();
  testAxonHubAuthJsonPreservesRealRefreshToken();
  testCodexAuthJsonMatchesNativeShapeWhenMissingRefreshToken();
  testCodexAuthJsonPreservesRealRefreshTokenAndIdToken();
  testCodexManagerAuthJsonUsesEmptyRefreshTokenWhenMissing();
  testCodexManagerAuthJsonPreservesRealRefreshAndMetadata();
  testBrowserDoesNotExposeSub2apiBearerControls();
  await testImportToSub2ApiPostsCurrentSub2apiPayload();
  await testRefreshServerAccountsFetchesPersistedAccounts();
  await testUrlTokenDoesNotHydrateBrowserBearerOrRefreshAccounts();
  await testFetchSub2ApiMetaUsesSub2apiAllEndpoints();
  await testTokenManagerLoginUsesHttpOnlySessionFlowWithoutStorage();
  console.log("convert-session tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
