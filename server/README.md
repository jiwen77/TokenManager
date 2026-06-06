# TokenManager BFF

`tokenmanager-bff.js` 是 TokenManager 的同源后端代理（BFF）：浏览器只持有 HttpOnly 会话 Cookie，sub2api 管理员账号和 Bearer/JWT 只保存在服务器环境变量中。

优先使用 `SUB2API_ADMIN_EMAIL` + `SUB2API_ADMIN_PASSWORD` 自动登录并缓存/刷新 sub2api JWT；如果 sub2api 后台登录额外启用了 2FA/Turnstile，推荐使用 sub2api 的 `admin_api_key` 并通过 `SUB2API_ADMIN_API_KEY` 注入 `x-api-key`。也可用 `SUB2API_JWT_SECRET` + 管理员用户 ID/token_version 在服务器侧短期签发 JWT，或用 `SUB2API_ADMIN_BEARER_TOKEN` 作为静态令牌兜底。以上密钥都只保存在服务器，仍不会暴露给浏览器。

## 推荐：页面门禁 + 服务端代理模式

Hostdzire-LA 当前应使用服务端代理模式：浏览器只访问 TokenManager，同源请求 `/token-manager/api/*`；BFF 在服务器上访问本机 sub2api。页面里的“保存配置”会写入 SQLite 配置库，Bearer Token 会加密保存。

```bash
TOKENMANAGER_AUTH_ONLY=false
TOKENMANAGER_SESSION_SECRET=<至少32字节随机字符串>
TOKENMANAGER_PASSWORD_HASH=<node server/tokenmanager-bff.js hash-password 生成>
TOKENMANAGER_HOST=127.0.0.1
TOKENMANAGER_PORT=8787
TOKENMANAGER_BASE_PATH=/token-manager
TOKENMANAGER_STATIC_DIR=/opt/tokenmanager/docs
TOKENMANAGER_STORAGE_BACKEND=sqlite
TOKENMANAGER_DATABASE_FILE=/opt/tokenmanager/data/tokenmanager.sqlite
TOKENMANAGER_ENCRYPTION_KEY=<至少32字节随机字符串，建议独立于 SESSION_SECRET>
# 旧版 JSON 自动迁移来源；迁移完成后不再写入这个文件。
TOKENMANAGER_CONFIG_FILE=/opt/tokenmanager/server/runtime-config.json

# BFF 在 Hostdzire-LA 上访问 sub2api，本机地址只给服务器进程用。
SUB2API_BASE_URL=http://127.0.0.1:8080/api/v1
SUB2API_ADMIN_EMAIL=<sub2api 管理员邮箱>
SUB2API_ADMIN_PASSWORD=<sub2api 管理员密码>
# 或改用 SUB2API_ADMIN_API_KEY / SUB2API_JWT_SECRET / SUB2API_ADMIN_BEARER_TOKEN。

# 页面如果退回浏览器直连模式时才会用到下面两个非敏感默认值。
TOKENMANAGER_SUB2API_DEFAULT_ORIGIN=https://api.wenlab.link
TOKENMANAGER_SUB2API_IMPORT_PATH=/api/v1/admin/accounts/data
```

BFF 自己服务 `/token-manager/` 页面、`/token-manager/auth/*` 登录/配置接口和 `/token-manager/api/*` sub2api 代理接口。Caddy 不再需要 `forward_auth` 或 `file_server`，只需要把 TokenManager 入口反代到 BFF。

登录信息与页面默认值建议这样保存：

- `.env`/systemd `EnvironmentFile` 保存 `TOKENMANAGER_PASSWORD_HASH` 和 `TOKENMANAGER_SESSION_SECRET`。
- 不要把 TokenManager 明文登录密码写入 `.env`，更不要提交到 git；服务校验只需要哈希。
- 如需临时留存明文密码用于找回，应放在服务器 root-only 文件或密码管理器中，权限建议 `600`；确认已记录后可以删除该明文文件。
- `SUB2API_BASE_URL` 是 BFF 服务端代理上游地址，给 Node 在服务器上访问用；这里可以用服务器内网 `127.0.0.1`。
- `SUB2API_ADMIN_*` / `SUB2API_JWT_SECRET` / `SUB2API_ADMIN_BEARER_TOKEN` 只保存在服务器 `.env`，不要提交到 git。
- 页面“保存配置”写入 `TOKENMANAGER_DATABASE_FILE` 指向的 SQLite；Bearer Token 会用 `TOKENMANAGER_ENCRYPTION_KEY` 加密后保存。若未设置独立 encryption key，会回退使用 `TOKENMANAGER_SESSION_SECRET` 派生密钥。
- `TOKENMANAGER_CONFIG_FILE` 现在只作为旧版 JSON 自动迁移来源；SQLite 已有数据时不会覆盖 SQLite。
- `TOKENMANAGER_SUB2API_DEFAULT_ORIGIN` / `TOKENMANAGER_SUB2API_IMPORT_PATH` 是页面初始默认值；保存配置后，SQLite 里的运行时配置会覆盖这些默认值。

SQLite 后端不需要 npm 依赖。Node 进程通过系统 `python3` 的标准库 `sqlite3` 访问数据库；如 Python 不在默认路径，可设置：

```bash
TOKENMANAGER_PYTHON=/usr/bin/python3
```


## 页面保存配置

登录 TokenManager 后，页面里的“保存配置”会持久化这些字段到服务器 SQLite 配置库：

- sub2api 服务器地址
- Bearer Token（如输入；留空保存会继续沿用服务器已有认证）
- 绑定分组
- 绑定代理
- Priority
- Rate Multiplier
- WS mode（写入 `extra.openai_oauth_responses_websockets_v2_mode`）
- 自动透传（写入 `extra.openai_passthrough`）

保存后的 Bearer Token 不会通过 `/token-manager/auth/config` 明文返回给页面；页面只会知道服务器端已有认证。SQLite 文件里也不会保存 Bearer Token 明文。

## 可选：浏览器直连模式默认地址字段

| 字段 | 作用 | 示例 |
|---|---|---|
| `TOKENMANAGER_SUB2API_DEFAULT_ORIGIN` | 页面输入框默认显示的服务器地址，只放域名或 `ip:端口` | `https://api.wenlab.link`、`https://1.2.3.4:8443` |
| `TOKENMANAGER_SUB2API_DEFAULT_HOST` | `TOKENMANAGER_SUB2API_DEFAULT_ORIGIN` 的兼容别名 | `https://api.example.com` |
| `TOKENMANAGER_SUB2API_IMPORT_PATH` | 自动补齐的完整导入接口路径 | `/api/v1/admin/accounts/data` |
| `TOKENMANAGER_SUB2API_DEFAULT_URL` | 旧版兼容字段；会被拆成 origin + import path | `https://api.example.com/api/v1/admin/accounts/data` |

页面输入框显示 `https://api.wenlab.link` 时，实际导入请求会自动拼成：

```text
https://api.wenlab.link/api/v1/admin/accounts/data
```

刷新账号、分组、代理时，BFF/前端会从完整导入路径自动推导 admin base：

```text
/api/v1/admin/accounts/data -> /api/v1
```

所以通常不需要单独维护 `TOKENMANAGER_SUB2API_API_BASE_PATH`。旧版配置里如果还存在这个字段，程序仍会兼容读取，但新部署不推荐再写。

如果你的 sub2api 只有 HTTP，没有 HTTPS，建议通过 Caddy 同域反代后使用 HTTPS 服务器地址，避免浏览器 Mixed Content/CORS 问题。

## 服务端代理 sub2api 管理接口字段

服务端代理模式会让浏览器永远看不到 sub2api 管理 token，需要配置下面的 sub2api 变量；浏览器只访问 BFF 的 `/token-manager/api/*`。

```bash
TOKENMANAGER_SESSION_SECRET=<至少32字节随机字符串>
TOKENMANAGER_PASSWORD_HASH=<node server/tokenmanager-bff.js hash-password 生成>
SUB2API_BASE_URL=http://127.0.0.1:8080/api/v1
SUB2API_ADMIN_EMAIL=<sub2api 管理员邮箱>
SUB2API_ADMIN_PASSWORD=<sub2api 管理员密码>
# 如果 sub2api 登录启用了 2FA/Turnstile，推荐使用服务器侧 admin API key：
# SUB2API_ADMIN_API_KEY=<sub2api settings.admin_api_key>
# 也可以改用服务器侧 JWT 签发模式：
# SUB2API_JWT_SECRET=<sub2api JWT_SECRET>
# SUB2API_ADMIN_USER_ID=<管理员 users.id>
# SUB2API_ADMIN_TOKEN_VERSION=<管理员 users.token_version>
# SUB2API_SIGNED_TOKEN_TTL_SECONDS=3600
# 也可兜底使用静态令牌（仍仅保存在服务器）：
# SUB2API_ADMIN_BEARER_TOKEN=<仅保存在服务器的管理员 Bearer>
TOKENMANAGER_HOST=127.0.0.1
TOKENMANAGER_PORT=8787
TOKENMANAGER_BASE_PATH=/token-manager
TOKENMANAGER_STATIC_DIR=/opt/tokenmanager/docs
TOKENMANAGER_STORAGE_BACKEND=sqlite
TOKENMANAGER_DATABASE_FILE=/opt/tokenmanager/data/tokenmanager.sqlite
TOKENMANAGER_ENCRYPTION_KEY=<至少32字节随机字符串>
```

修改 TokenManager 页面登录密码的首选方式：登录网页后，在“TokenManager 设置”里直接填写新密码并保存。后端会自动生成哈希并写入 `.env`，不保存明文，也不需要 SSH。

如果无法登录页面，可用 SSH 备用命令：

```bash
printf '%s' '你的新登录密码' | node server/tokenmanager-bff.js set-login-password --env /opt/tokenmanager/server/.env
systemctl restart tokenmanager-bff
```

如只想打印哈希、不写文件，也可以使用：

```bash
printf '%s' '你的登录密码' | node server/tokenmanager-bff.js hash-password
```

生产环境建议由 systemd `EnvironmentFile=` 或仅服务器上的 `.env` 提供变量；不要提交 `.env`。TokenManager 登录密码只写入 `TOKENMANAGER_PASSWORD_HASH` 的哈希值，明文密码应放入密码管理器，不应放进 `.env`。

## 旧版 JSON 到 SQLite 迁移

默认 `TOKENMANAGER_STORAGE_BACKEND=sqlite`。启动时如果 SQLite 为空且 `TOKENMANAGER_CONFIG_FILE` 指向的旧版 JSON 存在，BFF 会自动读取旧 JSON、归一化地址，并把配置写入 SQLite；其中 `sub2apiBearerToken` 会加密为 `sub2apiBearerTokenEncrypted`。

迁移后可以检查：

```bash
test -f /opt/tokenmanager/data/tokenmanager.sqlite
```

确认服务正常后，旧 `runtime-config.json` 建议只保留 root-only 备份或删除，避免遗留明文 Bearer Token。

## Caddy 路由

TokenManager 现在是单端口 BFF 应用。Caddy 只需要一个 TokenManager 入口反代块：

```caddyfile
@tokenmanager path /token-manager /token-manager/*
handle @tokenmanager {
  reverse_proxy 127.0.0.1:8787
}
```

BFF 会在这个入口下自行分发：

- `/token-manager/`：页面与页面内登录表单
- `/token-manager/auth/*`：登录、登出、配置保存、健康检查
- `/token-manager/api/*`：sub2api 服务端代理

不要用 `handle_path`，否则 Caddy 会剥离 `/token-manager` 前缀，BFF 无法按完整产品路径路由。旧版 `/token-manager-auth/*` 和 `/token-manager-api/*` 仍在 BFF 内兼容，但新部署不需要再在 Caddy 暴露它们。

BFF 只允许代理必要的 sub2api 管理接口：账号列表、账号导入、分组列表和代理列表。
