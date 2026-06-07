# Security policy

TokenManager handles high-value session and admin credentials. Treat all diagnostics, screenshots, exports, and runtime databases as sensitive unless you have verified otherwise.

## Supported versions

This repository currently tracks the active `main` branch. Security fixes are expected to land on `main` first unless maintainers publish a separate release policy.

## Reporting a vulnerability

Do not paste tokens, cookies, session exports, database files, request headers, or private deployment URLs into public issues.

Preferred reporting path:

1. Use GitHub private vulnerability reporting if it is enabled for the repository.
2. If private reporting is not available, open a minimal public issue that describes the affected component at a high level and asks for a private contact path.
3. Include reproduction steps only after removing secrets and replacing private hosts with `example.com` or local loopback addresses.

## What to redact

Always redact:

- ChatGPT session JSON
- Codex `auth.json`
- access tokens, refresh tokens, ID tokens, and session tokens
- sub2api Bearer tokens, API keys, JWT secrets, admin emails, and passwords
- `server/.env`
- SQLite runtime databases
- cookies and request headers
- private domain names, IP addresses, server hostnames, and SSH aliases
- screenshots containing account lists, token previews, or deployment metadata

## Hardening checklist

For production deployments:

- Run TokenManager behind HTTPS.
- Keep sub2api admin credentials server-side.
- Use a long random `TOKENMANAGER_SESSION_SECRET`.
- Use a different long random `TOKENMANAGER_ENCRYPTION_KEY`.
- Store `server/.env` outside git and with restrictive permissions.
- Keep `TOKENMANAGER_FRAME_ANCESTORS` as narrow as possible.
- Rotate credentials immediately after accidental disclosure.
