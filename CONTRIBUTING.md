# Contributing

Thanks for improving TokenManager. This project touches sensitive account and token workflows, so small, reviewable changes and careful redaction matter.

## Development setup

No dependency install is required for the current test suite. Use Node.js and Python 3 from your system.

Run the standard checks from the repository root:

```bash
node -c docs/app.js
node -c server/tokenmanager-bff.js
node tests/convert-session.test.js
node tests/tokenmanager-bff.test.js
git diff --check
```

## Pull request guidelines

- Keep changes focused and easy to review.
- Add or update tests for behavior changes.
- Do not commit generated account JSON, session exports, runtime databases, logs, screenshots with tokens, or local `.env` files.
- Use `example.com`, `127.0.0.1`, or placeholders for documentation examples.
- Avoid hardcoding personal domains, private server paths, SSH aliases, account emails, or real provider credentials.
- For UI changes, preserve keyboard accessibility and clear destructive-action confirmations.

## Security-sensitive changes

If a change touches authentication, cookies, CSP, iframe policy, runtime config encryption, proxy allowlists, or secret redaction, include a short security note in the PR summary and run the full test suite.

Before publishing a branch, review potential leaks:

```bash
git status --short --ignored
grep -RInE "Bearer |access_token|refresh_token|sessionToken|PASSWORD=|SECRET=|API_KEY=|https?://[^ ]+" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules
```

The matches should be placeholders, tests, or documentation examples only.
