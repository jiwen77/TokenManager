# TokenManager BFF deployment guide

`server/tokenmanager-bff.js` is the secure Backend-for-Frontend (BFF) for TokenManager. It serves the static app, handles the TokenManager password gate, persists runtime settings, and proxies a small allowlist of sub2api admin endpoints.

The goal is simple: the browser gets a TokenManager HttpOnly session cookie, while sub2api admin credentials stay on the server.

## Recommended production topology

```text
Internet
  -> HTTPS reverse proxy
  -> TokenManager BFF on 127.0.0.1:8787
  -> sub2api on a private URL, for example 127.0.0.1:8080/api/v1
```

Use the BFF for production deployments instead of browser-direct sub2api access. Browser-direct mode can still be useful for local testing, but it places admin tokens in the browser runtime.

## Environment file

Start from the checked-in template:

```bash
cp server/.env.example server/.env
chmod 600 server/.env
```

Generate a login password hash:

```bash
printf '%s' 'replace-with-a-strong-password' \
  | node server/tokenmanager-bff.js hash-password
```

Then edit `server/.env` on the server. Do not commit it.

### Minimal BFF configuration

```bash
TOKENMANAGER_AUTH_ONLY=false
TOKENMANAGER_HOST=127.0.0.1
TOKENMANAGER_PORT=8787
TOKENMANAGER_BASE_PATH=/token-manager
TOKENMANAGER_STATIC_DIR=/opt/tokenmanager/docs

TOKENMANAGER_PASSWORD_HASH=<generated-password-hash>
TOKENMANAGER_SESSION_SECRET=<random-32-plus-byte-secret>
TOKENMANAGER_ENCRYPTION_KEY=<different-random-32-plus-byte-secret>

TOKENMANAGER_STORAGE_BACKEND=sqlite
TOKENMANAGER_DATABASE_FILE=/opt/tokenmanager/data/tokenmanager.sqlite

SUB2API_BASE_URL=http://127.0.0.1:8080/api/v1
SUB2API_ADMIN_API_KEY=<server-side-sub2api-admin-api-key>
```

If your sub2api deployment does not use an admin API key, use one of these server-only alternatives:

```bash
# Login mode. May not work if the sub2api admin login requires 2FA or Turnstile.
SUB2API_ADMIN_EMAIL=<admin-email>
SUB2API_ADMIN_PASSWORD=<admin-password>

# JWT signing mode.
SUB2API_JWT_SECRET=<sub2api-jwt-secret>
SUB2API_ADMIN_USER_ID=<admin-user-id>
SUB2API_ADMIN_EMAIL=<admin-email>
SUB2API_ADMIN_TOKEN_VERSION=0
SUB2API_SIGNED_TOKEN_TTL_SECONDS=3600

# Static bearer fallback. Use only if you can rotate it safely.
SUB2API_ADMIN_BEARER_TOKEN=<server-side-admin-bearer-token>
```

Only one sub2api credential strategy is needed. Prefer `SUB2API_ADMIN_API_KEY` when available.

## Runtime configuration storage

The default backend is SQLite:

```bash
TOKENMANAGER_STORAGE_BACKEND=sqlite
TOKENMANAGER_DATABASE_FILE=/opt/tokenmanager/data/tokenmanager.sqlite
TOKENMANAGER_ENCRYPTION_KEY=<random-32-plus-byte-secret>
```

Saved page settings include sub2api origin, selected groups/proxies, priority, concurrency, expiry, rate multiplier, WebSocket mode, privacy mode, and cached account metadata. Saved Bearer tokens are encrypted before they are written to SQLite and are not returned to the browser in plaintext.

SQLite access uses Python's standard library `sqlite3` through a small helper process. If Python is not on `PATH`, set:

```bash
TOKENMANAGER_PYTHON=/usr/bin/python3
```

## Reverse proxy example

Example Caddy route:

```caddyfile
@tokenmanager path /token-manager /token-manager/*
handle @tokenmanager {
  reverse_proxy 127.0.0.1:8787
}
```

Do not use `handle_path` for this route; stripping `/token-manager` prevents the BFF from routing by its configured base path.

The BFF serves:

- `/token-manager/` - app and password gate
- `/token-manager/auth/*` - login, logout, config, health
- `/token-manager/api/*` - allowlisted sub2api proxy endpoints

Legacy `/token-manager-auth/*` and `/token-manager-api/*` paths remain for compatibility, but new deployments should use the base-path routes above.

## systemd example

```ini
[Unit]
Description=TokenManager BFF
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/tokenmanager
EnvironmentFile=/opt/tokenmanager/server/.env
ExecStart=/usr/bin/node /opt/tokenmanager/server/tokenmanager-bff.js
Restart=on-failure
RestartSec=3
User=tokenmanager
Group=tokenmanager
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/tokenmanager/data /opt/tokenmanager/server

[Install]
WantedBy=multi-user.target
```

Adjust paths and user/group names for your environment.

## Changing the TokenManager login password

Preferred method: log in to the web UI and use the TokenManager settings panel. The BFF writes only the password hash.

Fallback over SSH:

```bash
printf '%s' 'replace-with-a-new-strong-password' \
  | node server/tokenmanager-bff.js set-login-password --env /opt/tokenmanager/server/.env
systemctl restart tokenmanager-bff
```

## Allowed sub2api proxy routes

The proxy is intentionally narrow. It currently allows account list/update/import, account privacy/schedulable operations, group list, and proxy list endpoints required by the UI. Do not widen the allowlist unless the UI needs the endpoint and the response is safe to expose after sanitization.

## Publishing checklist

Before pushing a fork or deployment branch:

```bash
git status --short --ignored
grep -RIn "Bearer \\|access_token\\|refresh_token\\|sessionToken\\|PASSWORD=\\|SECRET=\\|API_KEY=" . \
  --exclude-dir=.git --exclude-dir=node_modules
```

Make sure the results contain only examples, tests, or documentation placeholders. Never publish `.env`, SQLite runtime files, session exports, generated account JSON, logs, or screenshots containing tokens.
