(() => {
        const OUTPUT_LABELS = {
          sub2api: "sub2api",
          cpa: "CPA",
          cockpit: "Cockpit",
          "9router": "9router",
          codex: "Codex",
          axonhub: "AxonHub",
          codexmanager: "Codex-Manager",
        };

        const state = {
          format: "sub2api",
          sessions: [],
          converted: [],
          skipped: [],
          outputText: "",
          priority: 1,
          rateMultiplier: 1.0,
          serverAccounts: [],
          serverAccountTotal: 0,
          availableGroups: [],
          availableProxies: [],
          groupSearch: "",
          proxySearch: "",
          selectedGroups: [],
          selectedProxies: [],
          sub2apiProxyEnabled: false,
          websocketMode: "off",
          autoPassthrough: false
        };

        const elements = {
          accountBody: document.querySelector("#account-body"),
          clearInput: document.querySelector("#clear-input"),
          copyOutput: document.querySelector("#copy-output"),
          cpaNotice: document.querySelector("#cpa-notice"),
          downloadOutput: document.querySelector("#download-output"),
          importSub2api: document.querySelector("#import-sub2api"),
          fileInput: document.querySelector("#file-input"),
          formatButtons: Array.from(document.querySelectorAll("[data-format]")),
          input: document.querySelector("#session-input"),
          inputStatus: document.querySelector("#input-status"),
          issues: document.querySelector("#issues"),
          loadExample: document.querySelector("#load-example"),
          output: document.querySelector("#output"),
          outputStatus: document.querySelector("#output-status"),
          outputSubtitle: document.querySelector("#output-subtitle"),
          pickFiles: document.querySelector("#pick-files"),
          refreshServerAccounts: document.querySelector("#refresh-server-accounts"),
          serverAccountBody: document.querySelector("#server-account-body"),
          saveSub2apiConfig: document.querySelector("#save-sub2api-config"),
          saveTokenmanagerPassword: document.querySelector("#save-tokenmanager-password"),
          serverAccountStatus: document.querySelector("#server-account-status"),
          sub2apiBrowserConfig: document.querySelector("#sub2api-browser-config"),
          sub2apiConfigHint: document.querySelector("#sub2api-config-hint"),
          sub2apiConfigStatus: document.querySelector("#sub2api-config-status"),
          sub2apiToken: document.querySelector("#sub2api-token"),
          sub2apiTokenToggle: document.querySelector("#toggle-sub2api-token"),
          sub2apiTools: document.querySelector("#sub2api-tools"),
          sub2apiUrl: document.querySelector("#sub2api-url"),
          statCount: document.querySelector("#stat-count"),
          statErrors: document.querySelector("#stat-errors"),
          statFormat: document.querySelector("#stat-format"),
          // 新增绑定节点
          fetchSub2apiMeta: document.querySelector("#fetch-sub2api-meta"),
          groups: document.querySelector("#sub2api-groups"),
          groupSearch: document.querySelector("#sub2api-group-search"),
          groupSummary: document.querySelector("#sub2api-group-summary"),
          groupList: document.querySelector("#sub2api-group-list"),
          selectAllGroups: document.querySelector("#select-all-sub2api-groups"),
          clearGroups: document.querySelector("#clear-sub2api-groups"),
          proxy: document.querySelector("#sub2api-proxy"),
          proxySearch: document.querySelector("#sub2api-proxy-search"),
          proxySummary: document.querySelector("#sub2api-proxy-summary"),
          proxyList: document.querySelector("#sub2api-proxy-list"),
          selectAllProxies: document.querySelector("#select-all-sub2api-proxies"),
          clearProxies: document.querySelector("#clear-sub2api-proxies"),
          priority: document.querySelector("#sub2api-priority"),
          rateMultiplier: document.querySelector("#sub2api-rate-multiplier"),
          websocketMode: document.querySelector("#sub2api-websocket-mode"),
          autoPassthrough: document.querySelector("#sub2api-auto-passthrough"),
          tokenmanagerPassword: document.querySelector("#tokenmanager-new-password"),
          tokenmanagerPasswordConfirm: document.querySelector("#tokenmanager-confirm-password"),
          tokenmanagerPasswordStatus: document.querySelector("#tokenmanager-password-status"),
        };

        const exampleSession = {
          user: {
            id: "user-example",
            email: "mark@example.com",
          },
          expires: "2026-08-06T14:29:36.155Z",
          account: {
            id: "00000000-0000-4000-9000-000000000000",
            planType: "plus",
          },
          accessToken: "paste-real-access-token-here",
          sessionToken: "paste-real-session-token-here",
          authProvider: "openai",
        };

        const AXONHUB_PLACEHOLDER_REFRESH_TOKEN = "__missing_refresh_token__";

        function isPlainObject(value) {
          return Boolean(value) && typeof value === "object" && !Array.isArray(value);
        }

        function firstNonEmpty(...values) {
          for (const value of values) {
            if (typeof value === "string" && value.trim() !== "") {
              return value.trim();
            }
          }
          return undefined;
        }

        function escapeHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }

        function decodeBase64Url(value) {
          const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
          const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
          const binary = atob(padded);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          return new TextDecoder().decode(bytes);
        }

        function bytesToBase64Url(bytes) {
          let binary = "";
          for (let index = 0; index < bytes.length; index += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
          }
          return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
        }

        function encodeBase64UrlJson(value) {
          return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
        }

        function parseJwtPayload(token) {
          if (typeof token !== "string" || token.trim() === "") {
            return undefined;
          }

          const segments = token.split(".");
          if (segments.length < 2) {
            return undefined;
          }

          try {
            return JSON.parse(decodeBase64Url(segments[1]));
          } catch {
            return undefined;
          }
        }

        function getOpenAIAuthSection(payload) {
          if (!isPlainObject(payload)) {
            return {};
          }

          const auth = payload["https://api.openai.com/auth"];
          return isPlainObject(auth) ? auth : {};
        }

        function getOpenAIProfileSection(payload) {
          if (!isPlainObject(payload)) {
            return {};
          }

          const profile = payload["https://api.openai.com/profile"];
          return isPlainObject(profile) ? profile : {};
        }

        function normalizeTimestamp(value) {
          if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.toISOString();
          }

          if (typeof value === "number" && Number.isFinite(value)) {
            const milliseconds = value > 1e11 ? value : value * 1000;
            const date = new Date(milliseconds);
            return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
          }

          if (typeof value !== "string" || value.trim() === "") {
            return undefined;
          }

          const date = new Date(value);
          return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
        }

        function timestampFromUnixSeconds(value) {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) {
            return undefined;
          }

          const date = new Date(numeric * 1000);
          return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
        }

        function unixSecondsFromJwtExp(value) {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || numeric <= 0) {
            return undefined;
          }

          return Math.trunc(numeric);
        }

        function epochSecondsFromValue(value) {
          if (value === undefined || value === null || value === "") {
            return 0;
          }

          const numeric = Number(value);
          if (Number.isFinite(numeric)) {
            return Math.trunc(numeric > 1e11 ? numeric / 1000 : numeric);
          }

          const parsed = Date.parse(String(value));
          return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : 0;
        }

        function buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt) {
          if (!accountId) {
            return undefined;
          }

          const now = Math.trunc(Date.now() / 1000);
          const authInfo = { chatgpt_account_id: accountId };
          const expires = epochSecondsFromValue(expiresAt) || now + 90 * 24 * 60 * 60;

          if (planType) {
            authInfo.chatgpt_plan_type = planType;
          }

          if (userId) {
            authInfo.chatgpt_user_id = userId;
            authInfo.user_id = userId;
          }

          const payload = {
            iat: now,
            exp: expires,
            "https://api.openai.com/auth": authInfo,
          };

          if (email) {
            payload.email = email;
          }

          return `${encodeBase64UrlJson({ alg: "none", typ: "JWT", cpa_synthetic: true })}.${encodeBase64UrlJson(payload)}.synthetic`;
        }

        function getExpiresIn(expiresAt, now = new Date()) {
          if (!expiresAt) {
            return undefined;
          }

          const expiresMs = new Date(expiresAt).getTime();
          if (Number.isNaN(expiresMs)) {
            return undefined;
          }

          return Math.max(0, Math.floor((expiresMs - now.getTime()) / 1000));
        }

        function getAxonHubLastRefresh(expiresAt, now = new Date()) {
          const expiresMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
          if (Number.isNaN(expiresMs)) {
            return normalizeTimestamp(now);
          }

          return new Date(expiresMs - 60 * 60 * 1000).toISOString();
        }

        function stripUnavailable(value) {
          if (Array.isArray(value)) {
            return value.map(stripUnavailable).filter((item) => item !== undefined);
          }

          if (isPlainObject(value)) {
            const entries = Object.entries(value)
              .map(([key, item]) => [key, stripUnavailable(item)])
              .filter(([, item]) => item !== undefined);
            return entries.length ? Object.fromEntries(entries) : undefined;
          }

          if (value === undefined || value === null || value === "") {
            return undefined;
          }

          return value;
        }

        function toEmailKey(email) {
          if (typeof email !== "string") {
            return undefined;
          }

          return email
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
        }

        function sanitizeFileToken(value, fallback = "chatgpt-session") {
          const base = firstNonEmpty(value, fallback) || fallback;
          return base
            .replace(/\.[^.]+$/u, "")
            .replace(/[\\/:*?"<>|]+/g, "-")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase()
            .slice(0, 80) || fallback;
        }

        function getTimestampToken(date = new Date()) {
          const pad = (value) => String(value).padStart(2, "0");
          return [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate()),
          ].join("-") + "_" + [
            pad(date.getHours()),
            pad(date.getMinutes()),
            pad(date.getSeconds()),
          ].join("-");
        }

        function formatDisplayDate(value) {
          if (!value) {
            return "";
          }

          const date = new Date(value);
          if (Number.isNaN(date.getTime())) {
            return value;
          }

          const pad = (item) => String(item).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        function collectSessionLikeObjects(value, sourceName = "pasted-json") {
          const found = [];
          const visited = new WeakSet();

          function visit(item, path) {
            if (!isPlainObject(item) && !Array.isArray(item)) {
              return;
            }

            if (isPlainObject(item)) {
              if (visited.has(item)) {
                return;
              }
              visited.add(item);

              const token = firstNonEmpty(
                item.accessToken,
                item.access_token,
                item.tokens?.accessToken,
                item.tokens?.access_token,
                item.token?.accessToken,
                item.token?.access_token,
                item.credentials?.accessToken,
                item.credentials?.access_token,
              );
              const hasIdentity = isPlainObject(item.user) || firstNonEmpty(
                item.email,
                item.name,
                item.label,
                item.meta?.label,
                item.tokens?.accountId,
                item.tokens?.account_id,
                item.tokens?.chatgptAccountId,
                item.tokens?.chatgpt_account_id,
                item.providerSpecificData?.chatgptAccountId,
                item.providerSpecificData?.chatgpt_account_id,
                item.id,
              );
              if (token && hasIdentity) {
                found.push({ value: item, sourceName, path });
                return;
              }

              for (const [key, child] of Object.entries(item)) {
                if (key === "accessToken" || key === "access_token" || key === "sessionToken") {
                  continue;
                }
                visit(child, `${path}.${key}`);
              }
              return;
            }

            item.forEach((child, index) => visit(child, `${path}[${index}]`));
          }

          visit(value, "$");
          return found;
        }

        function parseInputDocuments(text) {
          if (typeof text !== "string" || text.trim() === "") {
            return [];
          }

          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch (error) {
            throw new Error(`JSON 解析失败：${error.message}`);
          }

          return collectSessionLikeObjects(parsed);
        }

        function convertSession(record, options = {}) {
          if (!isPlainObject(record)) {
            throw new Error("session 不是 JSON 对象");
          }

          const accessToken = firstNonEmpty(
            record.accessToken,
            record.access_token,
            record.tokens?.accessToken,
            record.tokens?.access_token,
            record.token?.accessToken,
            record.token?.access_token,
            record.credentials?.accessToken,
            record.credentials?.access_token,
          );
          if (!accessToken) {
            throw new Error("缺少 accessToken");
          }
          const sessionToken = firstNonEmpty(
            record.sessionToken,
            record.session_token,
            record.tokens?.sessionToken,
            record.tokens?.session_token,
            record.token?.sessionToken,
            record.token?.session_token,
            record.credentials?.session_token,
          );
          const refreshToken = firstNonEmpty(
            record.refreshToken,
            record.refresh_token,
            record.tokens?.refreshToken,
            record.tokens?.refresh_token,
            record.token?.refreshToken,
            record.token?.refresh_token,
            record.credentials?.refresh_token,
          );
          const inputIdToken = firstNonEmpty(
            record.idToken,
            record.id_token,
            record.tokens?.idToken,
            record.tokens?.id_token,
            record.token?.idToken,
            record.token?.id_token,
            record.credentials?.id_token,
          );

          const payload = parseJwtPayload(accessToken);
          const idPayload = parseJwtPayload(inputIdToken);
          const auth = getOpenAIAuthSection(payload);
          const idAuth = getOpenAIAuthSection(idPayload);
          const profile = getOpenAIProfileSection(payload);
          const accessTokenExpiresAt = unixSecondsFromJwtExp(payload?.exp);
          const expiresAt = firstNonEmpty(
            payload ? timestampFromUnixSeconds(payload.exp) : undefined,
            normalizeTimestamp(record.expires),
            normalizeTimestamp(record.expiresAt),
            normalizeTimestamp(record.expired),
            normalizeTimestamp(record.expires_at),
          );
          const email = firstNonEmpty(
            record.user?.email,
            record.email,
            record.meta?.label,
            record.label,
            record.credentials?.email,
            record.providerSpecificData?.email,
            profile.email,
            idPayload?.email,
            payload?.email,
          );
          const accountId = firstNonEmpty(
            record.account?.id,
            record.account_id,
            record.tokens?.accountId,
            record.tokens?.account_id,
            record.chatgptAccountId,
            record.chatgpt_account_id,
            record.meta?.chatgptAccountId,
            record.meta?.chatgpt_account_id,
            record.tokens?.chatgptAccountId,
            record.tokens?.chatgpt_account_id,
            record.providerSpecificData?.chatgptAccountId,
            record.providerSpecificData?.chatgpt_account_id,
            record.credentials?.chatgpt_account_id,
            auth.chatgpt_account_id,
            idAuth.chatgpt_account_id,
            record.provider === "codex" ? record.id : undefined,
          );
          const chatgptAccountId = firstNonEmpty(
            record.chatgptAccountId,
            record.chatgpt_account_id,
            record.meta?.chatgptAccountId,
            record.meta?.chatgpt_account_id,
            record.tokens?.chatgptAccountId,
            record.tokens?.chatgpt_account_id,
            record.providerSpecificData?.chatgptAccountId,
            record.providerSpecificData?.chatgpt_account_id,
            record.credentials?.chatgpt_account_id,
            auth.chatgpt_account_id,
            idAuth.chatgpt_account_id,
          );
          const workspaceId = firstNonEmpty(
            record.account?.workspaceId,
            record.account?.workspace_id,
            record.workspaceId,
            record.workspace_id,
            record.meta?.workspaceId,
            record.meta?.workspace_id,
            record.providerSpecificData?.workspaceId,
            record.providerSpecificData?.workspace_id,
            record.credentials?.workspace_id,
            payload?.workspace_id,
            idPayload?.workspace_id,
          );
          const userId = firstNonEmpty(
            record.user?.id,
            record.user_id,
            record.chatgptUserId,
            record.providerSpecificData?.chatgptUserId,
            record.providerSpecificData?.chatgpt_user_id,
            auth.chatgpt_user_id,
            auth.user_id,
            idAuth.chatgpt_user_id,
            idAuth.user_id,
          );
          const planType = firstNonEmpty(
            record.account?.planType,
            record.account?.plan_type,
            record.planType,
            record.plan_type,
            record.providerSpecificData?.chatgptPlanType,
            record.providerSpecificData?.chatgpt_plan_type,
            record.credentials?.plan_type,
            auth.chatgpt_plan_type,
            idAuth.chatgpt_plan_type,
          );
          const exportedAt = normalizeTimestamp(options.now || new Date());
          const expiresIn = getExpiresIn(expiresAt, options.now || new Date());
          const sourceName = firstNonEmpty(options.sourceName, "pasted-json");
          const sourceType = record.provider === "codex" && record.authType === "oauth" ? "9router" : "chatgpt_web_session";
          const name = firstNonEmpty(email, sourceName, "ChatGPT Account");
          const syntheticIdToken = !inputIdToken
            ? buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt)
            : undefined;
          const idToken = firstNonEmpty(inputIdToken, syntheticIdToken);

          const cpa = Object.fromEntries(Object.entries({
            type: "codex",
            account_id: accountId,
            chatgpt_account_id: accountId,
            email,
            name,
            plan_type: planType,
            chatgpt_plan_type: planType,
            id_token: idToken,
            id_token_synthetic: Boolean(syntheticIdToken) || undefined,
            access_token: accessToken,
            refresh_token: refreshToken || "",
            session_token: sessionToken,
            last_refresh: exportedAt,
            expired: expiresAt,
            disabled: Boolean(record.disabled) || undefined,
          }).filter(([, value]) => value !== undefined && value !== null));

          const cockpit = {
            type: "codex",
            id_token: idToken,
            access_token: accessToken,
            refresh_token: refreshToken || "",
            account_id: accountId,
            last_refresh: exportedAt,
            email,
            expired: expiresAt,
            account_note: firstNonEmpty(record.account_note, record.accountInfo, record.account_info, record.note, record.notes, record.remark),
          };

          // 将页面侧配置写入 sub2api 导入结构中。
          const sub2apiAccount = stripUnavailable({
            name: firstNonEmpty(name, email, sourceName, "ChatGPT Account"),
            platform: "openai",
            type: "oauth",
            expires_at: accessTokenExpiresAt,
            auto_pause_on_expired: true,
            concurrency: 10,
            priority: state.priority,
            rate_multiplier: state.rateMultiplier,
            group_ids: state.selectedGroups.length ? state.selectedGroups : undefined,
            credentials: {
              access_token: accessToken,
              chatgpt_account_id: accountId,
              chatgpt_user_id: userId,
              email,
              expires_at: expiresAt,
              expires_in: expiresIn,
              plan_type: planType,
            },
            extra: {
              email,
              email_key: toEmailKey(email),
              name,
              auth_provider: firstNonEmpty(record.authProvider, record.auth_provider),
              source: sourceType,
              last_refresh: exportedAt,
              openai_oauth_responses_websockets_v2_enabled: state.websocketMode !== "off",
              openai_oauth_responses_websockets_v2_mode: state.websocketMode,
              openai_passthrough: state.autoPassthrough,
            },
          });
          const priority = Number.isFinite(Number(record.priority)) ? Number(record.priority) : 9;
          const isActive = typeof record.isActive === "boolean" ? record.isActive : !Boolean(record.disabled);
          const createdAt = normalizeTimestamp(record.createdAt) || exportedAt;
          const updatedAt = normalizeTimestamp(record.updatedAt) || exportedAt;
          const nineRouter = stripUnavailable({
            accessToken,
            refreshToken,
            expiresAt,
            testStatus: firstNonEmpty(record.testStatus, record.test_status, "active"),
            expiresIn,
            providerSpecificData: {
              chatgptAccountId: accountId,
              chatgptPlanType: planType,
            },
            id: accountId,
            provider: "codex",
            authType: "oauth",
            name,
            email,
            priority,
            isActive,
            createdAt,
            updatedAt,
          });
          const axonHubRefreshToken = refreshToken || AXONHUB_PLACEHOLDER_REFRESH_TOKEN;
          const codexAuthJson = {
            auth_mode: "chatgpt",
            OPENAI_API_KEY: null,
            tokens: {
              id_token: idToken,
              access_token: accessToken,
              refresh_token: refreshToken || "",
              account_id: accountId,
            },
            last_refresh: exportedAt,
          };
          const axonHub = stripUnavailable({
            auth_mode: "chatgpt",
            last_refresh: getAxonHubLastRefresh(expiresAt, options.now || new Date()),
            tokens: {
              access_token: accessToken,
              refresh_token: axonHubRefreshToken,
              id_token: idToken,
            },
            axonhub_refresh_token_placeholder: refreshToken ? undefined : true,
            axonhub_note: refreshToken ? undefined : "refresh_token is a placeholder; access_token works only until it expires.",
          });
          const codexManagerTokenHints = Object.fromEntries(Object.entries({
            account_id: accountId,
            chatgpt_account_id: chatgptAccountId,
          }).filter(([, value]) => value !== undefined && value !== null && value !== ""));
          const codexManagerMeta = Object.fromEntries(Object.entries({
            label: firstNonEmpty(name, email, sourceName, "ChatGPT Account"),
            workspace_id: workspaceId,
            chatgpt_account_id: chatgptAccountId,
            note: "Imported from ChatGPT session",
          }).filter(([, value]) => value !== undefined && value !== null && value !== ""));
          const codexManager = {
            tokens: {
              access_token: accessToken,
              refresh_token: refreshToken || "",
              id_token: inputIdToken || "",
              ...codexManagerTokenHints,
            },
            meta: codexManagerMeta,
          };

          return {
            sourceName,
            sourcePath: options.sourcePath,
            email,
            name,
            expiresAt,
            accessTokenExpiresAt,
            cpa,
            cockpit,
            nineRouter,
            codexAuthJson,
            axonHub,
            codexManager,
            sub2apiAccount,
          };
        }

        function getRandomSelectedProxyId() {
          if (!state.selectedProxies.length) {
            return undefined;
          }
          const index = Math.floor(Math.random() * state.selectedProxies.length);
          return state.selectedProxies[Math.min(index, state.selectedProxies.length - 1)];
        }

        function assignRandomProxy(account) {
          const proxyId = getRandomSelectedProxyId();
          if (proxyId === undefined || proxyId === null || proxyId === "") {
            const { proxy_id: _proxyId, ...withoutProxy } = account;
            return withoutProxy;
          }
          return {
            ...account,
            proxy_id: proxyId,
          };
        }

        function buildSub2apiDocument(converted, now = new Date()) {
          return {
            exported_at: normalizeTimestamp(now),
            proxies: [],
            accounts: converted.map((item) => assignRandomProxy(item.sub2apiAccount)),
          };
        }

        function buildSub2apiImportPayload() {
          return {
            data: buildSub2apiDocument(state.converted, new Date()),
            skip_default_group_bind: true,
          };
        }

        function buildOutputDocument() {
          const now = new Date();
          if (state.format === "sub2api") {
            return buildSub2apiDocument(state.converted, now);
          }

          if (state.format === "cpa") {
            return state.converted.length === 1
              ? state.converted[0].cpa
              : state.converted.map((item) => item.cpa);
          }

          if (state.format === "cockpit") {
            return state.converted.length === 1
              ? state.converted[0].cockpit
              : state.converted.map((item) => item.cockpit);
          }

          if (state.format === "9router") {
            return state.converted.length === 1
              ? state.converted[0].nineRouter
              : state.converted.map((item) => item.nineRouter);
          }

          if (state.format === "codex") {
            return state.converted.length === 1
              ? state.converted[0].codexAuthJson
              : state.converted.map((item) => item.codexAuthJson);
          }

          if (state.format === "axonhub") {
            return state.converted.length === 1
              ? state.converted[0].axonHub
              : state.converted.map((item) => item.axonHub);
          }

          if (state.format === "codexmanager") {
            return state.converted.length === 1
              ? state.converted[0].codexManager
              : state.converted.map((item) => item.codexManager);
          }

          return buildSub2apiDocument(state.converted, now);
        }

        function convertFromText(text) {
          const sources = parseInputDocuments(text);
          const converted = [];
          const skipped = [];
          const now = new Date();

          sources.forEach((item, index) => {
            try {
              converted.push(convertSession(item.value, {
                now,
                sourceName: item.sourceName,
                sourcePath: item.path || `$[${index}]`,
              }));
            } catch (error) {
              skipped.push({
                sourceName: item.sourceName,
                path: item.path,
                reason: error instanceof Error ? error.message : "无法转换",
              });
            }
          });

          if (!sources.length) {
            skipped.push({
              sourceName: "pasted-json",
              path: "$",
              reason: "未找到包含 accessToken 和 user/email 的 session 对象",
            });
          }

          state.converted = converted;
          state.skipped = skipped;
          state.sessions = sources;
          updateOutput();
        }

        function setStatus(element, text, tone = "") {
          element.textContent = text;
          element.classList.toggle("is-ok", tone === "ok");
          element.classList.toggle("is-error", tone === "error");
        }

        function isSub2ApiFormat() {
          return state.format === "sub2api";
        }

        function updateSub2ApiToolsVisibility() {
          const isVisible = isSub2ApiFormat();
          elements.sub2apiTools.hidden = !isVisible;
          elements.importSub2api.hidden = !isVisible;
        }

        function updateImportButtonState() {
          updateSub2ApiToolsVisibility();
          elements.importSub2api.disabled = !state.converted.length || !isSub2ApiFormat();
        }

        function updateOutput() {
          const hasConverted = state.converted.length > 0;
          let outputText = "";

          if (hasConverted) {
            outputText = JSON.stringify(buildOutputDocument(), null, 2);
          }

          state.outputText = outputText;
          elements.output.value = outputText;
          elements.copyOutput.disabled = !outputText;
          elements.downloadOutput.disabled = !outputText;
          elements.statCount.textContent = String(state.converted.length);
          elements.statErrors.textContent = String(state.skipped.length);
          elements.statFormat.textContent = OUTPUT_LABELS[state.format];
          elements.outputSubtitle.textContent = `当前输出为 ${OUTPUT_LABELS[state.format]} 导入 JSON。`;
          elements.cpaNotice.style.display = ["cpa", "cockpit", "codex", "axonhub", "codexmanager"].includes(state.format) ? "block" : "none";
          updateImportButtonState();

          renderAccounts();
          renderIssues();

          if (outputText) {
            setStatus(elements.outputStatus, `已生成 ${state.converted.length} 个账号。`, "ok");
          } else {
            setStatus(elements.outputStatus, "暂无输出。", state.skipped.length ? "error" : "");
          }
        }

        function renderAccounts() {
          if (!state.converted.length) {
            elements.accountBody.innerHTML = '<tr><td colspan="4" class="empty">暂无可转换账号。</td></tr>';
            return;
          }

          elements.accountBody.innerHTML = state.converted.map((item) => `
            <tr>
              <td><div class="cell-clip" title="${escapeHtml(item.name)}">${escapeHtml(item.name || "-")}</div></td>
              <td><div class="cell-clip" title="${escapeHtml(item.email)}">${escapeHtml(item.email || "-")}</div></td>
              <td><div class="cell-clip" title="${escapeHtml(item.expiresAt)}">${escapeHtml(formatDisplayDate(item.expiresAt) || "-")}</div></td>
              <td><div class="cell-clip" title="${escapeHtml(item.sourceName)}">${escapeHtml(item.sourceName || "pasted-json")}</div></td>
            </tr>
          `).join("");
        }

        function renderIssues() {
          if (!state.skipped.length) {
            elements.issues.classList.remove("is-visible");
            elements.issues.textContent = "";
            return;
          }

          elements.issues.classList.add("is-visible");
          elements.issues.innerHTML = state.skipped
            .map((item) => `<div>${escapeHtml(item.sourceName || "input")} ${escapeHtml(item.path || "")}: ${escapeHtml(item.reason)}</div>`)
            .join("");
        }

        function scheduleConvert() {
          const text = elements.input.value;
          if (!text.trim()) {
            state.converted = [];
            state.skipped = [];
            state.sessions = [];
            updateOutput();
            setStatus(elements.inputStatus, "等待输入。");
            return;
          }

          try {
            convertFromText(text);
            if (state.converted.length) {
              setStatus(elements.inputStatus, `解析完成：${state.converted.length} 个账号，跳过 ${state.skipped.length} 项。`, "ok");
            } else {
              setStatus(elements.inputStatus, "没有可转换账号。", "error");
            }
          } catch (error) {
            state.converted = [];
            state.skipped = [{
              sourceName: "pasted-json",
              path: "$",
              reason: error instanceof Error ? error.message : "JSON 解析失败",
            }];
            state.outputText = "";
            updateOutput();
            setStatus(elements.inputStatus, error instanceof Error ? error.message : "JSON 解析失败", "error");
          }
        }

        function downloadOutput() {
          if (!state.outputText) {
            return;
          }

          const first = state.converted[0];
          const base = sanitizeFileToken(first?.email || first?.name || state.format);
          const fileName = `${base}.${state.format}.${getTimestampToken()}.json`;
          const blob = new Blob([state.outputText], { type: "application/json;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = fileName;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        async function copyOutput() {
          if (!state.outputText) {
            return;
          }

          try {
            await navigator.clipboard.writeText(state.outputText);
            setStatus(elements.outputStatus, "已复制到剪贴板。", "ok");
          } catch {
            elements.output.select();
            document.execCommand("copy");
            setStatus(elements.outputStatus, "已复制到剪贴板。", "ok");
          }
        }

        const DEFAULT_SUB2API_ADMIN_BASE = "/api/v1";
        const DEFAULT_SUB2API_IMPORT_PATH = "/api/v1/admin/accounts/data";
        const sub2apiBrowserConfig = {
          adminBasePath: DEFAULT_SUB2API_ADMIN_BASE,
          importPath: DEFAULT_SUB2API_IMPORT_PATH,
        };

        function getDefaultUrlProtocol() {
          return window.location?.protocol === "http:" ? "http" : "https";
        }

        function getCurrentBrowserOrigin() {
          const origin = window.location?.origin;
          return origin && origin !== "null" ? origin : "";
        }

        function looksLikeUrlHost(value) {
          const head = String(value || "").split(/[/?#]/)[0];
          return head === "localhost"
            || head.includes(".")
            || head.includes(":")
            || /^\[[^\]]+\](?::\d+)?$/.test(head);
        }

        function normalizePublicPath(value, fallback) {
          const raw = String(value || fallback || "").trim();
          if (!raw) {
            return fallback || "";
          }
          return raw.startsWith("/") ? raw : `/${raw}`;
        }

        function getAdminBasePathFromImportPath(value) {
          const normalized = normalizePublicPath(value, DEFAULT_SUB2API_IMPORT_PATH).replace(/\/+$/, "") || "/";
          const adminIndex = normalized.lastIndexOf("/admin/");
          if (adminIndex > 0) {
            return normalized.slice(0, adminIndex) || "/";
          }
          return normalized.replace(/\/admin\/accounts\/data$/, "") || "/";
        }

        function getImportSuffixFromImportPath(value) {
          const importPath = normalizePublicPath(value, DEFAULT_SUB2API_IMPORT_PATH).replace(/\/+$/, "");
          const adminBasePath = getAdminBasePathFromImportPath(importPath).replace(/\/+$/, "");
          return normalizePublicPath(importPath.slice(adminBasePath.length), "/admin/accounts/data");
        }

        function normalizeUrlLikeInput(value) {
          const raw = String(value || "").trim();
          if (!raw) {
            return "";
          }
          if (/^https?:\/\//i.test(raw)) {
            return raw;
          }
          if (raw.startsWith("//")) {
            return `${getDefaultUrlProtocol()}:${raw}`;
          }
          if (raw.startsWith("/")) {
            return raw;
          }
          if (looksLikeUrlHost(raw)) {
            return `${getDefaultUrlProtocol()}://${raw}`;
          }
          return `/${raw.replace(/^\/+/, "")}`;
        }

        function joinUrlPath(base, path) {
          return `${String(base || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
        }

        function splitSub2ApiAddress(value) {
          const normalized = normalizeUrlLikeInput(value);
          if (!normalized) {
            return {
              origin: getCurrentBrowserOrigin(),
              adminBasePath: sub2apiBrowserConfig.adminBasePath,
              importPath: sub2apiBrowserConfig.importPath,
            };
          }

          if (normalized.startsWith("/")) {
            const hasAdminPath = normalized.includes("/admin/");
            const adminBasePath = hasAdminPath
              ? getAdminBasePathFromImportPath(normalized)
              : normalized;
            return {
              origin: "",
              adminBasePath,
              importPath: hasAdminPath
                ? normalizePublicPath(normalized, DEFAULT_SUB2API_IMPORT_PATH)
                : joinUrlPath(adminBasePath, getImportSuffixFromImportPath(sub2apiBrowserConfig.importPath)),
            };
          }

          try {
            const parsed = new URL(normalized);
            const hasPath = parsed.pathname && parsed.pathname !== "/";
            if (!hasPath) {
              return {
                origin: parsed.origin,
                adminBasePath: sub2apiBrowserConfig.adminBasePath,
                importPath: sub2apiBrowserConfig.importPath,
              };
            }

            const hasAdminPath = parsed.pathname.includes("/admin/");
            const adminBasePath = hasAdminPath
              ? getAdminBasePathFromImportPath(parsed.pathname)
              : parsed.pathname;
            return {
              origin: parsed.origin,
              adminBasePath,
              importPath: hasAdminPath
                ? normalizePublicPath(parsed.pathname, DEFAULT_SUB2API_IMPORT_PATH)
                : joinUrlPath(adminBasePath, getImportSuffixFromImportPath(sub2apiBrowserConfig.importPath)),
            };
          } catch {
            return {
              origin: normalized,
              adminBasePath: sub2apiBrowserConfig.adminBasePath,
              importPath: sub2apiBrowserConfig.importPath,
            };
          }
        }

        function getSub2ApiBearerToken() {
          return String(elements.sub2apiToken?.value || "").trim();
        }

        function getSub2ApiUrlParts() {
          return splitSub2ApiAddress(elements.sub2apiUrl?.value);
        }

        function getSub2ApiAdminBase() {
          if (state.sub2apiProxyEnabled) {
            return "/token-manager/api";
          }
          const { origin, adminBasePath } = getSub2ApiUrlParts();
          return origin ? joinUrlPath(origin, adminBasePath) : adminBasePath;
        }

        function getSub2ApiEndpoint() {
          if (state.sub2apiProxyEnabled) {
            return "/token-manager/api/admin/accounts/data";
          }
          const { origin, importPath } = getSub2ApiUrlParts();
          return origin ? joinUrlPath(origin, importPath) : importPath;
        }

        function getSub2ApiAdminUrl(path) {
          return joinUrlPath(getSub2ApiAdminBase(), path);
        }

        function canLoadServerDefaults() {
          const protocol = window.location?.protocol || "";
          return protocol === "http:" || protocol === "https:";
        }

        function updateSub2ApiConnectionMode() {
          elements.sub2apiBrowserConfig.hidden = false;
          if (state.sub2apiProxyEnabled) {
            elements.sub2apiConfigHint.textContent = "服务器代理模式已启用：这里填写/保存的 sub2api 地址、Bearer Token、分组和代理会保存在服务器；导入请求由 TokenManager BFF 发起，浏览器不会直接访问 sub2api。";
            setStatus(elements.sub2apiConfigStatus, "已连接 TokenManager 服务端。可直接保存配置，或点击“同步分组/代理”读取 sub2api 元数据。", "ok");
          } else {
            elements.sub2apiConfigHint.textContent = "浏览器直连模式：这里的地址和 Bearer Token 只在当前页面请求 sub2api 时使用；如需跨设备持久化，请部署并登录 BFF。";
            setStatus(elements.sub2apiConfigStatus, "浏览器直连模式需要填写 sub2api 地址和 Bearer Token 后，才能同步分组/代理。");
          }
        }

        function normalizeBindingId(value) {
          const normalized = String(value ?? "").trim();
          if (!normalized) {
            return "";
          }
          return /^\d+$/.test(normalized) ? parseInt(normalized, 10) : normalized;
        }

        function normalizeMetaItem(item) {
          if (isPlainObject(item)) {
            const rawId = firstNonEmpty(item.id, item.value, item.key, item.name);
            const normalizedId = normalizeBindingId(rawId);
            if (normalizedId === "") {
              return null;
            }
            return {
              value: normalizedId,
              label: String(firstNonEmpty(item.name, item.label, item.title, rawId)),
            };
          }

          const normalizedId = normalizeBindingId(item);
          if (normalizedId === "") {
            return null;
          }
          return {
            value: normalizedId,
            label: String(item),
          };
        }

        function normalizeMetaItems(items) {
          const seen = new Set();
          return (Array.isArray(items) ? items : [])
            .map(normalizeMetaItem)
            .filter(Boolean)
            .filter((item) => {
              const key = String(item.value);
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            });
        }

        function getGroupItemsFromNativeSelect() {
          return Array.from(elements.groups.options || [])
            .map((option) => normalizeMetaItem({
              id: option.value,
              name: option.textContent || option.label || option.value,
            }))
            .filter(Boolean);
        }

        function getKnownGroupItems() {
          return state.availableGroups.length ? state.availableGroups : getGroupItemsFromNativeSelect();
        }

        function setNativeGroupOptions(items, emptyText = "(暂无可用分组)") {
          const normalizedItems = normalizeMetaItems(items);
          state.availableGroups = normalizedItems;
          elements.groups.innerHTML = normalizedItems.length
            ? normalizedItems
              .map((item) => `<option value="${escapeHtml(String(item.value))}">${escapeHtml(item.label)}</option>`)
              .join("")
            : `<option value="">${escapeHtml(emptyText)}</option>`;
        }

        function getProxyItemsFromNativeSelect() {
          return Array.from(elements.proxy.options || [])
            .map((option) => normalizeMetaItem({
              id: option.value,
              name: option.textContent || option.label || option.value,
            }))
            .filter(Boolean);
        }

        function getKnownProxyItems() {
          return state.availableProxies.length ? state.availableProxies : getProxyItemsFromNativeSelect();
        }

        function setNativeProxyOptions(items, emptyText = "暂无可用代理") {
          const normalizedItems = normalizeMetaItems(items);
          state.availableProxies = normalizedItems;
          elements.proxy.innerHTML = normalizedItems.length
            ? normalizedItems
              .map((item) => `<option value="${escapeHtml(String(item.value))}">${escapeHtml(item.label)}</option>`)
              .join("")
            : `<option value="">${escapeHtml(emptyText)}</option>`;
        }

        function syncHiddenGroupSelectFromState() {
          const selectedGroupSet = new Set(state.selectedGroups.map((item) => String(item)));
          Array.from(elements.groups.options || []).forEach((option) => {
            option.selected = selectedGroupSet.has(String(option.value));
          });
        }

        function syncHiddenProxySelectFromState() {
          const selectedProxySet = new Set(state.selectedProxies.map((item) => String(item)));
          Array.from(elements.proxy.options || []).forEach((option) => {
            option.selected = selectedProxySet.has(String(option.value));
          });
          elements.proxy.value = state.selectedProxies.length ? String(state.selectedProxies[0]) : "";
        }

        function getGroupLabel(value) {
          const key = String(value);
          const fromKnown = getKnownGroupItems().find((item) => String(item.value) === key);
          return fromKnown?.label || `分组 ${key}`;
        }

        function getProxyLabel(value) {
          const key = String(value);
          const fromKnown = getKnownProxyItems().find((item) => String(item.value) === key);
          return fromKnown?.label || `代理 ${key}`;
        }

        function setSelectedGroups(nextGroups, options = {}) {
          const seen = new Set();
          state.selectedGroups = (Array.isArray(nextGroups) ? nextGroups : [])
            .map(normalizeBindingId)
            .filter((value) => value !== "")
            .filter((value) => {
              const key = String(value);
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            });
          syncHiddenGroupSelectFromState();
          renderGroupPicker();
          if (options.schedule !== false) {
            scheduleConvert();
          }
        }

        function setSelectedProxies(nextProxies, options = {}) {
          const seen = new Set();
          state.selectedProxies = (Array.isArray(nextProxies) ? nextProxies : [])
            .map(normalizeBindingId)
            .filter((value) => value !== "")
            .filter((value) => {
              const key = String(value);
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            });
          syncHiddenProxySelectFromState();
          renderProxyPicker();
          if (options.schedule !== false) {
            scheduleConvert();
          }
        }

        function getFilteredGroupItems() {
          const keyword = String(state.groupSearch || "").trim().toLowerCase();
          const items = getKnownGroupItems();
          if (!keyword) {
            return items;
          }
          return items.filter((item) => {
            const haystack = `${item.label} ${item.value}`.toLowerCase();
            return haystack.includes(keyword);
          });
        }

        function getFilteredProxyItems() {
          const keyword = String(state.proxySearch || "").trim().toLowerCase();
          const items = getKnownProxyItems();
          if (!keyword) {
            return items;
          }
          return items.filter((item) => {
            const haystack = `${item.label} ${item.value}`.toLowerCase();
            return haystack.includes(keyword);
          });
        }

        function renderGroupSummary() {
          if (!state.selectedGroups.length) {
            elements.groupSummary.innerHTML = '<span class="group-chip is-muted">未选择分组</span>';
            return;
          }

          const visible = state.selectedGroups.slice(0, 5);
          const hiddenCount = state.selectedGroups.length - visible.length;
          elements.groupSummary.innerHTML = [
            `<span class="group-chip">已选 ${state.selectedGroups.length} 个</span>`,
            ...visible.map((value) => `<span class="group-chip" title="${escapeHtml(getGroupLabel(value))}">${escapeHtml(getGroupLabel(value))}</span>`),
            hiddenCount > 0 ? `<span class="group-chip is-muted">+${hiddenCount}</span>` : "",
          ].filter(Boolean).join("");
        }

        function renderProxySummary() {
          if (!state.selectedProxies.length) {
            elements.proxySummary.innerHTML = '<span class="group-chip is-muted">未选择代理</span>';
            return;
          }

          const visible = state.selectedProxies.slice(0, 5);
          const hiddenCount = state.selectedProxies.length - visible.length;
          elements.proxySummary.innerHTML = [
            `<span class="group-chip">已选 ${state.selectedProxies.length} 个</span>`,
            ...visible.map((value) => `<span class="group-chip" title="${escapeHtml(getProxyLabel(value))}">${escapeHtml(getProxyLabel(value))}</span>`),
            hiddenCount > 0 ? `<span class="group-chip is-muted">+${hiddenCount}</span>` : "",
          ].filter(Boolean).join("");
        }

        function renderGroupPicker() {
          renderGroupSummary();
          const items = getFilteredGroupItems();
          const selectedGroupSet = new Set(state.selectedGroups.map((item) => String(item)));
          const allItems = getKnownGroupItems();

          if (!allItems.length) {
            elements.groupList.innerHTML = '<div class="group-empty">先点击“同步”，TokenManager 会从 sub2api 读取可用分组。</div>';
            return;
          }

          if (!items.length) {
            elements.groupList.innerHTML = '<div class="group-empty">没有匹配的分组；换个关键词试试。</div>';
            return;
          }

          elements.groupList.innerHTML = items.map((item) => {
            const value = String(item.value);
            const selected = selectedGroupSet.has(value);
            return `
              <label class="group-option${selected ? " is-selected" : ""}" data-group-id="${escapeHtml(value)}" role="option" aria-selected="${selected}">
                <input type="checkbox" data-group-id="${escapeHtml(value)}" ${selected ? "checked" : ""} />
                <span>
                  <span class="group-option-name">${escapeHtml(item.label)}</span>
                  <span class="group-option-id">ID: ${escapeHtml(value)}</span>
                </span>
              </label>
            `;
          }).join("");
        }

        function renderProxyPicker() {
          renderProxySummary();
          const items = getFilteredProxyItems();
          const selectedProxySet = new Set(state.selectedProxies.map((item) => String(item)));
          const allItems = getKnownProxyItems();

          if (!allItems.length) {
            elements.proxyList.innerHTML = '<div class="group-empty">先点击“同步”，TokenManager 会从 sub2api 读取可用代理。</div>';
            return;
          }

          if (!items.length) {
            elements.proxyList.innerHTML = '<div class="group-empty">没有匹配的代理；换个关键词试试。</div>';
            return;
          }

          elements.proxyList.innerHTML = items.map((item) => {
            const value = String(item.value);
            const selected = selectedProxySet.has(value);
            return `
              <label class="group-option${selected ? " is-selected" : ""}" data-proxy-id="${escapeHtml(value)}" role="option" aria-selected="${selected}">
                <input type="checkbox" data-proxy-id="${escapeHtml(value)}" ${selected ? "checked" : ""} />
                <span>
                  <span class="group-option-name">${escapeHtml(item.label)}</span>
                  <span class="group-option-id">ID: ${escapeHtml(value)}</span>
                </span>
              </label>
            `;
          }).join("");
        }

        function applySavedSub2ApiSelectionsToControls() {
          syncHiddenGroupSelectFromState();
          syncHiddenProxySelectFromState();
          renderGroupPicker();
          renderProxyPicker();
        }

        function hydrateSavedSub2ApiSettings(payload) {
          if (Array.isArray(payload.group_ids)) {
            state.selectedGroups = payload.group_ids
              .map((value) => /^\d+$/.test(String(value)) ? parseInt(value, 10) : String(value))
              .filter((value) => value !== "");
          }
          if (Array.isArray(payload.proxy_ids)) {
            setSelectedProxies(payload.proxy_ids
              .map((value) => /^\d+$/.test(String(value)) ? parseInt(value, 10) : String(value))
              .filter((value) => value !== ""), { schedule: false });
          } else if (Object.prototype.hasOwnProperty.call(payload, "proxy_id")) {
            const value = payload.proxy_id;
            setSelectedProxies(value === null || value === undefined || value === "" ? [] : [/^\d+$/.test(String(value)) ? parseInt(value, 10) : String(value)], { schedule: false });
          }
          if (Number.isFinite(Number(payload.priority))) {
            state.priority = Number(payload.priority);
            elements.priority.value = String(state.priority);
          }
          if (Number.isFinite(Number(payload.rate_multiplier))) {
            state.rateMultiplier = Number(payload.rate_multiplier);
            elements.rateMultiplier.value = String(state.rateMultiplier);
          }
          const websocketMode = String(payload.websocket_mode || payload.websocketMode || "off");
          state.websocketMode = ["off", "ctx_pool", "passthrough"].includes(websocketMode) ? websocketMode : "off";
          elements.websocketMode.value = state.websocketMode;
          state.autoPassthrough = payload.auto_passthrough === true || payload.autoPassthrough === true;
          elements.autoPassthrough.checked = state.autoPassthrough;
          if (payload.sub2api_has_bearer_token || payload.sub2api_server_auth_configured) {
            elements.sub2apiToken.placeholder = "服务器已保存认证；留空保存不会覆盖";
          }
          applySavedSub2ApiSelectionsToControls();
        }

        function hydrateSub2ApiBrowserConfig(payload) {
          state.sub2apiProxyEnabled = payload.sub2api_proxy_enabled === true || payload.sub2apiProxyEnabled === true;
          updateSub2ApiConnectionMode();

          const configuredImportPath = normalizePublicPath(
            firstNonEmpty(payload.sub2api_import_path, payload.sub2apiImportPath),
            DEFAULT_SUB2API_IMPORT_PATH,
          );
          sub2apiBrowserConfig.importPath = configuredImportPath;
          sub2apiBrowserConfig.adminBasePath = normalizePublicPath(
            firstNonEmpty(payload.sub2api_admin_base_path, payload.sub2apiAdminBasePath, payload.sub2api_api_base_path, payload.sub2apiApiBasePath),
            getAdminBasePathFromImportPath(configuredImportPath),
          );

          const defaultOrigin = firstNonEmpty(
            payload.sub2api_default_origin,
            payload.sub2apiDefaultOrigin,
          );
          if (defaultOrigin && !elements.sub2apiUrl.dataset.userEdited) {
            elements.sub2apiUrl.value = defaultOrigin;
          }

          // Backward compatibility for older BFF config payloads.
          const legacyDefaultUrl = firstNonEmpty(payload.sub2api_default_url, payload.sub2apiDefaultUrl);
          if (legacyDefaultUrl && !elements.sub2apiUrl.dataset.userEdited) {
            const { origin, adminBasePath } = splitSub2ApiAddress(legacyDefaultUrl);
            if (origin) {
              elements.sub2apiUrl.value = origin;
            } else if (adminBasePath && adminBasePath !== DEFAULT_SUB2API_ADMIN_BASE) {
              elements.sub2apiUrl.value = adminBasePath;
            }
          }

          hydrateSavedSub2ApiSettings(payload);
        }

        async function hydrateSub2ApiDefaults() {
          if (!canLoadServerDefaults()) {
            return;
          }

          try {
            const response = await fetch("/token-manager/auth/config", {
              cache: "no-store",
              headers: { Accept: "application/json" },
            });
            if (!response.ok) {
              return;
            }
            hydrateSub2ApiBrowserConfig(await response.json());
          } catch {
            // Static/local usage does not require the BFF config endpoint.
          }
        }

        async function saveSub2ApiConfig() {
          if (!canLoadServerDefaults()) {
            setStatus(elements.sub2apiConfigStatus, "本地静态页面无法保存服务器配置；请通过 TokenManager 服务端页面访问。", "error");
            return;
          }

          elements.saveSub2apiConfig.disabled = true;
          const originalText = elements.saveSub2apiConfig.textContent;
          elements.saveSub2apiConfig.textContent = "保存中...";
          setStatus(elements.sub2apiConfigStatus, "正在保存 sub2api 地址、认证、分组、代理和导入参数...", "ok");

          try {
            const response = await fetch("/token-manager/auth/config", {
              method: "POST",
              cache: "no-store",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                sub2api_default_origin: elements.sub2apiUrl.value.trim(),
                sub2api_import_path: sub2apiBrowserConfig.importPath,
                sub2api_bearer_token: elements.sub2apiToken.value.trim(),
                group_ids: state.selectedGroups,
                proxy_ids: state.selectedProxies,
                proxy_id: state.selectedProxies.length ? state.selectedProxies[0] : null,
                priority: state.priority,
                rate_multiplier: state.rateMultiplier,
                websocket_mode: state.websocketMode,
                auto_passthrough: state.autoPassthrough,
              }),
            });
            const payload = await readJsonResponse(response);
            if (!response.ok) {
              throw new Error(getErrorMessageFromResponseBody(payload, `HTTP ${response.status}`));
            }
            hydrateSub2ApiBrowserConfig(payload || {});
            elements.sub2apiToken.value = "";
            setStatus(elements.sub2apiConfigStatus, "保存成功：配置已写入服务器，下次打开页面会自动加载。", "ok");
          } catch (error) {
            setStatus(elements.sub2apiConfigStatus, error instanceof Error ? `保存失败：${error.message}` : "保存配置失败。", "error");
          } finally {
            elements.saveSub2apiConfig.disabled = false;
            elements.saveSub2apiConfig.textContent = originalText;
          }
        }

        async function saveTokenManagerPassword() {
          if (!canLoadServerDefaults()) {
            setStatus(elements.tokenmanagerPasswordStatus, "本地静态页面无法修改服务器登录密码。", "error");
            return;
          }

          const password = String(elements.tokenmanagerPassword.value || "");
          const confirm = String(elements.tokenmanagerPasswordConfirm.value || "");
          if (password.length < 8) {
            setStatus(elements.tokenmanagerPasswordStatus, "新密码至少需要 8 位。", "error");
            return;
          }
          if (password !== confirm) {
            setStatus(elements.tokenmanagerPasswordStatus, "两次输入的新密码不一致。", "error");
            return;
          }

          elements.saveTokenmanagerPassword.disabled = true;
          const originalText = elements.saveTokenmanagerPassword.textContent;
          elements.saveTokenmanagerPassword.textContent = "保存中...";

          try {
            const response = await fetch("/token-manager/auth/password", {
              method: "POST",
              cache: "no-store",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ new_password: password }),
            });
            const payload = await readJsonResponse(response);
            if (!response.ok) {
              throw new Error(getErrorMessageFromResponseBody(payload, `HTTP ${response.status}`));
            }
            elements.tokenmanagerPassword.value = "";
            elements.tokenmanagerPasswordConfirm.value = "";
            setStatus(elements.tokenmanagerPasswordStatus, "登录密码已更新；下次登录请使用新密码。", "ok");
          } catch (error) {
            setStatus(elements.tokenmanagerPasswordStatus, error instanceof Error ? error.message : "保存登录密码失败。", "error");
          } finally {
            elements.saveTokenmanagerPassword.disabled = false;
            elements.saveTokenmanagerPassword.textContent = originalText;
          }
        }

        function buildUrlWithQuery(url, params) {
          const query = Object.entries(params)
            .filter(([, value]) => value !== undefined && value !== null && value !== "")
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
            .join("&");

          return query ? `${url}${url.includes("?") ? "&" : "?"}${query}` : url;
        }

        function unwrapApiData(value) {
          if (!isPlainObject(value) || !Object.prototype.hasOwnProperty.call(value, "data")) {
            return value;
          }

          const keys = Object.keys(value);
          const looksLikeApiEnvelope = Object.prototype.hasOwnProperty.call(value, "code")
            || Object.prototype.hasOwnProperty.call(value, "message")
            || keys.every((key) => ["code", "message", "data"].includes(key));

          if (looksLikeApiEnvelope) {
            return value.data;
          }

          return value;
        }

        async function readJsonResponse(response) {
          const responseText = await response.text();
          if (!responseText) {
            return null;
          }

          try {
            return JSON.parse(responseText);
          } catch {
            return responseText;
          }
        }

        function getErrorMessageFromResponseBody(body, fallback) {
          if (isPlainObject(body)) {
            return firstNonEmpty(body.message, body.detail, body.error) || fallback;
          }

          return typeof body === "string" && body.trim() ? body.trim() : fallback;
        }

        async function requestSub2ApiJson(url, options = {}) {
          const bearerToken = getSub2ApiBearerToken();
          if (!state.sub2apiProxyEnabled && !bearerToken) {
            throw new Error("请填写 sub2api Bearer Token。");
          }

          const response = await fetch(url, {
            ...options,
            headers: {
              ...(state.sub2apiProxyEnabled ? {} : { Authorization: `Bearer ${bearerToken}` }),
              "Content-Type": "application/json",
              ...(options.headers || {}),
            },
          });
          const body = await readJsonResponse(response);

          if (!response.ok) {
            throw new Error(getErrorMessageFromResponseBody(body, `HTTP ${response.status}`));
          }

          if (isPlainObject(body) && Object.prototype.hasOwnProperty.call(body, "code") && body.code !== 0 && body.code !== "SUCCESS") {
            throw new Error(getErrorMessageFromResponseBody(body, "sub2api 返回错误。"));
          }

          return unwrapApiData(body);
        }

        function extractPaginatedItems(value) {
          const data = unwrapApiData(value);

          if (Array.isArray(data)) {
            return { items: data, total: data.length };
          }

          if (!isPlainObject(data)) {
            return { items: [], total: 0 };
          }

          const items = Array.isArray(data.items)
            ? data.items
            : Array.isArray(data.data)
              ? data.data
              : Array.isArray(data.accounts)
                ? data.accounts
                : [];
          const total = Number(data.total ?? data.total_count ?? items.length);

          return {
            items,
            total: Number.isFinite(total) ? total : items.length,
          };
        }

        function getServerAccountDisplay(account) {
          const credentials = isPlainObject(account.credentials) ? account.credentials : {};
          const extra = isPlainObject(account.extra) ? account.extra : {};
          const email = firstNonEmpty(account.email, credentials.email, extra.email);
          const name = firstNonEmpty(account.name, email, credentials.chatgpt_account_id, String(account.id || ""));
          const expiresAt = normalizeTimestamp(account.expires_at)
            || normalizeTimestamp(credentials.expires_at)
            || timestampFromUnixSeconds(credentials.exp)
            || timestampFromUnixSeconds(account.expires_at);
          const status = firstNonEmpty(account.status, account.state, account.disabled ? "disabled" : "active");

          return { name, email, expiresAt, status };
        }

        function renderServerAccounts() {
          if (!state.serverAccounts.length) {
            elements.serverAccountBody.innerHTML = '<tr><td colspan="4" class="empty">暂无服务器账号数据。</td></tr>';
            return;
          }

          elements.serverAccountBody.innerHTML = state.serverAccounts.map((account) => {
            const display = getServerAccountDisplay(account);
            return `
              <tr>
                <td><div class="cell-clip" title="${escapeHtml(display.name)}">${escapeHtml(display.name || "-")}</div></td>
                <td><div class="cell-clip" title="${escapeHtml(display.email)}">${escapeHtml(display.email || "-")}</div></td>
                <td><div class="cell-clip" title="${escapeHtml(display.expiresAt)}">${escapeHtml(formatDisplayDate(display.expiresAt) || "-")}</div></td>
                <td><div class="cell-clip" title="${escapeHtml(display.status)}">${escapeHtml(display.status || "-")}</div></td>
              </tr>
            `;
          }).join("");
        }

        async function refreshServerAccounts() {
          elements.refreshServerAccounts.disabled = true;
          const originalText = elements.refreshServerAccounts.textContent;
          elements.refreshServerAccounts.textContent = "刷新中...";
          setStatus(elements.serverAccountStatus, "正在从服务器读取账号列表...", "ok");

          try {
            const url = buildUrlWithQuery(getSub2ApiAdminUrl("/admin/accounts"), {
              page: 1,
              page_size: 50,
              sort_by: "created_at",
              sort_order: "desc",
            });
            const payload = await requestSub2ApiJson(url);
            const { items, total } = extractPaginatedItems(payload);
            state.serverAccounts = items;
            state.serverAccountTotal = total;
            renderServerAccounts();
            setStatus(elements.serverAccountStatus, `服务器已保存 ${total} 个账号，当前显示 ${items.length} 个。`, "ok");
          } catch (error) {
            setStatus(elements.serverAccountStatus, error instanceof Error ? error.message : "读取服务器账号失败。", "error");
          } finally {
            elements.refreshServerAccounts.disabled = false;
            elements.refreshServerAccounts.textContent = originalText;
          }
        }

        // 新增功能：异步拉取 sub2api 的分组和代理列表元数据并渲染选择器
        async function fetchSub2ApiMeta() {
          const bearerToken = getSub2ApiBearerToken();
          if (!state.sub2apiProxyEnabled && !bearerToken) {
            setStatus(elements.sub2apiConfigStatus, "同步失败：浏览器直连模式需要先填写 sub2api 地址和 Bearer Token。", "error");
            return;
          }

          elements.fetchSub2apiMeta.disabled = true;
          const originalText = elements.fetchSub2apiMeta.textContent;
          elements.fetchSub2apiMeta.textContent = "同步中...";
          setStatus(elements.sub2apiConfigStatus, "正在从 sub2api 同步分组和代理列表...", "ok");

          try {
            // 分别向后端拉取 groups (分组) 与 proxies (代理)
            const [groupsRes, proxiesRes] = await Promise.all([
              requestSub2ApiJson(getSub2ApiAdminUrl("/admin/groups/all")),
              requestSub2ApiJson(getSub2ApiAdminUrl("/admin/proxies/all")),
            ]);

            if (groupsRes) {
              const groups = normalizeMetaItems(unwrapApiData(groupsRes));
              setNativeGroupOptions(groups, "未获取到可用分组数据");
            } else {
              setNativeGroupOptions([], "未获取到可用分组数据");
            }

            if (proxiesRes) {
              const proxies = normalizeMetaItems(unwrapApiData(proxiesRes));
              setNativeProxyOptions(proxies, "未获取到可用代理数据");
            } else {
              setNativeProxyOptions([], "未获取到可用代理数据");
            }

            applySavedSub2ApiSelectionsToControls();
            setStatus(elements.sub2apiConfigStatus, `同步成功：读取 ${getKnownGroupItems().length} 个分组、${getKnownProxyItems().length} 个代理。选择后点击“保存配置”即可持久化。`, "ok");
          } catch (error) {
            setStatus(elements.sub2apiConfigStatus, `同步失败：${error instanceof Error ? error.message : "无法读取分组/代理。"}`, "error");
          } finally {
            elements.fetchSub2apiMeta.disabled = false;
            elements.fetchSub2apiMeta.textContent = originalText;
            // 触发表单数据更新状态
            elements.groups.dispatchEvent(new Event('change'));
            elements.proxy.dispatchEvent(new Event('change'));
          }
        }

        async function importToSub2Api() {
          if (!state.converted.length) {
            setStatus(elements.outputStatus, "没有可导入的账号。", "error");
            return;
          }
          if (!isSub2ApiFormat()) {
            setStatus(elements.outputStatus, "只有选择 sub2api 输出格式时才能导入到 sub2api。", "error");
            return;
          }

          const sub2apiUrl = getSub2ApiEndpoint();
          const bearerToken = getSub2ApiBearerToken();
          if (!sub2apiUrl) {
            setStatus(elements.outputStatus, "请填写 sub2api 服务器地址。", "error");
            return;
          }
          if (!state.sub2apiProxyEnabled && !bearerToken) {
            setStatus(elements.outputStatus, "请填写 sub2api Bearer Token。", "error");
            return;
          }

          elements.importSub2api.disabled = true;
          setStatus(elements.outputStatus, "正在导入到 sub2api...", "ok");

          try {
            const data = await requestSub2ApiJson(sub2apiUrl, {
              method: "POST",
              body: JSON.stringify(buildSub2apiImportPayload()),
            });
            const accountCreated = Number(data.account_created ?? data.created ?? 0);
            const accountFailed = Number(data.account_failed ?? data.failed ?? 0);
            const proxyCreated = Number(data.proxy_created ?? 0);
            const proxyReused = Number(data.proxy_reused ?? 0);
            setStatus(
              elements.outputStatus,
              `已导入 sub2api：账号创建 ${accountCreated}，失败 ${accountFailed}，代理创建 ${proxyCreated}，复用 ${proxyReused}。`,
              "ok"
            );
            await refreshServerAccounts();
          } catch (error) {
            setStatus(elements.outputStatus, error instanceof Error ? error.message : "导入到 sub2api 失败。", "error");
          } finally {
            updateImportButtonState();
          }
        }

        async function readFiles(files) {
          const jsonFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".json"));
          if (!jsonFiles.length) {
            setStatus(elements.inputStatus, "没有选择 JSON 文件。", "error");
            return;
          }

          const documents = [];
          const skipped = [];

          for (const file of jsonFiles) {
            try {
              const text = await file.text();
              const parsed = JSON.parse(text);
              const found = collectSessionLikeObjects(parsed, file.webkitRelativePath || file.name);
              if (!found.length) {
                skipped.push({
                  sourceName: file.webkitRelativePath || file.name,
                  path: "$",
                  reason: "未找到包含 accessToken 和 user/email 的 session 对象",
                });
              }
              documents.push(...found);
            } catch (error) {
              skipped.push({
                sourceName: file.webkitRelativePath || file.name,
                path: "$",
                reason: error instanceof Error ? error.message : "无法读取文件",
              });
            }
          }

          const now = new Date();
          const converted = [];
          const convertSkipped = [...skipped];
          documents.forEach((item) => {
            try {
              converted.push(convertSession(item.value, {
                now,
                sourceName: item.sourceName,
                sourcePath: item.path,
              }));
            } catch (error) {
              convertSkipped.push({
                sourceName: file.webkitRelativePath || file.name,
                path: item.path,
                reason: error instanceof Error ? error.message : "无法转换",
              });
            }
          });

          state.sessions = documents;
          state.converted = converted;
          state.skipped = convertSkipped;
          elements.input.value = documents.length === 1
            ? JSON.stringify(documents[0].value, null, 2)
            : JSON.stringify(documents.map((item) => item.value), null, 2);
          updateOutput();
          setStatus(elements.inputStatus, `读取 ${jsonFiles.length} 个文件，生成 ${converted.length} 个账号，跳过 ${convertSkipped.length} 项。`, converted.length ? "ok" : "error");
        }

        elements.formatButtons.forEach((button) => {
          button.addEventListener("click", () => {
            state.format = button.dataset.format;
            elements.formatButtons.forEach((item) => {
              item.setAttribute("aria-pressed", String(item === button));
            });
            updateOutput();
          });
        });

        // 监听新增表单字段变化，实时改变转换状态
        elements.priority.addEventListener("input", () => {
          state.priority = parseInt(elements.priority.value, 10);
          if (Number.isNaN(state.priority)) state.priority = 1;
          scheduleConvert();
        });

        elements.rateMultiplier.addEventListener("input", () => {
          state.rateMultiplier = parseFloat(elements.rateMultiplier.value);
          if (Number.isNaN(state.rateMultiplier)) state.rateMultiplier = 1.0;
          scheduleConvert();
        });

        elements.websocketMode.addEventListener("change", () => {
          state.websocketMode = elements.websocketMode.value || "off";
          scheduleConvert();
        });

        elements.autoPassthrough.addEventListener("change", () => {
          state.autoPassthrough = elements.autoPassthrough.checked === true;
          scheduleConvert();
        });

        elements.groups.addEventListener("change", () => {
          setSelectedGroups(Array.from(elements.groups.selectedOptions)
            .map(o => o.value)
            .filter(v => v !== "")
            .map(v => /^\d+$/.test(v) ? parseInt(v, 10) : v));
        });

        elements.groupSearch.addEventListener("input", () => {
          state.groupSearch = elements.groupSearch.value;
          renderGroupPicker();
        });

        elements.groupList.addEventListener("change", (event) => {
          const groupId = event.target?.dataset?.groupId;
          if (!groupId) {
            return;
          }
          const normalizedId = normalizeBindingId(groupId);
          const selectedGroupSet = new Set(state.selectedGroups.map((item) => String(item)));
          if (event.target.checked) {
            selectedGroupSet.add(String(normalizedId));
          } else {
            selectedGroupSet.delete(String(normalizedId));
          }
          setSelectedGroups(Array.from(selectedGroupSet));
        });

        elements.selectAllGroups.addEventListener("click", () => {
          const selectedGroupSet = new Set(state.selectedGroups.map((item) => String(item)));
          getFilteredGroupItems().forEach((item) => selectedGroupSet.add(String(item.value)));
          setSelectedGroups(Array.from(selectedGroupSet));
        });

        elements.clearGroups.addEventListener("click", () => {
          setSelectedGroups([]);
        });

        elements.proxy.addEventListener("change", () => {
          const selectedOptions = Array.from(elements.proxy.selectedOptions || [])
            .map(o => o.value)
            .filter(v => v !== "");
          const fallbackValue = selectedOptions.length ? [] : [elements.proxy.value].filter(Boolean);
          setSelectedProxies(selectedOptions.length ? selectedOptions : fallbackValue);
        });

        elements.proxySearch.addEventListener("input", () => {
          state.proxySearch = elements.proxySearch.value;
          renderProxyPicker();
        });

        elements.proxyList.addEventListener("change", (event) => {
          const proxyId = event.target?.dataset?.proxyId;
          if (!proxyId) {
            return;
          }
          const normalizedId = normalizeBindingId(proxyId);
          const selectedProxySet = new Set(state.selectedProxies.map((item) => String(item)));
          if (event.target.checked) {
            selectedProxySet.add(String(normalizedId));
          } else {
            selectedProxySet.delete(String(normalizedId));
          }
          setSelectedProxies(Array.from(selectedProxySet));
        });

        elements.selectAllProxies.addEventListener("click", () => {
          const selectedProxySet = new Set(state.selectedProxies.map((item) => String(item)));
          getFilteredProxyItems().forEach((item) => selectedProxySet.add(String(item.value)));
          setSelectedProxies(Array.from(selectedProxySet));
        });

        elements.clearProxies.addEventListener("click", () => {
          setSelectedProxies([]);
        });

        elements.sub2apiUrl.addEventListener("input", () => {
          elements.sub2apiUrl.dataset.userEdited = "true";
        });

        elements.fetchSub2apiMeta.addEventListener("click", fetchSub2ApiMeta);
        elements.refreshServerAccounts.addEventListener("click", refreshServerAccounts);
        elements.saveSub2apiConfig.addEventListener("click", saveSub2ApiConfig);
        elements.saveTokenmanagerPassword.addEventListener("click", saveTokenManagerPassword);
        elements.sub2apiTokenToggle.addEventListener("click", () => {
          const isVisible = elements.sub2apiToken.type === "text";
          elements.sub2apiToken.type = isVisible ? "password" : "text";
          const label = isVisible ? "显示 Bearer Token" : "隐藏 Bearer Token";
          elements.sub2apiTokenToggle.setAttribute("aria-label", label);
          elements.sub2apiTokenToggle.setAttribute("aria-pressed", String(!isVisible));
          elements.sub2apiTokenToggle.title = label;
        });

        elements.input.addEventListener("input", scheduleConvert);
        elements.copyOutput.addEventListener("click", copyOutput);
        elements.downloadOutput.addEventListener("click", downloadOutput);
        elements.importSub2api.addEventListener("click", importToSub2Api);
        elements.pickFiles.addEventListener("click", () => elements.fileInput.click());
        elements.fileInput.addEventListener("change", (event) => {
          readFiles(event.target.files);
          event.target.value = "";
        });

        elements.clearInput.addEventListener("click", () => {
          elements.input.value = "";
          scheduleConvert();
        });

        elements.loadExample.addEventListener("click", () => {
          elements.input.value = JSON.stringify(exampleSession, null, 2);
          scheduleConvert();
        });

        updateOutput();
        renderServerAccounts();
        updateSub2ApiConnectionMode();
        hydrateSub2ApiDefaults();
      })();
