# TokenManager BFF

`tokenmanager-bff.js` 是 TokenManager 的同源后端代理（BFF）：浏览器只持有 HttpOnly 会话 Cookie，sub2api 管理员账号和 Bearer/JWT 只保存在服务器环境变量中。

优先使用 `SUB2API_ADMIN_EMAIL` + `SUB2API_ADMIN_PASSWORD` 自动登录并缓存/刷新 sub2api JWT；如果 sub2api 后台登录额外启用了 2FA/Turnstile，推荐使用 sub2api 的 `admin_api_key` 并通过 `SUB2API_ADMIN_API_KEY` 注入 `x-api-key`。也可用 `SUB2API_JWT_SECRET` + 管理员用户 ID/token_version 在服务器侧短期签发 JWT，或用 `SUB2API_ADMIN_BEARER_TOKEN` 作为静态令牌兜底。以上密钥都只保存在服务器，仍不会暴露给浏览器。

## 必要环境变量

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
```

生成登录密码哈希（避免把明文密码写入 shell 历史）：

```bash
printf '%s' '你的登录密码' | node server/tokenmanager-bff.js hash-password
```

生产环境建议由 systemd `EnvironmentFile=` 或仅服务器上的 `.env` 提供变量；不要提交 `.env`。

## Caddy 路由

静态页面继续服务 `/token-manager/*`，并将以下同源路径反代到 BFF：

```caddyfile
handle /token-manager-auth/* {
  reverse_proxy 127.0.0.1:8787
}
handle /token-manager-api/* {
  reverse_proxy 127.0.0.1:8787
}
```

注意不要用 `handle_path`，否则 Caddy 会剥离 `/token-manager-auth` 和 `/token-manager-api` 前缀；BFF 默认按完整路径路由。

BFF 只允许代理必要的 sub2api 管理接口：账号列表、账号导入、分组列表和代理列表。
