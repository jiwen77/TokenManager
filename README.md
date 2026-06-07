# TokenManager

TokenManager converts ChatGPT Web session exports and Codex-compatible OAuth files into account JSON for CPA, sub2api, Cockpit Tools, 9router, Codex, AxonHub, and Codex-Manager.

It can run as either:

- a static browser page for local conversion previews; or
- a small Backend-for-Frontend (BFF) that protects sub2api admin credentials behind an HttpOnly TokenManager session and a same-origin proxy.

> Security notice: session exports, OAuth files, Bearer tokens, generated import JSON, runtime databases, and screenshots containing account details are sensitive. Use this project only with accounts and tokens you are authorized to access.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Security model](#security-model)
- [Development](#development)
- [Project structure](#project-structure)
- [Publishing checklist](#publishing-checklist)

## Features

- Convert multiple input shapes in one page:
  - ChatGPT Web session JSON
  - 9router Codex OAuth JSON
  - Codex `auth.json`
  - AxonHub Codex auth JSON
  - Codex-Manager batch import JSON
- Export account JSON for CPA, sub2api, Cockpit Tools, 9router, Codex, AxonHub, and Codex-Manager.
- Preserve account metadata when available, including email, account ID, plan type, expiry, concurrency, priority, rate multiplier, groups, proxies, scheduling state, and privacy state.
- Manage sub2api accounts through the optional BFF:
  - password-gated TokenManager UI
  - HttpOnly session cookie
  - allowlisted same-origin `/token-manager/api/*` proxy
  - server-side sub2api admin credentials
  - encrypted SQLite runtime configuration for saved Bearer tokens
- Use a clean dashboard UI for bulk account operations, including themed in-page confirmations for destructive or state-changing actions.
- Allow same-origin iframe embedding by default while keeping cross-origin embedding explicit and narrow.

## Architecture

```text
Browser
  ├─ local conversion preview in docs/app.js
  └─ optional same-origin calls to /token-manager/*

TokenManager BFF (server/tokenmanager-bff.js)
  ├─ serves the static app and password gate
  ├─ stores only a TokenManager session cookie in the browser
  ├─ saves runtime settings in SQLite
  └─ proxies allowlisted sub2api admin endpoints

sub2api
  └─ receives admin calls from the BFF, not directly from the browser
```

For production use, the BFF mode is recommended. Browser-direct mode is suitable for local testing, but it requires entering a sub2api Bearer token in the browser runtime.

## Quick start

### Static local conversion

Clone the repository and open the static app:

```bash
git clone <your-fork-or-repository-url>
cd TokenManager
```

Then open this file in a browser:

```text
docs/index.html
```

No build step is required for the static converter. Generated JSON stays in the browser unless you copy, download, or import it.

### BFF mode for local testing

1. Copy the example environment file:

   ```bash
   cp server/.env.example server/.env
   ```

2. Generate a TokenManager login password hash:

   ```bash
   printf '%s' 'replace-with-a-strong-password' \
     | node server/tokenmanager-bff.js hash-password
   ```

3. Edit `server/.env` and replace every placeholder with environment-specific values.

4. Start the BFF:

   ```bash
   node server/tokenmanager-bff.js
   ```

5. Open the local app:

   ```text
   http://127.0.0.1:8787/token-manager/
   ```

## Deployment

See [`server/README.md`](server/README.md) for a production-oriented deployment guide with environment variables, reverse proxy notes, iframe policy, systemd example, and runtime storage details.

A typical production layout is:

```text
HTTPS reverse proxy
  -> TokenManager BFF on localhost
  -> sub2api on a private upstream URL
```

Do not expose sub2api admin credentials to the browser for production deployments. Prefer `SUB2API_ADMIN_API_KEY`, JWT signing mode, or another server-only credential strategy supported by your sub2api deployment.

## Configuration

The most important server-side variables are:

| Variable | Purpose |
|---|---|
| `TOKENMANAGER_PASSWORD_HASH` | Hash of the TokenManager login password. Never store the plaintext password. |
| `TOKENMANAGER_SESSION_SECRET` | Random secret for signing TokenManager sessions. Use at least 32 bytes. |
| `TOKENMANAGER_ENCRYPTION_KEY` | Random key for encrypting saved runtime secrets. Use at least 32 bytes and keep it independent from the session secret. |
| `TOKENMANAGER_DATABASE_FILE` | SQLite path for runtime configuration. |
| `SUB2API_BASE_URL` | BFF upstream base URL for sub2api, for example `http://127.0.0.1:8080/api/v1`. |
| `SUB2API_ADMIN_API_KEY` | Preferred server-only credential when sub2api provides an admin API key. |
| `SUB2API_ADMIN_EMAIL` / `SUB2API_ADMIN_PASSWORD` | Optional login fallback if API key or JWT mode is not used. |
| `SUB2API_JWT_SECRET` and admin identity fields | Optional server-side JWT signing mode. |
| `TOKENMANAGER_FRAME_ANCESTORS` | Optional CSP iframe policy. Defaults to `'self'` for same-origin embedding. Use exact origins such as `https://portal.example.com` for trusted cross-origin parents, or `none` to disable embedding. |

Start from [`server/.env.example`](server/.env.example) and keep the real `server/.env` file out of git.

## Security model

- The static converter runs locally in the browser and does not upload data by itself.
- In BFF mode, the browser receives a TokenManager session cookie, not sub2api admin credentials.
- Saved Bearer tokens are encrypted before being written to SQLite and are not returned to the browser in plaintext.
- The BFF proxy is intentionally allowlisted to the endpoints required by the UI.
- The default CSP includes `frame-ancestors 'self'`; cross-origin iframe embedding must be configured explicitly.
- Cross-site iframe login cookies require `TOKENMANAGER_COOKIE_SAMESITE=None` and `TOKENMANAGER_COOKIE_SECURE=true`.
- Rotate any credential immediately if it was pasted into an issue, committed, logged, or shown in a screenshot.

See [`SECURITY.md`](SECURITY.md) before reporting vulnerabilities or sharing diagnostics.

## Development

Run the current checks with Node.js:

```bash
node -c docs/app.js
node -c server/tokenmanager-bff.js
node tests/convert-session.test.js
node tests/tokenmanager-bff.test.js
git diff --check
```

There is no package install step for the current test setup. The BFF uses Node.js built-ins and Python's standard `sqlite3` module for SQLite access.

## Project structure

```text
.
├── docs/                         # Static browser app
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── server/
│   ├── tokenmanager-bff.js        # BFF server and CLI helpers
│   ├── lib/runtime-config-store.js
│   ├── .env.example               # Safe configuration template
│   └── README.md                  # Deployment guide
├── tests/                         # Node test suite
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
└── README.md
```

## Publishing checklist

Before publishing a fork, release, screenshot, or deployment guide:

```bash
git status --short --ignored
grep -RInE "Bearer |access_token|refresh_token|sessionToken|PASSWORD=|SECRET=|API_KEY=|https?://[^ ]+" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules
```

Review every match. The repository should contain only placeholders, examples under `example.com`, local loopback addresses, or test fixtures. Never publish `.env`, SQLite runtime files, session exports, generated account JSON, request logs, shell history, or screenshots containing tokens.

## License

MIT. See [`LICENSE`](LICENSE).
