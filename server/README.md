# TokenManager BFF deployment guide

`server/tokenmanager-bff.js` is the optional Backend-for-Frontend (BFF) for TokenManager. It serves the static app, handles the TokenManager password gate, persists runtime settings, and proxies a narrow allowlist of sub2api admin endpoints.

The goal is to keep browser access simple while keeping sub2api admin credentials on the server.

## Recommended topology

```text
Internet
  -> HTTPS reverse proxy
  -> TokenManager BFF on 127.0.0.1:8787
  -> sub2api on a private URL, for example 127.0.0.1:8080/api/v1
```

Use the BFF for production deployments instead of browser-direct sub2api access. Browser-direct mode can still be useful for local testing, but it places admin tokens in the browser runtime.

## 1. Prepare the application directory

Choose an installation directory for your environment. The examples below use `/srv/tokenmanager`; replace it with your own path.

```bash
sudo mkdir -p /srv/tokenmanager
sudo chown -R tokenmanager:tokenmanager /srv/tokenmanager
```

Copy or clone the project into that directory, then create a writable data directory:

```bash
mkdir -p /srv/tokenmanager/data
chmod 700 /srv/tokenmanager/data
```

## 2. Create the environment file

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
TOKENMANAGER_STATIC_DIR=/srv/tokenmanager/docs

TOKENMANAGER_PASSWORD_HASH=<generated-password-hash>
TOKENMANAGER_SESSION_SECRET=<random-32-plus-byte-secret>
TOKENMANAGER_ENCRYPTION_KEY=<different-random-32-plus-byte-secret>

TOKENMANAGER_STORAGE_BACKEND=sqlite
TOKENMANAGER_DATABASE_FILE=/srv/tokenmanager/data/tokenmanager.sqlite

SUB2API_BASE_URL=http://127.0.0.1:8080/api/v1
SUB2API_ADMIN_API_KEY=<server-side-sub2api-admin-api-key>
```

Only one sub2api credential strategy is needed. Prefer `SUB2API_ADMIN_API_KEY` when available.

### Alternative sub2api credential modes

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

## 3. Runtime configuration storage

The default backend is SQLite:

```bash
TOKENMANAGER_STORAGE_BACKEND=sqlite
TOKENMANAGER_DATABASE_FILE=/srv/tokenmanager/data/tokenmanager.sqlite
TOKENMANAGER_ENCRYPTION_KEY=<random-32-plus-byte-secret>
```

Saved page settings include sub2api origin, selected groups/proxies, priority, concurrency, expiry, rate multiplier, WebSocket mode, privacy mode, and cached account metadata. Saved Bearer tokens are encrypted before they are written to SQLite and are not returned to the browser in plaintext.

SQLite access uses Python's standard library `sqlite3` through a small helper process. If Python is not on `PATH`, set:

```bash
TOKENMANAGER_PYTHON=/usr/bin/python3
```

## 4. Reverse proxy

Example Caddy route:

```caddyfile
@tokenmanager path /token-manager /token-manager/*
handle @tokenmanager {
  reverse_proxy 127.0.0.1:8787
}
```

Do not use `handle_path` for this route. Stripping `/token-manager` prevents the BFF from routing by its configured base path.

The BFF serves:

- `/token-manager/` - app and password gate
- `/token-manager/auth/*` - login, logout, config, health
- `/token-manager/api/*` - allowlisted sub2api proxy endpoints

Legacy `/token-manager-auth/*` and `/token-manager-api/*` paths remain for compatibility, but new deployments should use the base-path routes above.

## 5. Iframe embedding

By default the BFF sends:

```http
Content-Security-Policy: frame-ancestors 'self'
```

This allows pages on the same origin to embed TokenManager while unrelated sites are blocked.

To embed TokenManager in a trusted cross-origin page, set exact parent-page origins:

```bash
TOKENMANAGER_FRAME_ANCESTORS=https://portal.example.com
```

Use origins, not paths. Multiple trusted origins can be separated by spaces or commas. Set `TOKENMANAGER_FRAME_ANCESTORS=none` to disable all iframe embedding.

If the iframe is cross-site and users need to log in inside it, also set:

```bash
TOKENMANAGER_COOKIE_SAMESITE=None
TOKENMANAGER_COOKIE_SECURE=true
```

Check the reverse proxy too: do not add `X-Frame-Options: DENY` or a conflicting `Content-Security-Policy` on the TokenManager route.

## 6. systemd example

```ini
[Unit]
Description=TokenManager BFF
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/srv/tokenmanager
EnvironmentFile=/srv/tokenmanager/server/.env
ExecStart=/usr/bin/node /srv/tokenmanager/server/tokenmanager-bff.js
Restart=on-failure
RestartSec=3
User=tokenmanager
Group=tokenmanager
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/srv/tokenmanager/data /srv/tokenmanager/server

[Install]
WantedBy=multi-user.target
```

Adjust paths and user/group names for your environment.

## Changing the TokenManager login password

Preferred method: log in to the web UI and use the TokenManager settings panel. The BFF writes only the password hash.

Fallback over SSH:

```bash
printf '%s' 'replace-with-a-new-strong-password' \
  | node server/tokenmanager-bff.js set-login-password --env /srv/tokenmanager/server/.env
systemctl restart tokenmanager-bff
```

## Allowed sub2api proxy routes

The proxy is intentionally narrow. It currently allows the account list/update/delete/import routes, account privacy/schedulable operations, group list, and proxy list endpoints required by the UI.

Do not widen the allowlist unless:

1. the UI needs the endpoint;
2. the response is safe to expose after sanitization; and
3. tests cover the new route and any secret-stripping behavior.

## Deployment checklist

Before starting the service publicly:

- [ ] `server/.env` exists only on the server and has mode `600`.
- [ ] `TOKENMANAGER_PASSWORD_HASH` is set and the plaintext password is not stored.
- [ ] `TOKENMANAGER_SESSION_SECRET` and `TOKENMANAGER_ENCRYPTION_KEY` are long, random, and different.
- [ ] sub2api admin credentials are server-only.
- [ ] reverse proxy uses HTTPS for public traffic.
- [ ] iframe policy is the narrowest value that meets your needs.
- [ ] runtime data directory is writable by the service user only.
- [ ] logs do not include request headers, cookies, or tokens.

Before pushing a branch or fork, run a sensitive information review from the repository root:

```bash
git status --short --ignored
grep -RInE "Bearer |access_token|refresh_token|sessionToken|PASSWORD=|SECRET=|API_KEY=|https?://[^ ]+" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules
```

Review every match and keep only placeholders, examples, or tests.
