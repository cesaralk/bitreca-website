# Bitreca

React/Vite website with Cloudflare Workers, D1 and R2. Production source includes
PortfolioForest, Bitreca Admin, authentication, portfolio creation/upload/publishing
and protected permanent deletion.

## Local development

Install dependencies with npm ci, then use npm run dev. Other maintained commands
are npm run build, npm run lint and npm run test:portfolio. The existing UI/build
and migration checks remain available in package.json. No test or build command
was run as part of the project cleanup.

The two production configs are wrangler.jsonc and wrangler.portfolio-hosting.jsonc.
Development bindings retain remote:false and isolated preview placeholders. Never
point a preview/test binding at production storage or commit secret values.

## Deletion and recovery

Start with [production handover](docs/deletion-live-activation.md),
[operations](docs/portfolio-deletion-operations.md) and
[writer authorization/recovery](docs/portfolio-writer-cutover.md). Keep all forward
migrations and reusable security tests. Encrypted keys, signed production evidence
and essential recovery receipts belong outside Git.

Historical disabled configs are test data under
tests/fixtures/retired-environments/. Supporting staging-named modules remain when
production safeguards, regression tests or offline owner-key procedures import them.
They are not approval to recreate or operate retired environments.

GitHub main pushes can trigger Cloudflare production builds. Local cleanup commits
are not deployment authorization; do not push or run deployment/migration/signing
commands without the owner's separate approval. Historical source remains in Git.
