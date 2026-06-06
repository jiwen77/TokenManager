# TokenManager

TokenManager is a browser-first utility for converting ChatGPT Web session exports and Codex OAuth files into importable account JSON for CPA, sub2api, Cockpit Tools, 9router, Codex, AxonHub, and Codex-Manager. It can also run behind a small Backend-for-Frontend (BFF) so administrators can import and manage sub2api accounts without exposing admin credentials to the browser.

> Use this project only with accounts and tokens you are authorized to access. Session files, OAuth tokens, Bearer tokens, and generated import files are secrets. Do not paste them into public issues, commit them to git, or share them in screenshots.

## Highlights

- Convert multiple input formats in one page:
  - ChatGPT Web session JSON
  - 9router Codex OAuth JSON
  - Codex `auth.json`
  - AxonHub Codex auth JSON
  - Codex-Manager batch import JSON
- Export to CPA, sub2api, Cockpit Tools, 9router, Codex, AxonHub, and Codex-Manager formats.
- Preserve useful account metadata such as email, account ID, plan type, expiry, concurrency, priority, rate multiplier, groups, proxies, and privacy mode when available.
- Support a secure BFF deployment for sub2api operations:
  - HttpOnly TokenManager login session
  - same-origin `/token-manager/api/*` proxy
  - server-side sub2api admin credentials
  - encrypted SQLite runtime configuration for saved Bearer tokens
- Work as a static local page for offline conversion previews.

## Architecture

```text
Browser
  ├─ local conversion preview in docs/app.js
  └─ optional same-origin calls to /token-manager/*

TokenManager BFF (server/tokenmanager-bff.js)
  ├─ serves the static app and login page
  ├─ stores only a TokenManager session cookie in the browser
  ├─ saves runtime settings in SQLite
  └─ proxies allowlisted sub2api admin endpoints

sub2api
  └─ receives admin calls from the BFF, not directly from the browser
```

For production use, the BFF mode is recommended. Browser-direct mode is useful for local testing, but it requires entering a sub2api Bearer token in the browser and is easier to misconfigure.

## Quick start

### Static local conversion

Open the app directly in a browser:

```text
docs/index.html
```

This mode is enough for local conversion previews. Generated JSON stays in the browser unless you copy or download it.

### Secure BFF mode

1. Copy the example environment file and edit it on the server only:

   ```bash
   cp server/.env.example server/.env
   ```

2. Generate a TokenManager password hash:

   ```bash
   printf '%s' 'replace-with-a-strong-password' \
     | node server/tokenmanager-bff.js hash-password
   ```

3. Put the generated hash and random secrets in `server/.env`.

4. Start the BFF:

   ```bash
   node server/tokenmanager-bff.js
   ```

5. Open:

   ```text
   http://127.0.0.1:8787/token-manager/
   ```

See [`server/README.md`](server/README.md) for a production-oriented systemd/Caddy deployment guide.

## Configuration overview

The most important server-side variables are:

| Variable | Purpose |
|---|---|
| `TOKENMANAGER_PASSWORD_HASH` | Hash of the TokenManager login password. Never store the plaintext password. |
| `TOKENMANAGER_SESSION_SECRET` | Random secret for signing TokenManager sessions. Use at least 32 bytes. |
| `TOKENMANAGER_ENCRYPTION_KEY` | Random key for encrypting saved runtime secrets. Use at least 32 bytes. |
| `TOKENMANAGER_DATABASE_FILE` | SQLite path for runtime configuration. |
| `SUB2API_BASE_URL` | BFF upstream base URL for sub2api, for example `http://127.0.0.1:8080/api/v1`. |
| `SUB2API_ADMIN_API_KEY` | Preferred credential when sub2api provides an admin API key. |
| `SUB2API_ADMIN_EMAIL` / `SUB2API_ADMIN_PASSWORD` | Optional login credential fallback if API key/JWT mode is not used. |
| `SUB2API_JWT_SECRET` + admin identity fields | Optional server-side JWT signing mode. |

Do not commit `.env`, runtime SQLite databases, session exports, generated account JSON, screenshots containing tokens, or logs containing request headers.

## Security and privacy notes

- Treat all session exports and generated import files as credentials.
- Prefer the BFF mode for anything beyond local one-off conversion.
- Keep sub2api admin credentials in server environment variables or encrypted runtime storage only.
- The browser-facing config endpoint intentionally does not return saved Bearer tokens in plaintext.
- `TOKENMANAGER_ENCRYPTION_KEY` should be independent from `TOKENMANAGER_SESSION_SECRET` in production.
- Rotate any token immediately if it was pasted into a public issue, committed, logged, or shown in a screenshot.
- Review `git status --ignored` before publishing a fork or release.

## Development

Run the current test suite with Node.js:

```bash
node -c docs/app.js
node tests/convert-session.test.js
node tests/tokenmanager-bff.test.js
```

There is no package install step for the current test setup. The BFF uses Node.js built-ins and Python's standard `sqlite3` module for SQLite access.

## Repository hygiene

The `.gitignore` is intentionally strict about local secrets and generated account exports, including `.env`, token/session JSON, SQLite runtime files, logs, and agent scratch state. If you add new tooling, keep generated artifacts and credentials out of the repository by default.

## License

MIT. See [`LICENSE`](LICENSE).
