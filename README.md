# ChatGPT Session to CPA / sub2api / Cockpit / 9router / Codex / AxonHub / Codex-Manager

私有网页端工具，用来把 ChatGPT Web 登录 session JSON 转换成 CPA、sub2api、Cockpit Tools、9router、Codex auth.json、AxonHub 或 Codex-Manager 可导入 JSON；也可把转换结果导入私有 sub2api 后端，让账号数据持久化保存在服务器数据库中。

## 当前私有部署方式

代码仓库：<https://github.com/jiwen77/TokenManager>

当前推荐部署为：

```text
/token-manager/ 未登录时由服务器返回页面内密码表单
密码正确后进入 TokenManager
点击导入/刷新时，浏览器请求 TokenManager BFF
BFF 在 Hostdzire-LA 服务器上访问 http://127.0.0.1:8080/api/v1 的 sub2api
```

也就是说：

- 没有页面访问密码的人拿不到真正的 TokenManager 工具页面。
- 登录表单只有密码，不需要用户名，也不会触发浏览器 Basic Auth 弹窗。
- TokenManager 自身登录配置只应放在服务器运行环境：`.env`/systemd `EnvironmentFile` 保存 `TOKENMANAGER_PASSWORD_HASH` 和 `TOKENMANAGER_SESSION_SECRET`，不要保存或提交明文登录密码。
- 当前 Hostdzire-LA 部署使用服务端代理模式：网页可以填写/保存 sub2api 地址、Bearer Token、分组、代理、优先级和倍率，但实际请求仍由服务器 BFF 发起。
- sub2api 管理认证保存在服务器 `.env` 或加密 SQLite 配置库；保存后的 Bearer Token 不会在页面刷新后回显明文。
- BFF 可以使用服务器本机地址 `http://127.0.0.1:8080/api/v1` 访问 sub2api；这是服务器进程访问，不是浏览器访问。
- 转换预览仍在浏览器本地完成，不写入 localStorage/sessionStorage。
- 点击“保存配置”会把 sub2api 地址、Bearer Token 和绑定设置保存到服务器；点击导入/刷新时，浏览器只请求同源 `/token-manager/api/*`，真正的 sub2api 请求由服务器 BFF 完成。
- 不再支持从 `/token-manager/?token=...` 自动读取 Bearer Token，避免敏感 token 进入浏览器历史、日志或分享链接。

当前 TokenManager 已是单端口 BFF 应用：`server/tokenmanager-bff.js` 同时服务页面、登录/配置接口和 sub2api 服务端代理；Caddy 只需要把 `/token-manager` 入口反代到 BFF，说明见 [`server/README.md`](server/README.md)。

运行时配置默认保存到 SQLite：

```text
/opt/tokenmanager/data/tokenmanager.sqlite
```

页面保存的 Bearer Token 会先用 AES-256-GCM 加密再写入 SQLite。旧版 `server/runtime-config.json` 会在第一次启动 SQLite 存储时自动迁移；迁移后建议只保留 root-only 备份或删除旧 JSON。

## 使用提示

Plus 号可以用此方式导入中转站使用；Free 号的 access token 不能用于调用接口。

本工具可用来解决 Codex OAuth 登录需要绑定手机的问题。Plus 账号通过 Web 登录后的 session 就能生成可导入中转站的账号 JSON 数据；这类数据没有 `refresh_token`，但 `access_token` 有效期通常足够长。

解释一下： plus激活前（free状态）或激活后（plus状态）获取的session在使用上没有区别（free时拿到的session, 激活plus后就可以调模型了），只是账号级别标识有点区别（标识为free or plus），不影响调模型。 换句话讲，不管你啥时候拿到的session, 用本项目转换导入中转站，只要账号当前激活了plus, 就能正常调模型接口。

本工具主要针对 Plus 账号适用，Free 账号即使转换了也没有权限调用 GPT 模型。GoPay 拉闸了，没法每天发 Plus 了；加入 Discord 频道免费获取 GPT 撸羊毛信息，然后配合本工具导入 CPA or Sub2API 使用。

## 支持输入

支持粘贴或拖入 ChatGPT Web session JSON，例如包含：

- `user.email`
- `accessToken`
- `sessionToken`
- `expires`
- `account.id`
- `account.planType`

也支持粘贴或拖入 9router Codex OAuth JSON，例如包含 `accessToken`、`refreshToken`、`expiresAt`、`providerSpecificData.chatgptAccountId` 和 `providerSpecificData.chatgptPlanType`。

也支持粘贴或拖入 Codex 原生 auth.json，例如包含 `auth_mode`、`OPENAI_API_KEY`、`tokens.access_token`、`tokens.refresh_token`、`tokens.id_token`、`tokens.account_id` 和 `last_refresh`。

也支持粘贴或拖入 AxonHub Codex auth.json，例如包含 `tokens.access_token`、`tokens.refresh_token`、`tokens.id_token` 和 `last_refresh`。

也支持粘贴或拖入 Codex-Manager 批量导入 JSON，例如包含 `tokens.access_token`、`tokens.refresh_token`、`tokens.id_token` 和 `meta.label`。

页面也会尝试从 `accessToken` 的 JWT payload 中补充邮箱、账号 ID、用户 ID、计划类型和过期时间。

## 输出格式

- `CPA`：生成 Codex CPA auth JSON，包含 `type: "codex"`、`access_token`、`session_token`、`id_token`、`email`、`account_id`、套餐和过期时间等字段；缺少真实 `id_token` 时会根据 session 与 access token claims 构造 Codex 可解析的占位 JWT claims。
- `sub2api`：生成参考 `CPA2sub2API` 项目的 `exported_at/proxies/accounts` 结构，账号平台为 `openai`，类型为 `oauth`；每个账号对象包含 `expires_at` 和 `auto_pause_on_expired`，其中 `expires_at` 来自该账号 access token 的 JWT `exp` 秒级时间戳。
- `Cockpit`：生成 Cockpit Tools Codex JSON 导入可识别的扁平 token 格式，包含 `id_token`、`access_token`、`refresh_token`、`account_id`、`email`、`expired` 等字段。
- `9router`：生成 9router Codex OAuth JSON，包含 `accessToken`、`refreshToken`、`expiresAt`、`providerSpecificData`、`provider`、`authType`、`priority`、`isActive`、`createdAt` 和 `updatedAt` 等字段。
- `Codex`：生成原生 Codex `auth.json`，包含 `auth_mode: "chatgpt"`、`OPENAI_API_KEY: null`、`tokens.id_token/access_token/refresh_token/account_id` 和 `last_refresh`。缺少真实 `refresh_token` 时保留空字符串，access token 过期后不能自动刷新。
- `AxonHub`：生成 AxonHub Codex auth.json，包含 `auth_mode: "chatgpt"`、`last_refresh` 和 `tokens.access_token/refresh_token/id_token`。缺少真实 `refresh_token` 时会写入 `__missing_refresh_token__` 占位值，方便在 access token 过期前试用；过期后不能自动刷新。
- `Codex-Manager`：生成 Codex-Manager 批量导入 JSON，包含 `tokens.access_token/refresh_token/id_token` 和 `meta.label/workspace_id/chatgpt_account_id/note`。缺少真实 `refresh_token` 时保留空字符串，避免被 Codex-Manager 误判为可刷新账号。

ChatGPT Web session 通常不包含 OAuth 文件里常见的 `refresh_token`，因此 access token 过期后不能自动刷新。

## 本地使用

直接打开：

```text
docs/index.html
```

本地静态打开时可以做浏览器内转换预览。若不运行 BFF，导入到 sub2api 仍需要浏览器直连远端 sub2api 并填写 Bearer Token；生产部署推荐运行 BFF 服务端代理模式，让浏览器只请求同源 `/token-manager/api/*`。
