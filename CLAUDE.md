# Project context for Claude

Personal wall dashboard for an old Android 5.0.2 tablet. **Read `docs/00-overview.md` first**, then the doc for the area
you are touching. `docs/08-implementation-plan.md` defines phases and commit granularity.

Rules:

- The repo is **public**. Never commit secrets, tokens, real hostnames, coordinates/city-level personal data, real calendar/task
  content or exported layouts. Use fictional fixtures. See `docs/06-security-and-public-repo.md`.
- `apps/display` targets Chrome 95 (Android 5 tablet, see `docs/tablet-compat-results.md`): no APIs newer than Chrome 95.
  The spike page (`apps/display/public/spike*.js`) stays plain ES5.
- Code, comments, identifiers in English. UI strings via `packages/shared` i18n (SK + EN).
- Conventional Commits; one logical change per commit; run lint + tests + gitleaks before committing.
- Do not add TODO comments unless asked. Keep code readable, avoid over-engineering.
