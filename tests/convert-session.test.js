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
    title: options.title || "",
    type: options.type || "",
    value: options.value || "",
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
  const htmlIdAttributes = new Map(
    Array.from(html.matchAll(/<[^>]+\bid=(['"])(.*?)\1[^>]*>/g), (match) => {
      const [, , id] = match;
      const tag = match[0];
      const type = tag.match(/\btype=(['"])(.*?)\1/);
      const value = tag.match(/\bvalue=(['"])(.*?)\1/);
      const title = tag.match(/\btitle=(['"])(.*?)\1/);
      return [id, {
        type: type?.[2] || "",
        value: value?.[2] || "",
        title: title?.[2] || "",
      }];
    })
  );
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
        const id = selector.startsWith("#") ? selector.slice(1) : "";
        elements.set(selector, createFakeElement(selector, htmlIdAttributes.get(id) || {}));
      }
      return elements.get(selector);
    },
    querySelectorAll(selector) {
      return selector === "[data-format]" ? formatButtons : [];
    },
  };

  const TestURL = URL;
  TestURL.createObjectURL = () => "blob:test";
  TestURL.revokeObjectURL = () => {};

  const context = {
    TextDecoder,
    TextEncoder,
    URL: TestURL,
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
    fetch: async () => {
      throw new Error("fetch is not mocked")
    },
    localStorage: {
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
  element.listeners[type]({ target: element });
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


function testSub2apiTokenVisibilityToggle() {
  const { elements } = loadPageScript();
  const tokenInput = elements.get("#sub2api-token");
  const toggleButton = elements.get("#toggle-sub2api-token");

  assert.equal(tokenInput.type, "password");
  assert.equal(toggleButton.title, "显示 Bearer Token");

  dispatch(toggleButton, "click");
  assert.equal(tokenInput.type, "text");
  assert.equal(toggleButton.attributes["aria-label"], "隐藏 Bearer Token");
  assert.equal(toggleButton.attributes["aria-pressed"], "true");
  assert.equal(toggleButton.title, "隐藏 Bearer Token");

  dispatch(toggleButton, "click");
  assert.equal(tokenInput.type, "password");
  assert.equal(toggleButton.attributes["aria-label"], "显示 Bearer Token");
  assert.equal(toggleButton.attributes["aria-pressed"], "false");
  assert.equal(toggleButton.title, "显示 Bearer Token");
}

function testSub2apiImportToolsOnlyVisibleForSub2apiFormat() {
  const { elements, formatButtons } = loadPageScript();
  const cpaButton = formatButtons.find((button) => button.dataset.format === "cpa");
  const sub2apiButton = formatButtons.find((button) => button.dataset.format === "sub2api");

  assert.equal(elements.get("#sub2api-tools").hidden, false);
  assert.equal(elements.get("#import-sub2api").hidden, false);

  dispatch(cpaButton, "click");
  assert.equal(elements.get("#sub2api-tools").hidden, true);
  assert.equal(elements.get("#import-sub2api").hidden, true);
  assert.equal(elements.get("#import-sub2api").disabled, true);

  dispatch(sub2apiButton, "click");
  assert.equal(elements.get("#sub2api-tools").hidden, false);
  assert.equal(elements.get("#import-sub2api").hidden, false);
}

async function testServerDefaultSub2apiUrlHydratesInput() {
  const { elements } = loadPageScript({
    window: {
      location: {
        origin: "https://api.wenlab.link",
        protocol: "https:",
        search: "",
      },
    },
    fetch: async (url) => {
      assert.equal(url, "/token-manager-auth/config");
      return {
        ok: true,
        status: 200,
        json: async () => ({ sub2api_default_origin: "https://api.example.com", sub2api_api_base_path: "/custom-api" }),
      };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(elements.get("#sub2api-url").value, "https://api.example.com");
}

async function testSub2apiUrlShorthandNormalizesToApiEndpoints() {
  const capturedRequests = [];
  const { elements } = loadPageScript({
    window: {
      location: {
        origin: "https://tokenmanager.example.com",
        protocol: "https:",
        search: "",
      },
    },
    fetch: async (url, options = {}) => {
      if (url === "/token-manager-auth/config") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sub2api_api_base_path: "/api/v1" }),
        };
      }

      capturedRequests.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(String(url).includes("/admin/accounts?")
          ? { data: { items: [], total: 0 } }
          : { data: { account_created: 1, account_failed: 0, proxy_created: 0, proxy_reused: 0 } }),
      };
    },
  });

  const input = elements.get("#session-input");
  const importButton = elements.get("#import-sub2api");
  const accessToken = jwtWithPayload({
    exp: 1780473960,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "chatgpt-account-1",
    },
  });

  elements.get("#sub2api-url").value = "sub2api.example.com:9443";
  elements.get("#sub2api-token").value = "test-token";
  input.value = JSON.stringify({ user: { email: "mark@example.com" }, accessToken });
  dispatch(input, "input");
  dispatch(importButton, "click");

  await new Promise((resolve) => setImmediate(resolve));

  const post = capturedRequests.find((request) => request.options?.method === "POST");
  assert.equal(post.url, "https://sub2api.example.com:9443/api/v1/admin/accounts/data");
  assert.ok(
    capturedRequests.some((request) => request.url.startsWith("https://sub2api.example.com:9443/api/v1/admin/accounts?")),
    "shorthand host should also normalize server account refresh URL",
  );
}

async function testServerProxyModeImportsWithoutBrowserBearer() {
  const capturedRequests = [];
  const { elements } = loadPageScript({
    window: {
      location: {
        origin: "https://api.wenlab.link",
        protocol: "https:",
        search: "",
      },
    },
    fetch: async (url, options = {}) => {
      if (url === "/token-manager-auth/config") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub2api_proxy_enabled: true,
            sub2api_default_origin: "https://api.wenlab.link",
            sub2api_import_path: "/api/v1/admin/accounts/data",
          }),
        };
      }

      capturedRequests.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(String(url).includes("/admin/accounts?")
          ? { data: { items: [], total: 0 } }
          : { data: { account_created: 1, account_failed: 0, proxy_created: 0, proxy_reused: 0 } }),
      };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(elements.get("#sub2api-browser-config").hidden, false);
  assert.match(elements.get("#sub2api-config-hint").textContent, /服务器代理模式已启用/);

  const input = elements.get("#session-input");
  const importButton = elements.get("#import-sub2api");
  input.value = JSON.stringify({
    user: { email: "mark@example.com" },
    accessToken: jwtWithPayload({
      exp: 1780473960,
      "https://api.openai.com/auth": { chatgpt_account_id: "chatgpt-account-1" },
    }),
  });
  dispatch(input, "input");
  dispatch(importButton, "click");

  await new Promise((resolve) => setImmediate(resolve));

  const post = capturedRequests.find((request) => request.options?.method === "POST");
  assert.equal(post.url, "/token-manager-api/admin/accounts/data");
  assert.equal(post.options.headers.Authorization, undefined);
  assert.ok(
    capturedRequests.some((request) => request.url.startsWith("/token-manager-api/admin/accounts?")),
    "server proxy mode should refresh server accounts through BFF",
  );
}

async function testSaveSub2apiConfigPostsServerSettings() {
  const capturedPosts = [];
  const { elements } = loadPageScript({
    window: {
      location: {
        origin: "https://api.wenlab.link",
        protocol: "https:",
        search: "",
      },
    },
    fetch: async (url, options = {}) => {
      if (url === "/token-manager-auth/config" && options.method === "POST") {
        capturedPosts.push(JSON.parse(options.body));
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            sub2api_proxy_enabled: true,
            sub2api_default_origin: "https://remote.example.com",
            sub2api_import_path: "/api/v1/admin/accounts/data",
            sub2api_has_bearer_token: true,
            group_ids: [1, "custom"],
            proxy_id: 7,
            priority: 3,
            rate_multiplier: 1.5,
          }),
        };
      }
      if (url === "/token-manager-auth/config") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sub2api_proxy_enabled: true,
            sub2api_default_origin: "https://api.wenlab.link",
            sub2api_import_path: "/api/v1/admin/accounts/data",
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  elements.get("#sub2api-url").value = "https://remote.example.com";
  elements.get("#sub2api-token").value = "Bearer runtime-token";
  elements.get("#sub2api-groups").selectedOptions = [{ value: "1" }, { value: "custom" }];
  dispatch(elements.get("#sub2api-groups"), "change");
  elements.get("#sub2api-proxy").value = "7";
  dispatch(elements.get("#sub2api-proxy"), "change");
  elements.get("#sub2api-priority").value = "3";
  dispatch(elements.get("#sub2api-priority"), "input");
  elements.get("#sub2api-rate-multiplier").value = "1.5";
  dispatch(elements.get("#sub2api-rate-multiplier"), "input");
  dispatch(elements.get("#save-sub2api-config"), "click");

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(capturedPosts.length, 1);
  assert.equal(capturedPosts[0].sub2api_default_origin, "https://remote.example.com");
  assert.equal(capturedPosts[0].sub2api_bearer_token, "Bearer runtime-token");
  assert.deepEqual(capturedPosts[0].group_ids, [1, "custom"]);
  assert.equal(capturedPosts[0].proxy_id, 7);
  assert.equal(capturedPosts[0].priority, 3);
  assert.equal(capturedPosts[0].rate_multiplier, 1.5);
  assert.equal(elements.get("#sub2api-token").value, "");
  assert.match(elements.get("#output-status").textContent, /配置已保存到服务器/);
}

async function testImportToSub2ApiPostsCurrentSub2apiPayload() {
  const capturedRequests = [];
  const { elements } = loadPageScript({
    fetch: async (url, options) => {
      capturedRequests.push({ url, options });
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

  const input = elements.get("#session-input");
  const output = elements.get("#output");
  const outputStatus = elements.get("#output-status");
  const importButton = elements.get("#import-sub2api");
  const sub2apiUrl = elements.get("#sub2api-url");
  const sub2apiToken = elements.get("#sub2api-token");
  const accessToken = jwtWithPayload({
    exp: 1780473960,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "chatgpt-account-1",
    },
  });

  sub2apiUrl.value = "https://sub2api.example.com/api/v1/admin/accounts/data";
  sub2apiToken.value = "test-token";

  input.value = JSON.stringify({
    user: {
      email: "mark@example.com",
    },
    accessToken,
  });
  dispatch(input, "input");
  dispatch(importButton, "click");

  await new Promise((resolve) => setImmediate(resolve));

  const capturedRequest = capturedRequests.find((request) => request.options?.method === "POST");
  assert.ok(capturedRequest, "expected import fetch to be called");
  assert.equal(capturedRequest.url, "https://sub2api.example.com/api/v1/admin/accounts/data");
  assert.equal(capturedRequest.options.method, "POST");
  assert.equal(capturedRequest.options.headers.Authorization, "Bearer test-token");

  const body = JSON.parse(capturedRequest.options.body);
  assert.equal(body.skip_default_group_bind, true);
  assert.equal(body.data.proxies.length, 0);
  assert.equal(body.data.accounts.length, 1);
  assert.equal(body.data.accounts[0].platform, "openai");
  assert.equal(body.data.accounts[0].type, "oauth");
  assert.equal(body.data.accounts[0].credentials.access_token, accessToken);
  assert.match(outputStatus.textContent, /已导入 sub2api/);
  assert.ok(
    capturedRequests.some((request) => String(request.url).startsWith("https://sub2api.example.com/api/v1/admin/accounts?")),
    "successful import should refresh persisted server accounts"
  );
}

async function testRefreshServerAccountsFetchesPersistedAccounts() {
  const capturedRequests = [];
  const { elements } = loadPageScript({
    fetch: async (url, options) => {
      capturedRequests.push({ url, options });
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

  elements.get("#sub2api-url").value = "https://sub2api.example.com/api/v1/admin/accounts/data";
  elements.get("#sub2api-token").value = "test-token";

  dispatch(elements.get("#refresh-server-accounts"), "click");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    capturedRequests[0].url,
    "https://sub2api.example.com/api/v1/admin/accounts?page=1&page_size=50&sort_by=created_at&sort_order=desc"
  );
  assert.equal(capturedRequests[0].options.headers.Authorization, "Bearer test-token");
  assert.match(elements.get("#server-account-body").innerHTML, /saved@example\.com/);
  assert.match(elements.get("#server-account-status").textContent, /服务器已保存 1 个账号/);
}

async function testUrlTokenDoesNotHydrateBearerOrFetchAccounts() {
  const capturedRequests = [];
  const { elements } = loadPageScript({
    window: {
      location: {
        search: "?token=url-token",
      },
    },
    fetch: async (url, options) => {
      capturedRequests.push({ url, options });
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
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(elements.get("#sub2api-token").value, "");
  assert.equal(capturedRequests.length, 0);
}

async function testFetchSub2ApiMetaUsesSub2apiAllEndpoints() {
  const capturedUrls = [];
  const { elements } = loadPageScript({
    fetch: async (url) => {
      capturedUrls.push(String(url));
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

  elements.get("#sub2api-url").value = "https://sub2api.example.com/api/v1/admin/accounts/data";
  elements.get("#sub2api-token").value = "test-token";

  dispatch(elements.get("#fetch-sub2api-meta"), "click");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(capturedUrls.sort(), [
    "https://sub2api.example.com/api/v1/admin/groups/all",
    "https://sub2api.example.com/api/v1/admin/proxies/all",
  ]);
  assert.match(elements.get("#sub2api-groups").innerHTML, /Default Group/);
  assert.match(elements.get("#sub2api-proxy").innerHTML, /Default Proxy/);
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
  testSub2apiTokenVisibilityToggle();
  testSub2apiImportToolsOnlyVisibleForSub2apiFormat();
  await testServerDefaultSub2apiUrlHydratesInput();
  await testSub2apiUrlShorthandNormalizesToApiEndpoints();
  await testServerProxyModeImportsWithoutBrowserBearer();
  await testSaveSub2apiConfigPostsServerSettings();
  await testImportToSub2ApiPostsCurrentSub2apiPayload();
  await testRefreshServerAccountsFetchesPersistedAccounts();
  await testUrlTokenDoesNotHydrateBearerOrFetchAccounts();
  await testFetchSub2ApiMetaUsesSub2apiAllEndpoints();
  console.log("convert-session tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
