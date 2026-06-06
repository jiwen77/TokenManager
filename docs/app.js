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
          concurrency: 10,
          rateMultiplier: 1.0,
          expiresAtOverride: null,
          formatInputPretty: false,
          serverAccounts: [],
          serverAccountTotal: 0,
          serverAccountSearch: "",
          selectedServerAccountIds: [],
          availableGroups: [],
          availableProxies: [],
          groupSearch: "",
          proxySearch: "",
          selectedGroups: [],
          selectedProxies: [],
          sub2apiProxyEnabled: false,
          websocketMode: "off",
          autoPassthrough: false,
          setPrivacy: false
        };

        const elements = {
          accountBody: document.querySelector("#account-body"),
          clearInput: document.querySelector("#clear-input"),
          copyOutput: document.querySelector("#copy-output"),
          cpaNotice: document.querySelector("#cpa-notice"),
          downloadOutput: document.querySelector("#download-output"),
          importSub2api: document.querySelector("#import-sub2api"),
          fileInput: document.querySelector("#file-input"),
          formatInput: document.querySelector("#format-input"),
          formatButtons: Array.from(document.querySelectorAll("[data-format]")),
          input: document.querySelector("#session-input"),
          inputStatus: document.querySelector("#input-status"),
          issues: document.querySelector("#issues"),
          loadExample: document.querySelector("#load-example"),
          logoutButton: document.querySelector("#logout-button"),
          output: document.querySelector("#output"),
          outputImportActions: document.querySelector("#output-import-actions"),
          outputStatus: document.querySelector("#output-status"),
          outputSubtitle: document.querySelector("#output-subtitle"),
          pickFiles: document.querySelector("#pick-files"),
          refreshServerAccounts: document.querySelector("#refresh-server-accounts"),
          serverAccountBody: document.querySelector("#server-account-body"),
          serverAccountSearch: document.querySelector("#server-account-search"),
          serverAccountSelectionSummary: document.querySelector("#server-account-selection-summary"),
          toggleVisibleServerAccountSelection: document.querySelector("#toggle-visible-server-account-selection"),
          applySelectedServerAccountSettings: document.querySelector("#apply-selected-server-account-settings"),
          privacySelectedServerAccounts: document.querySelector("#privacy-selected-server-accounts"),
          startSelectedServerAccountSchedule: document.querySelector("#start-selected-server-account-schedule"),
          stopSelectedServerAccountSchedule: document.querySelector("#stop-selected-server-account-schedule"),
          enableSelectedServerAccounts: document.querySelector("#enable-selected-server-accounts"),
          disableSelectedServerAccounts: document.querySelector("#disable-selected-server-accounts"),
          deleteSelectedServerAccounts: document.querySelector("#delete-selected-server-accounts"),
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
          concurrency: document.querySelector("#sub2api-concurrency"),
          rateMultiplier: document.querySelector("#sub2api-rate-multiplier"),
          expiresAt: document.querySelector("#sub2api-expires-at"),
          websocketMode: document.querySelector("#sub2api-websocket-mode"),
          autoPassthrough: document.querySelector("#sub2api-auto-passthrough"),
          setPrivacy: document.querySelector("#sub2api-set-privacy"),
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

        function unixSecondsFromDateInput(value) {
          const text = String(value || "").trim();
          if (!text) {
            return null;
          }
          const date = new Date(text);
          return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
        }

        function dateInputFromUnixSeconds(value) {
          const seconds = Number(value);
          if (!Number.isFinite(seconds) || seconds <= 0) {
            return "";
          }
          const date = new Date(seconds * 1000);
          if (Number.isNaN(date.getTime())) {
            return "";
          }
          const pad = (number) => String(number).padStart(2, "0");
          return [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate()),
          ].join("-") + `T${[
            pad(date.getHours()),
            pad(date.getMinutes()),
            pad(date.getSeconds()),
          ].join(":")}`;
        }

        function timestampFromUnixSeconds(value) {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || numeric <= 0) {
            return undefined;
          }

          const date = new Date(numeric * 1000);
          return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
        }

        function normalizeDisplayTimestamp(value) {
          if (value === undefined || value === null || value === "") {
            return undefined;
          }

          if (typeof value === "number" || (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim()))) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) {
              return undefined;
            }
            const milliseconds = numeric > 1e11 ? numeric : numeric * 1000;
            const date = new Date(milliseconds);
            return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
          }

          return normalizeTimestamp(value);
        }

        function firstDisplayTimestamp(...values) {
          for (const value of values) {
            const normalized = normalizeDisplayTimestamp(value);
            if (normalized) {
              return normalized;
            }
          }
          return undefined;
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

        function getLineColumn(text, index) {
          const before = text.slice(0, Math.max(0, index));
          const lines = before.split(/\n/);
          return {
            line: lines.length,
            column: lines[lines.length - 1].length + 1,
          };
        }

        function parseConcatenatedJsonValues(text, originalError) {
          const values = [];
          const input = String(text || "");
          let index = 0;

          while (index < input.length) {
            while (index < input.length && (/[\s,;]/.test(input[index]))) {
              index += 1;
            }
            if (index >= input.length) {
              break;
            }

            const start = index;
            const first = input[index];
            if (first !== "{" && first !== "[") {
              const location = getLineColumn(input, index);
              throw new Error(`JSON 解析失败：第 ${location.line} 行第 ${location.column} 列应以 { 或 [ 开始；也可以用 JSON 数组包住多个账号。`);
            }

            const stack = [];
            let inString = false;
            let escaped = false;
            let completed = false;

            for (; index < input.length; index += 1) {
              const char = input[index];
              if (inString) {
                if (escaped) {
                  escaped = false;
                } else if (char === "\\") {
                  escaped = true;
                } else if (char === "\"") {
                  inString = false;
                }
                continue;
              }

              if (char === "\"") {
                inString = true;
                continue;
              }
              if (char === "{" || char === "[") {
                stack.push(char);
                continue;
              }
              if (char === "}" || char === "]") {
                const expected = char === "}" ? "{" : "[";
                if (stack.pop() !== expected) {
                  const location = getLineColumn(input, index);
                  throw new Error(`JSON 解析失败：第 ${location.line} 行第 ${location.column} 列括号不匹配。`);
                }
                if (!stack.length) {
                  const rawDocument = input.slice(start, index + 1);
                  try {
                    values.push(JSON.parse(rawDocument));
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`JSON 解析失败：第 ${values.length + 1} 段 JSON 无效：${message}`);
                  }
                  index += 1;
                  completed = true;
                  break;
                }
              }
            }

            if (!completed) {
              const message = originalError instanceof Error ? originalError.message : "JSON 片段未闭合";
              throw new Error(`JSON 解析失败：${message}`);
            }
          }

          return values;
        }

        function parseInputJsonValues(text) {
          const input = String(text || "");
          try {
            return [JSON.parse(input)];
          } catch (error) {
            return parseConcatenatedJsonValues(input, error);
          }
        }

        function parseInputDocuments(text) {
          if (typeof text !== "string" || text.trim() === "") {
            return [];
          }

          const values = parseInputJsonValues(text);
          return values.flatMap((value, index) => collectSessionLikeObjects(
            value,
            values.length > 1 ? `pasted-json#${index + 1}` : "pasted-json",
          ));
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
            expires_at: state.expiresAtOverride ?? accessTokenExpiresAt,
            auto_pause_on_expired: true,
            confirm_mixed_channel_risk: true,
            concurrency: state.concurrency,
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

        function buildSub2apiBatchPayload() {
          return {
            accounts: buildSub2apiImportAccounts(),
          };
        }

        function buildSub2apiImportAccounts() {
          return state.converted.map((item) => assignRandomProxy(item.sub2apiAccount));
        }

        function firstNonEmptyText(...values) {
          for (const value of values) {
            if (value === undefined || value === null) {
              continue;
            }
            const text = String(value).trim();
            if (text) {
              return text;
            }
          }
          return "";
        }

        function normalizeIdentityText(value) {
          return firstNonEmptyText(value).toLowerCase();
        }

        function getSub2ApiRecordId(account) {
          return firstNonEmptyText(account?.id, account?.account_id, account?.accountId, account?.uuid);
        }

        function getAccountIdentity(account) {
          const credentials = isPlainObject(account?.credentials) ? account.credentials : {};
          const extra = isPlainObject(account?.extra) ? account.extra : {};
          const chatgptAccountId = normalizeIdentityText(
            firstNonEmptyText(
              credentials.chatgpt_account_id,
              credentials.chatgptAccountId,
              extra.chatgpt_account_id,
              extra.chatgptAccountId,
              account?.chatgpt_account_id,
              account?.chatgptAccountId,
            ),
          );
          const email = normalizeIdentityText(
            firstNonEmptyText(
              account?.email,
              credentials.email,
              extra.email,
            ),
          );
          const name = normalizeIdentityText(account?.name);

          return { chatgptAccountId, email, name };
        }

        function isCompatibleExistingSub2ApiAccount(existing, imported) {
          const existingType = normalizeIdentityText(existing?.type);
          const existingPlatform = normalizeIdentityText(existing?.platform);
          const importedType = normalizeIdentityText(imported?.type);
          const importedPlatform = normalizeIdentityText(imported?.platform);

          if (existingType && importedType && existingType !== importedType) {
            return false;
          }
          if (existingPlatform && importedPlatform && existingPlatform !== importedPlatform) {
            return false;
          }
          return true;
        }

        function addExistingAccountToIndex(map, key, account) {
          if (!key || map.has(key)) {
            return;
          }
          const id = getSub2ApiRecordId(account);
          if (!id) {
            return;
          }
          map.set(key, account);
        }

        function buildExistingAccountIndex(accounts) {
          const byChatgptAccountId = new Map();
          const byEmail = new Map();
          const byName = new Map();

          accounts.forEach((account) => {
            const identity = getAccountIdentity(account);
            addExistingAccountToIndex(byChatgptAccountId, identity.chatgptAccountId, account);
            addExistingAccountToIndex(byEmail, identity.email, account);
            addExistingAccountToIndex(byName, identity.name, account);
          });

          return { byChatgptAccountId, byEmail, byName };
        }

        function findExistingAccountForImport(account, index) {
          const identity = getAccountIdentity(account);
          const candidates = [
            identity.chatgptAccountId ? index.byChatgptAccountId.get(identity.chatgptAccountId) : undefined,
            identity.email ? index.byEmail.get(identity.email) : undefined,
            !identity.chatgptAccountId && !identity.email && identity.name ? index.byName.get(identity.name) : undefined,
          ].filter(Boolean);

          return candidates.find((candidate) => isCompatibleExistingSub2ApiAccount(candidate, account));
        }

        function getImportIdentityKey(account) {
          const identity = getAccountIdentity(account);
          if (identity.chatgptAccountId) {
            return `chatgpt:${identity.chatgptAccountId}`;
          }
          if (identity.email) {
            return `email:${identity.email}`;
          }
          return "";
        }

        function buildAccountUpdatePayload(account) {
          const payload = {
            name: account.name,
            type: account.type,
            concurrency: account.concurrency,
            priority: account.priority,
            rate_multiplier: account.rate_multiplier,
            expires_at: account.expires_at,
            auto_pause_on_expired: account.auto_pause_on_expired,
            confirm_mixed_channel_risk: true,
          };

          if (Object.prototype.hasOwnProperty.call(account, "group_ids")) {
            payload.group_ids = account.group_ids;
          }
          if (Object.prototype.hasOwnProperty.call(account, "proxy_id")) {
            payload.proxy_id = account.proxy_id;
          }

          return stripUnavailable(payload) || {};
        }

        function buildApplyOAuthCredentialsPayload(account) {
          return {
            type: account.type || "oauth",
            credentials: account.credentials || {},
            extra: account.extra || {},
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
          elements.outputImportActions.hidden = !isVisible;
          elements.importSub2api.hidden = !isVisible;
        }

        function updateImportButtonState() {
          updateSub2ApiToolsVisibility();
          const canImport = state.converted.length > 0 && isSub2ApiFormat();
          elements.importSub2api.disabled = !canImport;
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

        function getFormattedInputText(text) {
          return parseInputJsonValues(text)
            .map((value) => JSON.stringify(value, null, 2))
            .join("\n\n");
        }

        function formatInputJson(options = {}) {
          const text = elements.input.value;
          if (!text.trim()) {
            if (!options.silent) {
              setStatus(elements.inputStatus, "没有可格式化的 JSON。", "error");
            }
            return false;
          }

          try {
            const formatted = getFormattedInputText(text);
            if (formatted && formatted !== text) {
              elements.input.value = formatted;
            }
            scheduleConvert();
            if (!options.silent) {
              setStatus(elements.inputStatus, "已开启格式化换行；多段 JSON 会按账号分段显示。", "ok");
            }
            return true;
          } catch (error) {
            if (!options.silent) {
              setStatus(elements.inputStatus, error instanceof Error ? `格式化失败：${error.message}` : "格式化失败：不是有效 JSON。", "error");
            }
            return false;
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
            const rawId = item.id ?? item.value ?? item.key ?? item.name;
            const normalizedId = normalizeBindingId(rawId);
            if (normalizedId === "") {
              return null;
            }
            return {
              value: normalizedId,
              label: String(firstNonEmpty(item.name, item.label, item.title) ?? rawId),
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

        function toRuntimeMetaOptions(items) {
          return normalizeMetaItems(items).map((item) => ({
            id: item.value,
            name: item.label,
          }));
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

        function normalizeSelectionList(values) {
          return (Array.isArray(values) ? values : [])
            .map(normalizeBindingId)
            .filter((value) => value !== "");
        }

        function normalizeSelectionLookupKey(value, labelPrefix = "") {
          let key = String(value ?? "").trim().toLowerCase();
          const prefix = String(labelPrefix || "").trim().toLowerCase();
          if (prefix && key.startsWith(`${prefix} `)) {
            key = key.slice(prefix.length).trim();
          }
          return key.replace(/\s+/g, " ");
        }

        function reconcileSelectionsToKnownIds(values, knownItems, labelPrefix = "") {
          const knownByValue = new Map();
          const knownByLabel = new Map();
          knownItems.forEach((item) => {
            const normalizedValue = normalizeBindingId(item.value);
            knownByValue.set(String(normalizedValue), normalizedValue);
            knownByLabel.set(normalizeSelectionLookupKey(item.label, labelPrefix), normalizedValue);
          });

          const seen = new Set();
          return normalizeSelectionList(values)
            .map((value) => {
              const valueKey = String(value);
              return knownByValue.has(valueKey)
                ? knownByValue.get(valueKey)
                : knownByLabel.get(normalizeSelectionLookupKey(value, labelPrefix)) ?? value;
            })
            .filter((value) => {
              const key = String(value);
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            });
        }

        function setSelectedGroups(nextGroups, options = {}) {
          const seen = new Set();
          state.selectedGroups = normalizeSelectionList(nextGroups)
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
          state.selectedProxies = normalizeSelectionList(nextProxies)
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

          elements.groupSummary.innerHTML = [
            `<span class="group-chip">已选 ${state.selectedGroups.length} 个</span>`,
            '<span class="group-chip is-muted">下方列表已勾选，可继续修改</span>',
          ].filter(Boolean).join("");
        }

        function renderProxySummary() {
          if (!state.selectedProxies.length) {
            elements.proxySummary.innerHTML = '<span class="group-chip is-muted">未选择代理</span>';
            return;
          }

          elements.proxySummary.innerHTML = [
            `<span class="group-chip">已选 ${state.selectedProxies.length} 个</span>`,
            '<span class="group-chip is-muted">下方列表已勾选，可继续修改</span>',
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
          if (Array.isArray(payload.group_options) || Array.isArray(payload.groupOptions)) {
            setNativeGroupOptions(payload.group_options || payload.groupOptions, "未缓存分组数据");
          }
          if (Array.isArray(payload.proxy_options) || Array.isArray(payload.proxyOptions)) {
            setNativeProxyOptions(payload.proxy_options || payload.proxyOptions, "未缓存代理数据");
          }
          hydrateServerAccountCache(payload);
          if (Array.isArray(payload.group_ids)) {
            state.selectedGroups = normalizeSelectionList(payload.group_ids);
          }
          if (Array.isArray(payload.proxy_ids)) {
            state.selectedProxies = normalizeSelectionList(payload.proxy_ids);
          } else if (Object.prototype.hasOwnProperty.call(payload, "proxy_id")) {
            const value = payload.proxy_id;
            state.selectedProxies = normalizeSelectionList(value === null || value === undefined || value === "" ? [] : [value]);
          }
          if (Number.isFinite(Number(payload.priority))) {
            state.priority = Number(payload.priority);
            elements.priority.value = String(state.priority);
          }
          if (Number.isFinite(Number(payload.concurrency))) {
            state.concurrency = Math.max(0, parseInt(String(payload.concurrency), 10));
            elements.concurrency.value = String(state.concurrency);
          }
          const configuredExpiresAt = Number(payload.expires_at ?? payload.expiresAt);
          if (Number.isFinite(configuredExpiresAt) && configuredExpiresAt > 0) {
            state.expiresAtOverride = Math.floor(configuredExpiresAt);
            elements.expiresAt.value = dateInputFromUnixSeconds(state.expiresAtOverride);
          } else {
            state.expiresAtOverride = null;
            elements.expiresAt.value = "";
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
          state.setPrivacy = payload.set_privacy === true || payload.setPrivacy === true;
          elements.setPrivacy.checked = state.setPrivacy;
          const tokenPreview = firstNonEmpty(payload.sub2api_bearer_token_preview, payload.sub2apiBearerTokenPreview);
          if (tokenPreview) {
            elements.sub2apiToken.placeholder = `已保存：${tokenPreview}（留空不覆盖）`;
          } else if (payload.sub2api_has_bearer_token || payload.sub2api_server_auth_configured) {
            elements.sub2apiToken.placeholder = "服务器已保存认证；留空保存不会覆盖";
          }
          state.selectedGroups = reconcileSelectionsToKnownIds(state.selectedGroups, getKnownGroupItems(), "分组");
          state.selectedProxies = reconcileSelectionsToKnownIds(state.selectedProxies, getKnownProxyItems(), "代理");
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
            elements.logoutButton.hidden = false;
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
                concurrency: state.concurrency,
                expires_at: state.expiresAtOverride,
                rate_multiplier: state.rateMultiplier,
                websocket_mode: state.websocketMode,
                auto_passthrough: state.autoPassthrough,
                set_privacy: state.setPrivacy,
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

        async function saveSub2ApiMetaCache() {
          if (!canLoadServerDefaults()) {
            return false;
          }
          const response = await fetch("/token-manager/auth/config", {
            method: "POST",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              group_options: toRuntimeMetaOptions(state.availableGroups),
              proxy_options: toRuntimeMetaOptions(state.availableProxies),
            }),
          });
          const payload = await readJsonResponse(response);
          if (!response.ok) {
            throw new Error(getErrorMessageFromResponseBody(payload, `HTTP ${response.status}`));
          }
          return true;
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

        async function logoutTokenManager() {
          elements.logoutButton.disabled = true;
          try {
            await fetch("/token-manager/auth/logout", {
              method: "POST",
              cache: "no-store",
              credentials: "same-origin",
              headers: { Accept: "application/json" },
            });
          } finally {
            if (typeof window.location?.replace === "function") {
              window.location.replace("/token-manager/");
            } else if (window.location) {
              window.location.href = "/token-manager/";
            }
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

        function getServerAccountRecord(account) {
          if (!isPlainObject(account)) {
            return {};
          }

          const nested = isPlainObject(account.account) ? account.account : {};
          const merged = { ...nested };
          Object.entries(account).forEach(([key, value]) => {
            if (key === "account" || value === undefined || value === null || value === "") {
              return;
            }
            if (Array.isArray(value) && !value.length && Array.isArray(merged[key]) && merged[key].length) {
              return;
            }
            merged[key] = value;
          });
          return merged;
        }

        function uniqueTextItems(items) {
          const seen = new Set();
          return items
            .map((item) => String(item ?? "").trim())
            .filter(Boolean)
            .filter((item) => {
              const key = item.toLowerCase();
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            });
        }

        function splitTextLabels(value) {
          return String(value || "")
            .split(/[、,]/)
            .map((item) => item.trim())
            .filter(Boolean);
        }

        function getGroupLabel(group) {
          if (!isPlainObject(group)) {
            return firstNonEmptyText(group);
          }

          const nestedGroup = isPlainObject(group.group) ? group.group : {};
          const label = firstNonEmptyText(
            nestedGroup.name,
            nestedGroup.label,
            nestedGroup.title,
            group.name,
            group.label,
            group.title,
            group.group_name,
            group.groupName,
          );
          if (label) {
            return label;
          }

          const id = firstNonEmptyText(group.group_id, group.groupId, nestedGroup.id, group.id);
          return id ? `#${id}` : "";
        }

        function groupLabelsFromValue(value) {
          if (typeof value === "string" && value.trim()) {
            return splitTextLabels(value);
          }
          if (Array.isArray(value)) {
            return value.map(getGroupLabel).filter(Boolean);
          }
          if (isPlainObject(value)) {
            return [getGroupLabel(value)].filter(Boolean);
          }
          return [];
        }

        function groupIdLabelsFromValue(value) {
          const items = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
          return items.map((item) => {
            const id = firstNonEmptyText(item);
            return id ? `#${id}` : "";
          }).filter(Boolean);
        }

        function getServerAccountId(account) {
          const record = getServerAccountRecord(account);
          return firstNonEmptyText(record.id, record.account_id, record.accountId, record.uuid);
        }

        function getGroupLabels(account) {
          const record = getServerAccountRecord(account);
          const namedLabels = uniqueTextItems([
            ...groupLabelsFromValue(record.groups),
            ...groupLabelsFromValue(record.account_groups),
            ...groupLabelsFromValue(record.accountGroups),
            ...groupLabelsFromValue(record.group_names),
            ...groupLabelsFromValue(record.groupNames),
          ]);
          if (namedLabels.length) {
            return namedLabels;
          }

          return uniqueTextItems([
            ...groupIdLabelsFromValue(record.group_ids),
            ...groupIdLabelsFromValue(record.groupIds),
          ]);
        }

        function getProxyLabel(account) {
          const record = getServerAccountRecord(account);
          if (typeof record.proxy === "string" && record.proxy.trim() && record.proxy.trim() !== "[object Object]") {
            return record.proxy.trim();
          }
          const proxy = isPlainObject(record.proxy) ? record.proxy : {};
          const proxyId = firstNonEmptyText(record.proxy_id, record.proxyId, proxy.id);
          const proxyName = firstNonEmptyText(record.proxy_name, record.proxyName, proxy.name, proxy.label, proxy.title);
          if (proxyName && proxyId) {
            return `${proxyName} (#${proxyId})`;
          }
          return proxyName || (proxyId ? `#${proxyId}` : "未设置");
        }

        function isOAuthServerAccount(recordOrDisplay) {
          const type = firstNonEmptyText(recordOrDisplay?.type, recordOrDisplay?.account_type, recordOrDisplay?.accountType);
          return type.toLowerCase() === "oauth";
        }

        function normalizePlanType(value) {
          const raw = firstNonEmptyText(value);
          if (!raw) {
            return "";
          }
          return raw.toLowerCase().replace(/[\s_]+/g, "-");
        }

        function getPlanTypeMeta(value, recordOrDisplay = {}) {
          if (!isOAuthServerAccount(recordOrDisplay)) {
            return { visible: false, state: "none", label: "", title: "" };
          }

          const raw = firstNonEmptyText(value) || "unknown";
          const normalized = normalizePlanType(raw);
          const known = {
            free: { state: "free", label: "FREE" },
            plus: { state: "plus", label: "PLUS" },
            team: { state: "team", label: "TEAM" },
            "pro-lite": { state: "pro-lite", label: "PRO LITE" },
            chatgptpro: { state: "pro", label: "PRO" },
            "chatgpt-pro": { state: "pro", label: "PRO" },
            pro: { state: "pro", label: "PRO" },
            abnormal: { state: "abnormal", label: "异常" },
          };
          const meta = known[normalized] || { state: "unknown", label: raw.toUpperCase() };
          return {
            visible: true,
            state: meta.state,
            label: meta.label,
            title: normalized && normalized !== "unknown"
              ? `OpenAI OAuth 套餐：${raw}`
              : "OpenAI OAuth 套餐未识别或未返回",
          };
        }

        function getPrivacyMeta(value, recordOrDisplay = {}) {
          const isOAuth = isOAuthServerAccount(recordOrDisplay);
          if (!isOAuth) {
            return {
              label: "privacy: 不适用",
              actionLabel: "Privacy 不适用",
              actionDisabled: true,
              state: "neutral",
              title: "sub2api 仅支持 OAuth 账号设置 Privacy；apikey 账号没有可关闭的 privacy_mode。",
              applicable: false,
              isOff: true,
            };
          }

          const raw = firstNonEmptyText(value) || "-";
          const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
          const isOff = normalized.includes("off")
            || normalized.includes("disabled")
            || normalized === "false"
            || normalized === "0";
          return {
            label: `privacy: ${raw}`,
            actionLabel: isOff ? "Privacy 已关" : "关闭 Privacy",
            actionDisabled: isOff,
            state: isOff ? "safe" : "danger",
            title: isOff ? "训练数据共享已关闭" : "点击调用 sub2api set-privacy，尝试关闭训练数据共享",
            applicable: true,
            isOff,
          };
        }

        function booleanFromValue(value) {
          if (typeof value === "boolean") {
            return value;
          }
          if (typeof value === "number" && Number.isFinite(value)) {
            return value !== 0;
          }
          if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (["true", "1", "yes", "on"].includes(normalized)) {
              return true;
            }
            if (["false", "0", "no", "off"].includes(normalized)) {
              return false;
            }
          }
          return undefined;
        }

        function getAccountStatusMeta(status) {
          const raw = firstNonEmptyText(status) || "unknown";
          const normalized = raw.toLowerCase();
          if (["active", "enabled", "enable"].includes(normalized)) {
            return { raw, label: "已启用", state: "active", isActive: true, isDisabled: false, isError: false };
          }
          if (["inactive", "disabled", "disable", "paused"].includes(normalized)) {
            return { raw, label: "账号已禁用", state: "inactive", isActive: false, isDisabled: true, isError: false };
          }
          if (normalized === "error") {
            return { raw, label: "错误", state: "error", isActive: false, isDisabled: false, isError: true };
          }
          return { raw, label: raw, state: "unknown", isActive: false, isDisabled: false, isError: false };
        }

        function hasFutureDisplayTimestamp(value) {
          const normalized = normalizeDisplayTimestamp(value);
          if (!normalized) {
            return false;
          }
          const time = new Date(normalized).getTime();
          return Number.isFinite(time) && time > Date.now();
        }

        function getScheduleMeta(record, statusMeta) {
          const schedulableValue = record.schedulable ?? record.schedulableValue;
          const schedulable = booleanFromValue(schedulableValue);
          const reason = firstNonEmptyText(record.temp_unschedulable_reason, record.tempUnschedulableReason, record.error_message, record.errorMessage);
          const hasRateLimit = hasFutureDisplayTimestamp(record.rate_limit_reset_at ?? record.rateLimitResetAt)
            || hasFutureDisplayTimestamp(record.rate_limited_at ?? record.rateLimitedAt);
          const hasOverload = hasFutureDisplayTimestamp(record.overload_until ?? record.overloadUntil);
          const hasTemporaryBlock = hasFutureDisplayTimestamp(record.temp_unschedulable_until ?? record.tempUnschedulableUntil);

          if (statusMeta.isError) {
            return {
              label: "错误",
              chipLabel: reason ? `错误：${reason}` : "错误",
              state: "danger",
              action: "enable",
              actionLabel: "启用账号",
              actionState: "off",
              title: reason || "将账号状态设为 active，并启动调度；不刷新或修复账号凭证。",
              rawSchedulable: schedulable,
            };
          }

          if (statusMeta.isDisabled) {
            return {
              label: "账号已禁用",
              chipLabel: "账号已禁用",
              state: "neutral",
              action: "enable",
              actionLabel: "启用账号",
              actionState: "off",
              title: "将账号状态设为 active，并启动调度。",
              rawSchedulable: schedulable,
            };
          }

          if (schedulable === false) {
            const label = hasRateLimit
              ? "限流中"
              : hasOverload
                ? "过载等待"
                : hasTemporaryBlock
                  ? "临时不可调度"
                  : "调度已关闭";
            return {
              label,
              chipLabel: reason ? `${label}：${reason}` : label,
              state: hasRateLimit || hasOverload || hasTemporaryBlock ? "warning" : "danger",
              action: "enable",
              actionLabel: "启动调度",
              actionState: "off",
              title: reason || "schedulable=false，账号当前不参与调度。",
              rawSchedulable: schedulable,
            };
          }

          if (statusMeta.isActive && schedulable === true) {
            return {
              label: "调度中",
              chipLabel: "调度中",
              state: "safe",
              action: "disable",
              actionLabel: "关闭调度",
              actionState: "on",
              title: "账号状态 active 且 schedulable=true，当前参与调度。",
              rawSchedulable: schedulable,
            };
          }

          if (statusMeta.isActive) {
            return {
              label: "已启用",
              chipLabel: "调度状态未知",
              state: "neutral",
              action: "disable",
              actionLabel: "关闭调度",
              actionState: "on",
              title: "账号 active，但返回数据没有明确 schedulable 字段。",
              rawSchedulable: schedulable,
            };
          }

          return {
            label: statusMeta.label,
            chipLabel: statusMeta.label,
            state: "neutral",
            action: "enable",
            actionLabel: "启用账号",
            actionState: "off",
            title: "账号未处于可调度状态。",
            rawSchedulable: schedulable,
          };
        }

        function getScheduleToggleMeta(display) {
          if (!display.statusMeta?.isActive) {
            return null;
          }
          const schedule = display.schedule || {};
          const isOn = schedule.action !== "enable";
          return {
            action: isOn ? "stop-schedule" : "start-schedule",
            label: "调度",
            state: isOn ? "on" : "off",
            tone: isOn ? "switch-on" : "switch-off",
            title: isOn ? "当前参与调度；点击关闭调度。" : "当前不参与调度；点击启动调度。",
          };
        }

        function getAccountToggleMeta(display) {
          const statusMeta = display.statusMeta || {};
          if (statusMeta.isActive) {
            return {
              action: "disable-account",
              label: "启用",
              state: "on",
              tone: "switch-on",
              title: "当前账号已启用；点击后禁用账号并关闭调度。",
            };
          }
          return {
            action: "enable-account",
            label: "启用",
            state: "off",
            tone: statusMeta.isError ? "switch-error" : "switch-off",
            title: statusMeta.isError
              ? "当前账号为错误状态；点击后设为 active 并启动调度，不刷新或修复账号凭证。"
              : "当前账号未启用；点击后设为 active 并启动调度。",
          };
        }

        function getConcurrencyMeta(value) {
          const text = firstNonEmptyText(value);
          const match = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
          if (!match) {
            return { state: "neutral", label: text || "-" };
          }
          const current = Number(match[1]);
          const limit = Number(match[2]);
          if (!Number.isFinite(current) || !Number.isFinite(limit) || limit <= 0) {
            return { state: "neutral", label: text || "-" };
          }
          const ratio = current / limit;
          return {
            state: ratio >= 1 ? "danger" : ratio >= 0.75 ? "warning" : "safe",
            label: text,
          };
        }

        function getExpiryMeta(value) {
          const normalized = normalizeDisplayTimestamp(value);
          if (!normalized) {
            return { state: "neutral", label: "-", title: "未设置过期时间" };
          }

          const time = new Date(normalized).getTime();
          if (Number.isNaN(time)) {
            return { state: "neutral", label: formatDisplayDate(value) || "-", title: "无法解析过期时间" };
          }

          const remainingMs = time - Date.now();
          const soonMs = 3 * 24 * 60 * 60 * 1000;
          return {
            state: remainingMs < 0 ? "danger" : remainingMs <= soonMs ? "warning" : "safe",
            label: formatDisplayDate(normalized) || "-",
            title: normalized,
          };
        }

        function renderGroupCards(labels) {
          const items = Array.isArray(labels) && labels.length ? labels : ["未绑定"];
          const className = labels.length ? "server-group-card" : "server-group-card is-empty";
          return items.map((label) => `<span class="${className}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`).join("");
        }

        function getServerAccountDisplay(account) {
          const record = getServerAccountRecord(account);
          const credentials = isPlainObject(record.credentials) ? record.credentials : {};
          const extra = isPlainObject(record.extra) ? record.extra : {};
          const id = getServerAccountId(record);
          const email = firstNonEmptyText(record.email, credentials.email, extra.email);
          const name = firstNonEmptyText(record.name, record.display_name, record.displayName, email, credentials.chatgpt_account_id, id);
          const expiresAt = firstDisplayTimestamp(
            record.expires_at,
            record.expiresAt,
            credentials.expires_at,
            credentials.expiresAt,
            credentials.exp,
          );
          const updatedAt = firstDisplayTimestamp(record.updated_at, record.updatedAt);
          const createdAt = firstDisplayTimestamp(record.created_at, record.createdAt);
          const lastUsedAt = firstDisplayTimestamp(record.last_used_at, record.lastUsedAt);
          const status = firstNonEmptyText(
            record.status,
            record.state,
            record.disabled === true ? "disabled" : record.disabled === false ? "active" : "",
          );
          const statusMeta = getAccountStatusMeta(status);
          const scheduleMeta = getScheduleMeta(record, statusMeta);
          const platform = firstNonEmptyText(record.platform, extra.platform);
          const type = firstNonEmptyText(record.type, record.account_type, record.accountType);
          const entitlement = isPlainObject(record.entitlement) ? record.entitlement : {};
          const planType = firstNonEmptyText(
            credentials.plan_type,
            credentials.planType,
            credentials.chatgpt_plan_type,
            credentials.chatgptPlanType,
            credentials.subscription_plan,
            credentials.subscriptionPlan,
            extra.plan_type,
            extra.planType,
            extra.chatgpt_plan_type,
            extra.chatgptPlanType,
            extra.subscription_plan,
            extra.subscriptionPlan,
            record.plan_type,
            record.planType,
            record.chatgpt_plan_type,
            record.chatgptPlanType,
            record.subscription_plan,
            record.subscriptionPlan,
            entitlement.subscription_plan,
            entitlement.subscriptionPlan,
          );
          const privacyMode = firstNonEmptyText(
            extra.privacy_mode,
            extra.privacyMode,
            record.privacy_mode,
            record.privacyMode,
            record.privacy,
          );
          const groupLabels = getGroupLabels(record);
          const groupText = groupLabels.length ? groupLabels.join("、") : "未绑定";
          const proxyText = getProxyLabel(record);
          const maxConcurrency = firstNonEmptyText(record.concurrency);
          const currentConcurrency = firstNonEmptyText(record.current_concurrency, record.currentConcurrency);
          const concurrency = currentConcurrency && maxConcurrency ? `${currentConcurrency} / ${maxConcurrency}` : (maxConcurrency || currentConcurrency);
          const priority = firstNonEmptyText(record.priority);
          const rateMultiplier = firstNonEmptyText(record.rate_multiplier, record.rateMultiplier);
          const schedulable = scheduleMeta.chipLabel || "";

          return {
            id,
            name,
            email,
            expiresAt,
            updatedAt,
            createdAt,
            lastUsedAt,
            status,
            statusMeta,
            schedule: scheduleMeta,
            platform,
            type,
            planType,
            privacyMode,
            groupLabels,
            groupText,
            proxyText,
            concurrency,
            priority,
            rateMultiplier,
            schedulable,
          };
        }

        function getFilteredServerAccounts() {
          const keyword = String(state.serverAccountSearch || "").trim().toLowerCase();
          if (!keyword) {
            return state.serverAccounts;
          }
          return state.serverAccounts.filter((account) => {
            const display = getServerAccountDisplay(account);
            const haystack = [
              display.id,
              display.name,
              display.email,
              display.platform,
              display.type,
              display.status,
              display.privacyMode,
              display.planType,
              display.groupText,
              display.proxyText,
              display.schedulable,
            ].join(" ").toLowerCase();
            return haystack.includes(keyword);
          });
        }

        function setSelectedServerAccounts(ids) {
          const available = new Set(state.serverAccounts.map((account) => getServerAccountId(account)).filter(Boolean));
          const seen = new Set();
          state.selectedServerAccountIds = (Array.isArray(ids) ? ids : [])
            .map((id) => String(id ?? "").trim())
            .filter((id) => id && available.has(id))
            .filter((id) => {
              if (seen.has(id)) {
                return false;
              }
              seen.add(id);
              return true;
            });
          renderServerAccounts();
        }

        function renderServerAccountSelectionSummary(filteredAccounts = getFilteredServerAccounts()) {
          const selectedCount = state.selectedServerAccountIds.length;
          const visibleCount = filteredAccounts.length;
          elements.serverAccountSelectionSummary.textContent = selectedCount
            ? `已选择 ${selectedCount} 个账号；当前筛选显示 ${visibleCount} / ${state.serverAccounts.length} 个。`
            : `未选择账号；当前显示 ${visibleCount} / ${state.serverAccounts.length} 个。`;
          const visibleIds = filteredAccounts.map((account) => getServerAccountId(account)).filter(Boolean);
          const selectedSet = new Set(state.selectedServerAccountIds);
          const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
          elements.toggleVisibleServerAccountSelection.textContent = allVisibleSelected ? "清空选择" : "全选可见";
          elements.toggleVisibleServerAccountSelection.dataset.selectionMode = allVisibleSelected ? "clear" : "select";
          elements.toggleVisibleServerAccountSelection.disabled = visibleIds.length === 0 && selectedCount === 0;
          [
            elements.applySelectedServerAccountSettings,
            elements.enableSelectedServerAccounts,
            elements.disableSelectedServerAccounts,
            elements.startSelectedServerAccountSchedule,
            elements.stopSelectedServerAccountSchedule,
            elements.privacySelectedServerAccounts,
            elements.deleteSelectedServerAccounts,
          ].forEach((button) => {
            button.disabled = selectedCount === 0;
          });
        }

        function renderServerAccounts() {
          const availableIds = new Set(state.serverAccounts.map((account) => getServerAccountId(account)).filter(Boolean));
          state.selectedServerAccountIds = state.selectedServerAccountIds.filter((id) => availableIds.has(id));
          const filteredAccounts = getFilteredServerAccounts();
          const selectedSet = new Set(state.selectedServerAccountIds);

          renderServerAccountSelectionSummary(filteredAccounts);

          if (!state.serverAccounts.length) {
            elements.serverAccountBody.innerHTML = '<div class="server-account-empty">暂无服务器账号数据。</div>';
            return;
          }

          if (!filteredAccounts.length) {
            elements.serverAccountBody.innerHTML = '<div class="server-account-empty">没有匹配的服务器账号。</div>';
            return;
          }

          elements.serverAccountBody.innerHTML = filteredAccounts.map((account) => {
            const display = getServerAccountDisplay(account);
            const id = display.id;
            const selected = selectedSet.has(id);
            const statusClass = `status-badge schedule-badge schedule-${display.schedule?.state || "neutral"}`;
            const privacyMeta = getPrivacyMeta(display.privacyMode, display);
            const planMeta = getPlanTypeMeta(display.planType, display);
            const concurrencyMeta = getConcurrencyMeta(display.concurrency);
            const expiryMeta = getExpiryMeta(display.expiresAt);
            const scheduleToggleMeta = getScheduleToggleMeta(display);
            const accountToggleMeta = getAccountToggleMeta(display);
            return `
              <article class="server-account-card-row ${selected ? "is-selected" : ""}" role="listitem">
                <label class="server-card-check" aria-label="选择 ${escapeHtml(display.name || id || "账号")}">
                  <input type="checkbox" data-server-account-id="${escapeHtml(id)}" ${selected ? "checked" : ""} />
                </label>
                <div class="server-card-content">
                  <div class="server-card-headline">
                    <div class="server-card-identity">
                      <div class="server-account-title-row">
                        <div class="cell-clip strong-cell server-account-name" title="${escapeHtml(display.name)}">${escapeHtml(display.name || "-")}</div>
                        <span class="${escapeHtml(statusClass)}" title="${escapeHtml(display.schedule?.title || display.status || "")}">${escapeHtml(display.schedule?.label || display.statusMeta?.label || "-")}</span>
                      </div>
                      <div class="cell-clip server-account-email" title="${escapeHtml(display.email)}">${escapeHtml(display.email || "-")}</div>
                      <div class="server-chip-row">
                        <span class="server-chip">ID ${escapeHtml(id || "-")}</span>
                        <span class="server-chip">${escapeHtml(display.platform || "-")}</span>
                        <span class="server-chip">${escapeHtml(display.type || "-")}</span>
                        ${planMeta.visible ? `<span class="server-chip plan-chip plan-${escapeHtml(planMeta.state)}" title="${escapeHtml(planMeta.title)}">${escapeHtml(planMeta.label)}</span>` : ""}
                        <span class="server-chip account-status-chip account-status-${escapeHtml(display.statusMeta?.state || "unknown")}" title="sub2api status: ${escapeHtml(display.status || "-")}">账号：${escapeHtml(display.statusMeta?.label || display.status || "-")}</span>
                        <span class="server-chip privacy-chip privacy-${escapeHtml(privacyMeta.state)}" title="${escapeHtml(privacyMeta.title)}">${escapeHtml(privacyMeta.label)}</span>
                      </div>
                    </div>
                    <div class="server-card-actions" aria-label="账号操作">
                      <button
                        class="tiny-button server-switch action-toggle action-toggle-${escapeHtml(accountToggleMeta.tone || "neutral")}"
                        type="button"
                        data-server-action="${escapeHtml(accountToggleMeta.action)}"
                        data-server-account-id="${escapeHtml(id)}"
                        aria-pressed="${accountToggleMeta.state === "on" ? "true" : "false"}"
                        title="${escapeHtml(accountToggleMeta.title)}"
                      >
                        <span class="server-switch-label">${escapeHtml(accountToggleMeta.label)}</span>
                        <span class="server-switch-track" aria-hidden="true"><span class="server-switch-thumb"></span></span>
                      </button>
                      ${scheduleToggleMeta ? `<button
                        class="tiny-button server-switch action-toggle action-toggle-${escapeHtml(scheduleToggleMeta.tone || "neutral")}"
                        type="button"
                        data-server-action="${escapeHtml(scheduleToggleMeta.action)}"
                        data-server-account-id="${escapeHtml(id)}"
                        aria-pressed="${scheduleToggleMeta.state === "on" ? "true" : "false"}"
                        title="${escapeHtml(scheduleToggleMeta.title)}"
                      >
                        <span class="server-switch-label">${escapeHtml(scheduleToggleMeta.label)}</span>
                        <span class="server-switch-track" aria-hidden="true"><span class="server-switch-thumb"></span></span>
                      </button>` : ""}
                      <button class="tiny-button server-action-primary" type="button" data-server-action="apply-settings" data-server-account-id="${escapeHtml(id)}">应用参数</button>
                      <button
                        class="tiny-button server-action-toggle privacy-toggle privacy-toggle-${escapeHtml(privacyMeta.state)}"
                        type="button"
                        ${privacyMeta.actionDisabled ? "disabled" : `data-server-action="set-privacy" data-server-account-id="${escapeHtml(id)}"`}
                        aria-pressed="${privacyMeta.actionDisabled ? "true" : "false"}"
                        title="${escapeHtml(privacyMeta.title)}"
                      >${escapeHtml(privacyMeta.actionLabel)}</button>
                      <button
                        class="tiny-button server-action-danger server-action-delete"
                        type="button"
                        data-server-action="delete-account"
                        data-server-account-id="${escapeHtml(id)}"
                        title="删除账号"
                        aria-label="删除 ${escapeHtml(display.name || id || "账号")}"
                      ><span class="trash-icon" aria-hidden="true">🗑</span><span>删除</span></button>
                    </div>
                  </div>

                  <div class="server-card-details">
                    <section class="server-info-panel server-binding-panel" aria-label="绑定">
                      <div class="server-panel-title">绑定</div>
                      <div class="server-kv server-kv-groups">
                        <span>分组</span>
                        <div class="server-group-card-list" title="${escapeHtml(display.groupText)}">${renderGroupCards(display.groupLabels || [])}</div>
                      </div>
                      <div class="server-kv">
                        <span>代理</span>
                        <strong title="${escapeHtml(display.proxyText)}">${escapeHtml(display.proxyText)}</strong>
                      </div>
                    </section>

                    <section class="server-info-panel" aria-label="运行">
                      <div class="server-panel-title">运行</div>
                      <div class="server-inline-metrics">
                        <div class="server-metric metric-${escapeHtml(concurrencyMeta.state)}"><span>并发</span><strong>${escapeHtml(concurrencyMeta.label || "-")}</strong></div>
                        <div class="server-metric"><span>优先级</span><strong>${escapeHtml(display.priority || "-")}</strong></div>
                        <div class="server-metric"><span>倍率</span><strong>${escapeHtml(display.rateMultiplier || "-")}</strong></div>
                      </div>
                    </section>

                    <section class="server-info-panel server-time-panel" aria-label="时间">
                      <div class="server-panel-title">时间</div>
                      <div class="server-time-grid">
                        <div class="server-date-item date-${escapeHtml(expiryMeta.state)}"><span>过期</span><strong title="${escapeHtml(expiryMeta.title || display.expiresAt)}">${escapeHtml(expiryMeta.label || "-")}</strong></div>
                        <div class="server-date-item"><span>创建</span><strong title="${escapeHtml(display.createdAt)}">${escapeHtml(formatDisplayDate(display.createdAt) || "-")}</strong></div>
                        <div class="server-date-item"><span>更新</span><strong title="${escapeHtml(display.updatedAt)}">${escapeHtml(formatDisplayDate(display.updatedAt) || "-")}</strong></div>
                        <div class="server-date-item"><span>使用</span><strong title="${escapeHtml(display.lastUsedAt)}">${escapeHtml(formatDisplayDate(display.lastUsedAt) || "-")}</strong></div>
                      </div>
                    </section>
                  </div>
                </div>
              </article>
            `;
          }).join("");
        }

        function getServerAccountCacheFromPayload(payload) {
          if (!isPlainObject(payload)) {
            return [];
          }
          return Array.isArray(payload.server_account_cache)
            ? payload.server_account_cache
            : Array.isArray(payload.serverAccountCache)
              ? payload.serverAccountCache
              : [];
        }

        function hydrateServerAccountCache(payload) {
          const cachedAccounts = getServerAccountCacheFromPayload(payload);
          if (!cachedAccounts.length) {
            return;
          }
          const total = Number(payload.server_account_total ?? payload.serverAccountTotal ?? cachedAccounts.length);
          state.serverAccounts = cachedAccounts;
          state.serverAccountTotal = Number.isFinite(total) ? total : cachedAccounts.length;
          renderServerAccounts();
          setStatus(
            elements.serverAccountStatus,
            `已加载上次缓存：服务器账号共 ${state.serverAccountTotal} 个，当前显示 ${state.serverAccounts.length} 个；点击“刷新服务器账号”可获取最新数据。`,
            "ok",
          );
        }

        function toRuntimeServerAccountCache(accounts) {
          return accounts.map((account) => {
            const display = getServerAccountDisplay(account);
            const record = getServerAccountRecord(account);
            const optionalFields = {};
            [
              "schedulable",
              "temp_unschedulable_reason",
              "temp_unschedulable_until",
              "rate_limited_at",
              "rate_limit_reset_at",
              "overload_until",
              "error_message",
            ].forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined && record[key] !== null && record[key] !== "") {
                optionalFields[key] = record[key];
              }
            });
            return {
              id: display.id,
              name: display.name || "",
              email: display.email || "",
              platform: display.platform || "",
              type: display.type || "",
              plan_type: display.planType || "",
              status: display.status || "",
              privacy_mode: display.privacyMode || "",
              groups: display.groupText || "",
              proxy: display.proxyText || "",
              concurrency: display.concurrency || "",
              priority: display.priority || "",
              rate_multiplier: display.rateMultiplier || "",
              expires_at: display.expiresAt || "",
              created_at: display.createdAt || "",
              updated_at: display.updatedAt || "",
              last_used_at: display.lastUsedAt || "",
              ...optionalFields,
            };
          }).filter((account) => account.id || account.name || account.email || account.expires_at || account.status);
        }

        async function saveServerAccountCache() {
          if (!canLoadServerDefaults()) {
            return false;
          }
          const response = await fetch("/token-manager/auth/config", {
            method: "POST",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              server_account_cache: toRuntimeServerAccountCache(state.serverAccounts),
              server_account_total: state.serverAccountTotal,
            }),
          });
          const payload = await readJsonResponse(response);
          if (!response.ok) {
            throw new Error(getErrorMessageFromResponseBody(payload, `HTTP ${response.status}`));
          }
          return true;
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
            let cacheSaved = false;
            try {
              cacheSaved = await saveServerAccountCache();
            } catch {
              cacheSaved = false;
            }
            setStatus(
              elements.serverAccountStatus,
              `服务器已保存 ${total} 个账号，当前显示 ${items.length} 个。${cacheSaved ? "列表已缓存，下次打开会先显示缓存。" : "缓存保存失败时仍可手动刷新。"}`,
              "ok",
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "读取服务器账号失败。";
            setStatus(elements.serverAccountStatus, state.serverAccounts.length ? `刷新失败：${message}；仍显示上次缓存。` : message, "error");
          } finally {
            elements.refreshServerAccounts.disabled = false;
            elements.refreshServerAccounts.textContent = originalText;
          }
        }

        async function fetchServerAccountsForUpsert() {
          const pageSize = 200;
          const maxPages = 5;
          const accounts = [];
          let total = 0;

          for (let page = 1; page <= maxPages; page += 1) {
            const url = buildUrlWithQuery(getSub2ApiAdminUrl("/admin/accounts"), {
              page,
              page_size: pageSize,
              sort_by: "created_at",
              sort_order: "desc",
            });
            const payload = await requestSub2ApiJson(url);
            const extracted = extractPaginatedItems(payload);
            accounts.push(...extracted.items);
            total = extracted.total;

            if (!extracted.items.length || extracted.items.length < pageSize || accounts.length >= total) {
              break;
            }
          }

          return { accounts, total };
        }

        function getBatchCreateStats(data) {
          const results = Array.isArray(data?.results) ? data.results : [];
          const successfulResults = results.filter((item) => item?.success !== false);
          const failedResults = results.filter((item) => item?.success === false);
          const created = Number(
            data?.account_created
              ?? data?.created
              ?? data?.success
              ?? (results.length ? successfulResults.length : 0),
          );
          const failed = Number(
            data?.account_failed
              ?? data?.failed
              ?? (results.length ? failedResults.length : 0),
          );

          return {
            created: Number.isFinite(created) ? created : 0,
            failed: Number.isFinite(failed) ? failed : 0,
          };
        }

        function getCreatedAccountIds(data) {
          const results = Array.isArray(data?.results) ? data.results : [];
          return results
            .filter((item) => item?.success !== false)
            .map((item) => getSub2ApiRecordId(item))
            .filter(Boolean);
        }

        async function applyOAuthCredentialsToExistingAccount(accountId, account) {
          await requestSub2ApiJson(getSub2ApiAdminUrl(`/admin/accounts/${encodeURIComponent(accountId)}/apply-oauth-credentials`), {
            method: "POST",
            body: JSON.stringify(buildApplyOAuthCredentialsPayload(account)),
          });
        }

        async function updateExistingSub2ApiAccount(accountId, account) {
          await requestSub2ApiJson(getSub2ApiAdminUrl(`/admin/accounts/${encodeURIComponent(accountId)}`), {
            method: "PUT",
            body: JSON.stringify(buildAccountUpdatePayload(account)),
          });
        }

        async function setSub2ApiAccountPrivacy(accountId) {
          await requestSub2ApiJson(getSub2ApiAdminUrl(`/admin/accounts/${encodeURIComponent(accountId)}/set-privacy`), {
            method: "POST",
          });
        }

        async function setSub2ApiAccountSchedulable(accountId, schedulable) {
          await requestSub2ApiJson(getSub2ApiAdminUrl(`/admin/accounts/${encodeURIComponent(accountId)}/schedulable`), {
            method: "POST",
            body: JSON.stringify({ schedulable: Boolean(schedulable) }),
          });
        }

        async function applyPrivacyToAccounts(accountIds) {
          const stats = { success: 0, failed: 0 };
          if (!state.setPrivacy || !accountIds.length) {
            return stats;
          }

          for (const accountId of accountIds) {
            try {
              await setSub2ApiAccountPrivacy(accountId);
              stats.success += 1;
            } catch {
              stats.failed += 1;
            }
          }

          return stats;
        }

        function getServerAccountById(accountId) {
          const target = String(accountId ?? "").trim();
          return state.serverAccounts.find((account) => getServerAccountId(account) === target);
        }

        function buildServerAccountSettingsPayload() {
          const payload = {
            concurrency: state.concurrency,
            priority: state.priority,
            rate_multiplier: state.rateMultiplier,
            expires_at: state.expiresAtOverride,
            auto_pause_on_expired: true,
            group_ids: state.selectedGroups,
            confirm_mixed_channel_risk: true,
          };
          const proxyId = getRandomSelectedProxyId();
          if (proxyId !== undefined && proxyId !== null && proxyId !== "") {
            payload.proxy_id = proxyId;
          }
          return stripUnavailable(payload) || {};
        }

        async function updateServerAccount(accountId, payload) {
          return requestSub2ApiJson(getSub2ApiAdminUrl(`/admin/accounts/${encodeURIComponent(accountId)}`), {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }

        async function deleteServerAccount(accountId) {
          return requestSub2ApiJson(getSub2ApiAdminUrl(`/admin/accounts/${encodeURIComponent(accountId)}`), {
            method: "DELETE",
          });
        }

        function setServerAccountActionBusy(isBusy) {
          [
            elements.refreshServerAccounts,
            elements.toggleVisibleServerAccountSelection,
            elements.applySelectedServerAccountSettings,
            elements.privacySelectedServerAccounts,
            elements.startSelectedServerAccountSchedule,
            elements.stopSelectedServerAccountSchedule,
            elements.enableSelectedServerAccounts,
            elements.disableSelectedServerAccounts,
            elements.deleteSelectedServerAccounts,
          ].forEach((button) => {
            const elementId = button.id || String(button.selector || "").replace(/^#/, "");
            const isSelectionUtility = elementId === "toggle-visible-server-account-selection";
            button.disabled = isBusy || (button !== elements.refreshServerAccounts && state.selectedServerAccountIds.length === 0 && !isSelectionUtility);
          });
          const rowControls = typeof elements.serverAccountBody.querySelectorAll === "function"
            ? Array.from(elements.serverAccountBody.querySelectorAll("button,input"))
            : [];
          rowControls.forEach((element) => {
            element.disabled = isBusy;
          });
        }

        async function runServerAccountOperation(accountIds, operation) {
          const ids = (Array.isArray(accountIds) ? accountIds : [accountIds])
            .map((id) => String(id ?? "").trim())
            .filter(Boolean);
          if (!ids.length) {
            setStatus(elements.serverAccountStatus, "请先选择账号。", "error");
            return;
          }

          const operationLabels = {
            "apply-settings": "应用当前参数",
            "set-privacy": "关闭 Privacy",
            "start-schedule": "启动调度",
            "stop-schedule": "关闭调度",
            "enable-account": "启用账号",
            "disable-account": "禁用账号",
            "delete-account": "删除账号",
          };
          let label = operationLabels[operation] || "操作";
          if (["start-schedule", "stop-schedule", "enable-account", "disable-account", "delete-account"].includes(operation) && typeof window.confirm === "function") {
            const confirmText = operation === "delete-account"
              ? `${label} ${ids.length} 个账号？此操作不可恢复。`
              : `${label} ${ids.length} 个账号？`;
            const ok = window.confirm(confirmText);
            if (!ok) {
              return;
            }
          }

          setServerAccountActionBusy(true);
          let success = 0;
          let failed = 0;
          let skipped = 0;
          const successfulIds = [];
          setStatus(elements.serverAccountStatus, `正在${label} ${ids.length} 个账号...`, "ok");

          for (const id of ids) {
            try {
              if (operation === "apply-settings") {
                await updateServerAccount(id, buildServerAccountSettingsPayload());
              } else if (operation === "set-privacy") {
                const display = getServerAccountDisplay(getServerAccountById(id));
                const privacyMeta = getPrivacyMeta(display.privacyMode, display);
                if (!privacyMeta.applicable || privacyMeta.isOff) {
                  skipped += 1;
                  continue;
                }
                await setSub2ApiAccountPrivacy(id);
              } else if (operation === "start-schedule") {
                await setSub2ApiAccountSchedulable(id, true);
              } else if (operation === "stop-schedule") {
                await setSub2ApiAccountSchedulable(id, false);
              } else if (operation === "enable-account") {
                await updateServerAccount(id, { status: "active", confirm_mixed_channel_risk: true });
                await setSub2ApiAccountSchedulable(id, true);
              } else if (operation === "disable-account") {
                await setSub2ApiAccountSchedulable(id, false);
                await updateServerAccount(id, { status: "inactive", confirm_mixed_channel_risk: true });
              } else if (operation === "delete-account") {
                await deleteServerAccount(id);
              } else {
                throw new Error("未知操作");
              }
              success += 1;
              successfulIds.push(id);
            } catch {
              failed += 1;
            }
          }

          if (operation === "delete-account" && successfulIds.length > 0) {
            const deletedIds = new Set(successfulIds);
            state.selectedServerAccountIds = state.selectedServerAccountIds.filter((id) => !deletedIds.has(id));
          }
          const skippedText = skipped ? `，跳过 ${skipped}` : "";
          setStatus(elements.serverAccountStatus, `${label}完成：成功 ${success}${skippedText}，失败 ${failed}。正在刷新列表...`, failed ? "error" : "ok");
          try {
            await refreshServerAccounts();
          } finally {
            setServerAccountActionBusy(false);
            renderServerAccounts();
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
            let cacheSaved = false;
            try {
              cacheSaved = await saveSub2ApiMetaCache();
            } catch {
              cacheSaved = false;
            }
            setStatus(
              elements.sub2apiConfigStatus,
              `同步成功：读取 ${getKnownGroupItems().length} 个分组、${getKnownProxyItems().length} 个代理。${cacheSaved ? "列表已缓存，下次打开会自动显示。" : "列表已显示；缓存保存失败时可稍后再同步。"}`,
              "ok",
            );
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

          const sub2apiUrl = getSub2ApiAdminUrl("/admin/accounts/batch");
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
          setStatus(elements.outputStatus, "正在检查 sub2api 已有账号，重复账号会更新而不是新建...", "ok");

          try {
            const importAccounts = buildSub2apiImportAccounts();
            const { accounts: existingAccounts, total } = await fetchServerAccountsForUpsert();
            const existingIndex = buildExistingAccountIndex(existingAccounts);
            const updatesById = new Map();
            const createAccounts = [];
            const createKeyIndex = new Map();
            let inputDuplicates = 0;

            importAccounts.forEach((account) => {
              const existing = findExistingAccountForImport(account, existingIndex);
              const existingId = existing ? getSub2ApiRecordId(existing) : "";
              if (existingId) {
                if (updatesById.has(existingId)) {
                  inputDuplicates += 1;
                }
                updatesById.set(existingId, { account, existing });
                return;
              }

              const identityKey = getImportIdentityKey(account);
              if (identityKey && createKeyIndex.has(identityKey)) {
                createAccounts[createKeyIndex.get(identityKey)] = account;
                inputDuplicates += 1;
                return;
              }

              if (identityKey) {
                createKeyIndex.set(identityKey, createAccounts.length);
              }
              createAccounts.push(account);
            });

            let accountUpdated = 0;
            let accountFailed = 0;
            const privacyAccountIds = [];

            if (updatesById.size) {
              setStatus(elements.outputStatus, `已发现 ${updatesById.size} 个重复账号，正在更新凭据与绑定配置...`, "ok");
            }

            for (const [accountId, item] of updatesById.entries()) {
              try {
                await applyOAuthCredentialsToExistingAccount(accountId, item.account);
                await updateExistingSub2ApiAccount(accountId, item.account);
                accountUpdated += 1;
                privacyAccountIds.push(accountId);
              } catch {
                accountFailed += 1;
              }
            }

            let accountCreated = 0;
            if (createAccounts.length) {
              setStatus(elements.outputStatus, `正在创建 ${createAccounts.length} 个新账号...`, "ok");
              const data = await requestSub2ApiJson(sub2apiUrl, {
                method: "POST",
                body: JSON.stringify({ accounts: createAccounts }),
              });
              const createStats = getBatchCreateStats(data);
              accountCreated = createStats.created;
              accountFailed += createStats.failed;
              privacyAccountIds.push(...getCreatedAccountIds(data));
            }

            const privacyStats = await applyPrivacyToAccounts(privacyAccountIds);
            const privacyText = state.setPrivacy
              ? `；privacy 成功 ${privacyStats.success}，失败/跳过 ${privacyStats.failed}`
              : "";
            const duplicateText = inputDuplicates
              ? `；输入内重复 ${inputDuplicates} 个已按最后一次内容处理`
              : "";
            const coverageText = total > existingAccounts.length
              ? `；已检查最近 ${existingAccounts.length}/${total} 个服务器账号`
              : "";
            setStatus(
              elements.outputStatus,
              `已导入 sub2api：创建 ${accountCreated}，更新 ${accountUpdated}，失败 ${accountFailed}${privacyText}${duplicateText}${coverageText}。`,
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

        elements.concurrency.addEventListener("input", () => {
          state.concurrency = parseInt(elements.concurrency.value, 10);
          if (Number.isNaN(state.concurrency) || state.concurrency < 0) state.concurrency = 10;
          scheduleConvert();
        });

        elements.expiresAt.addEventListener("input", () => {
          state.expiresAtOverride = unixSecondsFromDateInput(elements.expiresAt.value);
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

        elements.setPrivacy.addEventListener("change", () => {
          state.setPrivacy = elements.setPrivacy.checked === true;
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
        elements.serverAccountSearch.addEventListener("input", () => {
          state.serverAccountSearch = elements.serverAccountSearch.value;
          renderServerAccounts();
        });
        elements.toggleVisibleServerAccountSelection.addEventListener("click", () => {
          const visibleIds = getFilteredServerAccounts().map((account) => getServerAccountId(account)).filter(Boolean);
          if (elements.toggleVisibleServerAccountSelection.dataset.selectionMode === "clear") {
            setSelectedServerAccounts([]);
          } else {
            setSelectedServerAccounts([...state.selectedServerAccountIds, ...visibleIds]);
          }
        });
        elements.applySelectedServerAccountSettings.addEventListener("click", () => {
          runServerAccountOperation(state.selectedServerAccountIds, "apply-settings");
        });
        elements.privacySelectedServerAccounts.addEventListener("click", () => {
          runServerAccountOperation(state.selectedServerAccountIds, "set-privacy");
        });
        elements.startSelectedServerAccountSchedule.addEventListener("click", () => {
          runServerAccountOperation(state.selectedServerAccountIds, "start-schedule");
        });
        elements.stopSelectedServerAccountSchedule.addEventListener("click", () => {
          runServerAccountOperation(state.selectedServerAccountIds, "stop-schedule");
        });
        elements.enableSelectedServerAccounts.addEventListener("click", () => {
          runServerAccountOperation(state.selectedServerAccountIds, "enable-account");
        });
        elements.disableSelectedServerAccounts.addEventListener("click", () => {
          runServerAccountOperation(state.selectedServerAccountIds, "disable-account");
        });
        elements.deleteSelectedServerAccounts.addEventListener("click", () => {
          runServerAccountOperation(state.selectedServerAccountIds, "delete-account");
        });
        elements.serverAccountBody.addEventListener("change", (event) => {
          const accountId = event.target?.dataset?.serverAccountId;
          if (!accountId) {
            return;
          }
          const selected = new Set(state.selectedServerAccountIds);
          if (event.target.checked) {
            selected.add(String(accountId));
          } else {
            selected.delete(String(accountId));
          }
          setSelectedServerAccounts(Array.from(selected));
        });
        elements.serverAccountBody.addEventListener("click", (event) => {
          const actionTarget = typeof event.target?.closest === "function"
            ? event.target.closest("[data-server-action][data-server-account-id]")
            : event.target;
          const action = actionTarget?.dataset?.serverAction;
          const accountId = actionTarget?.dataset?.serverAccountId;
          if (!action || !accountId || actionTarget?.disabled) {
            return;
          }
          runServerAccountOperation([accountId], action);
        });
        elements.saveSub2apiConfig.addEventListener("click", saveSub2ApiConfig);
        elements.saveTokenmanagerPassword.addEventListener("click", saveTokenManagerPassword);
        elements.logoutButton.addEventListener("click", logoutTokenManager);
        elements.sub2apiTokenToggle.addEventListener("click", () => {
          const isVisible = elements.sub2apiToken.type === "text";
          elements.sub2apiToken.type = isVisible ? "password" : "text";
          const label = isVisible ? "显示 Bearer Token" : "隐藏 Bearer Token";
          elements.sub2apiTokenToggle.setAttribute("aria-label", label);
          elements.sub2apiTokenToggle.setAttribute("aria-pressed", String(!isVisible));
          elements.sub2apiTokenToggle.title = label;
        });

        elements.input.addEventListener("input", () => {
          if (state.formatInputPretty) {
            if (!formatInputJson({ silent: true })) {
              scheduleConvert();
            }
            return;
          }
          scheduleConvert();
        });
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

        elements.formatInput.addEventListener("change", () => {
          state.formatInputPretty = elements.formatInput.checked === true;
          if (state.formatInputPretty) {
            formatInputJson();
          } else {
            scheduleConvert();
            setStatus(elements.inputStatus, "已关闭格式化换行；解析仍支持多账号多段 JSON。", state.converted.length ? "ok" : "");
          }
        });

        updateOutput();
        renderServerAccounts();
        updateSub2ApiConnectionMode();
        hydrateSub2ApiDefaults();
      })();
