# PortfolioForest — final staging and deployment preparation

Review: 2026-10-22. **COMPLETED LOCALLY; REQUIRES MANUAL APPROVAL.**
Staging deployment and production release remain **BLOCKED** by the external
verification/configuration gates below. Cloudflare runtime compatibility is NOT
verified. No account, live database, bucket, secret file, deployment or DNS setting
was accessed. Public documentation was consulted for platform limits only. No
subscription, purchase, upgrade, migration application, real upload/deletion,
writer cutover, evidence import, commit or push occurred.

## Completed locally

- Both prepared staging configs use the exact supplied resources, approved Worker
  names and correct bindings. Production Wrangler files are byte-for-byte unchanged.
- Public Workers endpoints, version preview URLs, staging preview, deletion,
  cleanup, finalization, evidence import and Cron remain disabled.
- Offline packaging now bypasses the production-linked Cloudflare Vite plugin,
  includes the real frontend/public assets and both bundled Workers, copies the
  reviewed migrations and emits a verified file-hash manifest into a new temporary
  directory. It does not invoke Wrangler, infer credentials or read env files.
- A print-only command planner validates that package and emits staging-specific
  commands behind explicit approval gates. It has no command-execution capability.
- Migration 0006's UUID constraint was corrected for D1's shorter GLOB limit without
  weakening canonical UUID, ownership, overlap or state protections.
- Unique portfolio/allocation inserts and deletion marking now accept confirmed
  trigger-inclusive D1 change counts. The SQLite adapter models `total_changes()`
  deltas, matching the installed Cloudflare emulator, and exercises all history
  triggers. Prefix/revision CAS, unique-owner SQL and durable receipts are unchanged.
- A disabled staging-only hosting preview accepts one exact approved workers.dev
  hostname and one server-selected test slug. Relative/root-relative asset paths
  work normally. Request parameters cannot choose another portfolio. Production
  hostname behavior remains intact outside the staging environment.
- Admin links honor the server-reported environment. Staging and unknown contexts
  never emit production customer links; the selected staging preview is the only
  clickable staging website. An explicit staging notice is shown.
- Staging uploads are conservatively capped at 10 files, and each cleanup tick at
  one R2 LIST/DELETE call. Existing unconfigured upload/cleanup limits are preserved.
  Query-budget, boundary and cross-customer tests cover these staging settings.
- Two fake websites plus replacement HTML total **1,501 bytes**. No customer data
  or real signing material was used. A/B share filenames and have distinct content.

## Exact targets and current controls

| Component | Worker | Entry | D1 binding | R2 binding |
| --- | --- | --- | --- | --- |
| Main/API/frontend | `bitreca-main-staging` | `worker/index.js` | `bitreca_db` | `bitreca_media` |
| Hosting | `bitreca-portfolio-hosting-staging` | `portfolio-hosting/index.js` | `PORTFOLIO_DB` | `PORTFOLIO_FILES` |

Both bind D1 **`bitreca-portfolio-staging-db`**, ID
**`c9f87f2a-12fd-45bf-bf94-02e0f1f24d07`**, including `preview_database_id`.
Both R2 primary/preview bindings use **`bitreca-portfolio-staging`**. Both have
`remote:false` for local development; that setting is not a deployment firewall.

Scope:
`portfolioforest/staging/bitreca-portfolio-staging/c9f87f2a-12fd-45bf-bf94-02e0f1f24d07`.

Prepared source configs: `wrangler.portfolio-staging.jsonc` and
`wrangler.portfolio-hosting-staging.jsonc`. Generic `.example.jsonc` files remain
templates; they are not the deployment target. No `bitreca.com` route/custom domain
is attached, and no production resource is substituted. The supplied resource
identities are validated statically; existence/account ownership/contents remain
unverified by this task.

All `*_ENABLED`/production-approval flags are `false`; `workers_dev:false`,
`preview_urls:false`, and `triggers.crons:[]`. The hosting Worker has no cleanup
or admin mutation entry point. No subscription-dependent service was introduced.

## Files changed in this task

| Files | Change |
| --- | --- |
| `wrangler.portfolio-staging.jsonc`, `wrangler.portfolio-hosting-staging.jsonc` | Named Workers, exact preview D1 identity, explicit migration paths, disabled public/version previews, missing auth-version placeholder, staging preview configuration and conservative resource budgets |
| `migrations/0006_create_portfolio_storage_allocations.sql` | Equivalent short UUID GLOB patterns for a fresh D1 schema; no existing database changed |
| `shared/portfolio-staging.js` (new) | Strict opt-in staging hostname/slug selection shared by the Workers and UI |
| `portfolio-hosting/index.js` | Staging preview branch; existing path, publication, deletion and R2 read protections retained |
| `worker/index.js` | Optional bounded file limits before registration/writes; trigger-inclusive D1 metadata compatibility for unique registrations, portfolio creation and marking |
| `worker/portfolio-deletion-config.js` | Sanitized environment/approved-preview metadata for the admin UI |
| `worker/portfolio-deletion-workflow.js` | Optional one-operation cleanup budget; invalid budget fails closed |
| `src/utils/portfolioAdmin.js`, `src/pages/AdminPortfolios.jsx` | Safe staging/unknown-environment links and staging notice; production customer URLs retained in production |
| `scripts/check-portfolio-config.mjs` | Validate the actual staging pair, exact targets/entry points, nested overrides, extra bindings, public pin type and verified auth-version shape |
| `scripts/check-portfolio-ui.mjs` | Staging link/notice assertions and screenshot; existing desktop/mobile scenarios retained |
| `scripts/check-portfolio-migrations.mjs` (new) | Fresh/seeded SQLite-memory migration validation with D1-sized GLOB evaluation |
| `scripts/prepare-portfolio-staging.mjs` (new) | Offline package creation/verification, public-file allowlist, safe paths, no-overwrite output and SHA-256 inventory |
| `scripts/portfolio-staging-plan.mjs` (new) | Print-only guarded migration/auth/deploy command preparation |
| `scripts/prepare-portfolio-fixture.mjs` (new) | Tiny isolated A/B static fixtures and replacement HTML |
| `tests/portfolio-config.test.js`, `tests/portfolio-deletion.test.js` | Isolation/Free-budget boundaries, trigger-aware SQLite adapter and expanded full lifecycle with a second owned portfolio |
| `tests/portfolio-staging.test.js` (new) | Host/slug fencing, staging links, migration portability, package-path/quoting and tiny-fixture checks |
| `package.json` | Added staging/migration/fixture commands and included staging tests in regression suite; dependencies unchanged |
| `docs/portfolio-deletion-operations.md`, `docs/portfolio-writer-cutover.md`, `docs/portfolio-release-readiness.md`, this report | Correct empty-staging migration order, latest compatibility findings and final approval checklist |

All other existing local work remains preserved. In particular, production
`wrangler.jsonc`/`wrangler.portfolio-hosting.jsonc`, existing data, secrets and the
marketing/shared-layout source were not modified in this task. No new migration
number was added; 0012 and 0013 remain unapplied to existing databases.

## Validation and local artifacts

**280 regression tests passed**, zero failures/skips/cancellations. Coverage includes
authentication/version rotation, slug reuse, exclusive ownership, HTML asset and
metadata preservation, concurrent activation/publication/deletion, uncertain and
legacy writers, partial/lost-response cleanup, competing leases, finalization,
tombstones, migration preservation, new staging targets and resource budgets.

The full lifecycle now starts with standalone HTML, then folder upload, publishing,
HTML replacement, another update, unpublish, deletion during an in-flight write,
mutation fencing, writer settlement, interrupted cleanup recovery and finalization.
A second independently allocated portfolio with the same filenames remains intact.

Fresh AND seeded migrations 0001–0013 passed exclusively in SQLite `:memory:` with
foreign-key/integrity/default/constraint checks. GLOB evaluation was constrained
to D1's documented limit. These are portability checks, not D1 integration results.

Full-project ESLint, 18 Worker/shared/script syntax checks, static configuration
validation, in-memory production client/Worker compilation and `git diff --check`
passed. The strict full-readiness check correctly refuses remaining placeholders.
Tracked-secret filename and ignore checks passed; no full Git-history/content
secret scan or secret-file read was performed.

Real installed headless Chromium passed desktop/mobile layout, dialogs/focus,
search/filter/edit, upload locks/failures, HTTP 409 refresh, publication warnings,
creation/publishing, typed deletion, pending locks, truthful blocked/finalized job
states, expired-session redirects and staging-only preview links. All HTTP APIs
used a loopback fixture. Screenshots were reviewed. No Safari, Firefox, actual
remote cookies, provider runtime, latency, billing or production tests occurred.

Review package produced locally:
`C:\Users\cezar\AppData\Local\Temp\portfolioforest-staging-release-mtRAJd`.
It contains 23 hashed files plus `deployment-artifact.json`; SHA-256 of that artifact:
`cce5d3c46bb8670587721912218dfb463f95517371ea66780384eb61fc8e0cc6`.
Main Worker: 71,397 bytes / 16,833 gzip bytes; hosting: 3,305 / 1,495.
This is a sealed review package with placeholders, NOT approved for deployment.
Rebuild/review after supplying legitimate public configuration. Temporary artifacts
are not backups and can disappear through normal OS maintenance.

Tiny fixture directory:
`C:\Users\cezar\AppData\Local\Temp\portfolioforest-tiny-fixture-MvCIX4`.
Browser captures:
`C:\Users\cezar\AppData\Local\Temp\portfolioforest-ui-koXSE5`.
All are outside the repository; no previous artifact or user file was deleted.

Safe commands available now:

```powershell
npm run test:portfolio
npm run lint
npm run check:portfolio-config
npm run check:portfolio-migrations
npm run check:portfolio-build
npm run check:portfolio-ui
npm run prepare:portfolio-staging
npm run prepare:portfolio-fixture
node scripts/prepare-portfolio-staging.mjs --verify '<reviewed-package-directory>'
node scripts/portfolio-staging-plan.mjs '<reviewed-package-directory>'
git diff --check
```

The last planner only prints commands. Never use the root `npm run preview`,
`npm run build` or `npm run deploy` for staging: that Vite integration still
selects the production configuration and was intentionally left unchanged.

## Migration plan and the 0006 portability correction

New staging is treated as empty until an independently approved read establishes
otherwise. It needs **all migrations 0001 through 0013**, not only 0012/0013.
Existing LOCAL 0001–0011 history is user-reported and was not opened; local history
does not transfer to the remote staging database.

The old 0006 expression concatenated a UUID character-class GLOB longer than D1
allows. The correction splits exact version/variant/hyphen shape, 32 hexadecimal
characters, and lowercase alphabet checks into short patterns. Existing SQLite
records and their applied schema were NOT changed. Do not rerun 0006 against an
already-migrated database or delete/edit its migration history. If any remote
database already applied the older 0006, STOP: inspect that schema and design a
separately reviewed corrective migration rather than pretending the file edit
updated it. Production history remains unknown.

Wrangler 4.139.0's installed source shows `d1 migrations list` calls
`initMigrationsTable`; it can write even while listing. Initial strictly read-only
review should use `d1 execute` with explicit SELECTs over `sqlite_master`, followed
by SELECT of migration names only if its tracking table exists. No remote command
was run here.

The print-only planner emits:

- Metadata-only inspection and conditional migration-history SELECT.
- Staging-only export to a new private backup file outside the package/repository.
- Separately gated tracking-table initialization/list and migration application.
- Public auth/protocol/policy version reads and integrity/foreign-key checks.
- Sealed Worker deployment and interactive staging secret configuration.

Every command includes the exact staging database name and an absolute, verified
package config; there is no `--env`, implicit root config or production DB fallback.
The package verifier refuses mismatched targets, changed hashes and extra files.
This prevents accidental selection within the reviewed workflow; a privileged
operator can still bypass it, so account identity and permissions must be checked.

## Deployment commands — NOT EXECUTED

The exact quoted commands are produced by the planner above. For review only,
the essential form is below; set these variables only to a freshly verified package
and the installed repository CLI. No command in this block was executed:

```powershell
$stagePackage = '<reviewed-package-directory>'
$stageConfig = Join-Path $stagePackage 'main.wrangler.jsonc'
$hostingConfig = Join-Path $stagePackage 'hosting.wrangler.jsonc'
$wranglerCli = 'C:\Users\cezar\Desktop\bitreca-website\node_modules\wrangler\bin\wrangler.js'
# First verify package hashes and exact targets with the offline tools.
Push-Location -LiteralPath $stagePackage
# READ APPROVAL: inspect sqlite_master before reading a possibly absent history table.
node $wranglerCli d1 execute bitreca-portfolio-staging-db --config $stageConfig --remote --command "SELECT name,type FROM sqlite_master ORDER BY type,name;"
# WRITE APPROVAL: the list command may create d1_migrations.
node $wranglerCli d1 migrations list bitreca-portfolio-staging-db --config $stageConfig --remote
# APPLICATION APPROVAL: all pending 0001–0013 on verified empty staging; no --yes.
node $wranglerCli d1 migrations apply bitreca-portfolio-staging-db --config $stageConfig --remote
# READ APPROVAL, after migration 0004 exists:
node $wranglerCli d1 execute bitreca-portfolio-staging-db --config $stageConfig --remote --command "SELECT admin_id,auth_version FROM admin_auth_state;"
# DEPLOYMENT APPROVAL: sealed endpoints and all destructive controls remain off.
node $wranglerCli deploy --config $stageConfig --no-bundle
node $wranglerCli deploy --config $hostingConfig --no-bundle
# SECRET APPROVAL: interactive input only; do not append values or use shell history.
node $wranglerCli secret put ADMIN_USERNAME --config $stageConfig
node $wranglerCli secret put ADMIN_PASSWORD --config $stageConfig
node $wranglerCli secret put SESSION_SECRET --config $stageConfig
Pop-Location
```

Deploy the package, not raw source via the production Vite integration. The package
has no build hook, bundles dependencies already, includes SPA assets, and keeps
`/api/*` Worker-first. Neither endpoint is publicly reachable while workers.dev and
routes are off. Recheck actual bindings and disabled settings after every deployment
or secret change. A successful local package is not proof Wrangler/provider accepts
the configuration or that its runtime fits the account plan.

## Authentication and public access prerequisites

Configure unique staging `ADMIN_USERNAME`, strong `ADMIN_PASSWORD`, and random
`SESSION_SECRET` through separately approved interactive secret input or an existing
secure secret manager. Do not reuse production values, put them in JSON/shell
arguments, or send them in chat. This task read/generated no real secrets.

`ADMIN_AUTH_VERSION` remains `REPLACE_VERIFIED_STAGING_AUTH_VERSION`. Migration 0004
seeds 1 on a genuinely fresh schema, but read the authoritative row AFTER applying
the migrations; do not assume the created resource is untouched. Set the public
staging variable to the verified positive integer. A missing/mismatched version
fails closed. On rotation, advance D1 monotonically and configure all authorized
Workers consistently; old sessions and old deployments must fail.

Verify HTTPS login, independent sessions, eight-hour absolute expiry, logout/replay,
legacy-cookie rejection, origin mismatch rejection, D1 failure behavior and Secure /
HttpOnly / SameSite=Strict / host-only cookies in actual staging later. No cookie or
runtime result was inferred from the loopback browser mocks.

The application still has no durable login rate limiter. Review an available
zone-level rate-limiting rule on the EXISTING Cloudflare plan for production login;
do not purchase/enable an upgrade. Zone protection must not be assumed to cover a
workers.dev hostname. If existing private-access controls are available without a
new subscription, review them for staging; otherwise keep endpoints sealed until
a separately approved exposure/rate-limit plan is accepted. A strong password alone
does not prevent quota exhaustion. No Access subscription or paid service was added.
See the public [rate-limiting documentation](https://developers.cloudflare.com/waf/rate-limiting-rules/)
and independently verify current account availability before any configuration.

## Hosting verification without production routes

No DNS/custom-domain change is needed for the prepared code. Under separate public
access approval, use the provider's exact existing account workers.dev hostname;
the account subdomain is unknown here and must NOT be invented. The expected
hosting pattern is `bitreca-portfolio-hosting-staging.<approved-account>.workers.dev`.
Review enabling only the TWO staging workers.dev endpoints. Keep version-preview
URLs and all production routes/domains off. If provider setup asks for a purchase or
new subscription, stop rather than accept it.

Only after access approval, configure both staging Workers with the same
`PORTFOLIO_STAGING_HOSTNAME`, one exact `PORTFOLIO_STAGING_PREVIEW_SLUG`, and
`PORTFOLIO_STAGING_PREVIEW_ENABLED=true`. This is a staging preview switch, not
deletion enablement. The source configs deliberately retain `false`. The strict
source checker intentionally rejects enabled execution/access settings; keep any
separately reviewed activation record distinct from this disabled review baseline.

The hosting Worker then maps `/`, `/assets/style.css`, `/assets/app.js`, etc. to
only that selected test slug. There is no client-selected slug, shared preview cookie,
HTML rewrite or redirect to bitreca.com. Unpublish/marking/finalization still fence
hosting. Selecting the other test portfolio is a separate reviewed change to both
Workers' preview metadata. Use fresh browser/site data between A/B checks to avoid
cached pages or a prior site's service worker. The original `/health` probe should
be used before preview activation; once mapping a website, verify its root/assets.

## Trusted inventory, identity and cutover prerequisites

The trusted key and metadata procedures remain in
[portfolio-deletion-operations.md](portfolio-deletion-operations.md) and
[portfolio-writer-cutover.md](portfolio-writer-cutover.md). They are approval-gated
procedures, not facts established by the mocks.

- Obtain an independently controlled STAGING P-256 verifier public key through a
  trusted channel. Keep its private key outside the repository, Worker and chat.
  Supply base64 DER SPKI in `PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI`; its SHA-256 pin
  must agree with the D1 runtime authorization when cleanup is later approved.
- The deployment evidence must cover the genuine reviewed package/artifact bytes,
  exact storage scope/bindings, deployed versions, all possible portfolio writers,
  rollback targets and definitive legacy-writer settlement. The offline signing
  utility verifies signatures/digests; it cannot discover whether the audit is true.
  Never sign/import fabricated evidence or infer ownership from an ID/slug/name.
- Independently inspect the newly dedicated bucket/database and write-capable
  deployments/credentials. Empty storage alone is not proof no delayed PUT exists.
  Freeze mutations, prove drain/settlement, and only then separately authorize the
  monotonic writer minimum 1. No cutover occurred in this task.
- After that separate approval, independently sign and import the genuine epoch
  using the pinned key/scope and the gated authenticated evidence endpoint. Turn
  import off afterward. `deployment-artifact.json` can be the exact `--deployment`
  artifact only after its files and the actual deployed configuration are verified.
- **Create A/B only AFTER that verified epoch and cutover** if they will participate
  in automatic cleanup. Portfolios born earlier stay legacy-blocked; a later policy
  switch cannot retrofit complete provenance. Avoid creating unnecessary pre-epoch
  objects that would deliberately remain blocked and incur retained storage.
- Under separate R2 WRITE approval, provision the zero-byte control object
  `__portfolioforest_control__/storage-identity` ONLY in the staging bucket. Its
  custom metadata must be exactly the staging `environment`, `storage_scope`,
  `bucket_name` and `database_id` specified above. Use a reviewed provider/S3/native
  R2 provisioning method with staging-only permissions and read back HEAD metadata;
  stop on an existing mismatched object rather than replacing it. No provisioning
  command, credentials or object write was executed or fabricated here.
- After deletion marking freezes a test portfolio, the dispatcher independently
  re-verifies its signed origin, root seal, complete ordered ownership history and
  every closed writer. All batches must be acknowledged, prefixes independently
  empty and storage receipts valid before the separately authorized finalization.
  No `prepared` phase, timeout, lease expiration or empty listing can substitute.

Open writers wait; uncertain/untracked writers, incomplete/legacy provenance and
inventories above 2,000 allocations stay blocked. Retry never closes a writer or
claims ownership. There is no automatic legacy reconciliation, unsafe override,
direct run-cleanup HTTP endpoint or cancellation of a marked portfolio.

## End-to-end staging test procedure — NOT EXECUTED

Run only after the distinct approvals above, with budget headroom confirmed and
fake fixture files. Keep deletion/Cron off until the indicated cleanup approval.

1. Log into the approved staging Admin over HTTPS; verify the staging notice,
   authenticated API, disabled Delete state and absence of production customer links.
2. Confirm the independently verified writer epoch predates both new test portfolios.
   Create A and B with unique test slugs; record their immutable numeric IDs privately.
3. Upload A's standalone `index.html`. Then upload A's four-file website folder.
   Publish A and select ONLY A for the explicitly approved staging hosting preview.
4. Verify the root, root-relative CSS/SVG and relative script load under the staging
   hostname. No request should be sent to a customer hostname or production R2.
5. Upload `html-replacement/index.html`; verify the new heading and unchanged CSS,
   JavaScript/image bytes using the fixture hashes. Old versions must remain present.
6. Upload B's folder with identical filenames/different bytes. Preserve its expected
   hashes. Verify B through a separately selected preview, then return selection to A.
7. Unpublish A and verify root/asset access is denied. B's publication/data must be
   unaffected. Verify delayed publication/upload conflicts and invalid inputs safely.
8. With separate marking approval, enable only deletion requests for staging. Type
   A's exact ID in the confirmation dialog. Verify one durable job, immediate offline
   state, locked editing/publication/uploads, origin/auth enforcement and idempotency.
9. Read only A's ownership/writer/job metadata. All registered writers must be
   definitively closed; failed/uncertain evidence must be preserved, not edited away.
   Lack of the immutable inventory proof while execution is off is not permission
   to fake it. The authorized dispatcher establishes it before touching storage.
10. With separate cleanup and schedule approval, verify staging sentinel, public pin,
    scope, D1 policy revision and budget; enable only the reviewed staging controls.
    Keep finalization off initially. Use one deliberately low-cadence approved Cron
    within existing free capacity. No trigger is configured by this task.
11. Observe bounded durable manifests and acknowledgements. Pause/revoke approval
    between invocations, then requeue safely to exercise resume. Do not deliberately
    corrupt production data, force writer closure or infer completion from elapsed
    time. A real ambiguous PUT should block rather than be manufactured into closed.
12. Verify every exclusively owned A allocation, including old/failed versions, has
    an empty-prefix receipt and the whole storage receipt. Check B's exact objects/
    hashes remain unchanged and the control object remains. Do not scan other buckets.
13. Only then separately approve finalization in BOTH env and D1. Queue safe recheck
    if needed. Verify A's row disappears atomically, final receipt exists, immutable
    allocations/tombstones/history survive, and replay cannot remove B or reuse A's
    storage prefix. UI may show permanent deletion only from the final receipt.
14. Compare A/B object counts/bytes and provider usage metadata. Metrics may lag;
    rely on exact-prefix empty receipts plus independent stage checks, not a graph
    alone. Disable staging deletion, schedule, preview and public endpoints after
    the approved test window. Retain evidence and unresolved states for review.

The raw fixtures are far below 5 MB even with several test versions. No production
customer data should ever be copied into staging. Any legacy/ownership conflict,
unsettled writer, quota error, unexpected object or identity mismatch is a STOP
condition for that job; independent non-destructive checks may continue.

## Free-tier and charge constraints

Public documentation checked during this review lists Workers Free at 100,000
requests/day, 10 ms CPU per invocation including Cron, and 50 subrequests; network
waiting is excluded from CPU. These are account limits, not extra staging capacity.
See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
The conservative package-size check is not a substitute for actual provider sizing.

D1 documents 50 queries/invocation on Free, 500 MB/database and a 50-byte GLOB pattern
limit. Its free daily read/write allowances and shared usage must be checked before
staging activity. SQLite speed does not prove provider CPU/query performance. See
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and the
[free-limit enforcement notice](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/).

The staged 10-file cap bounds both R2 work and per-write D1 checks; larger HTML-copy
inventories reject before new writes. Cleanup's one-operation setting reserves
query headroom for 20 inventory pages. Tests account for SQL plus storage calls,
including finalization, but do not prove CPU fits Free. The default unconfigured
100-file upload behavior is retained for compatibility and is NOT certified for
Free; before a production Free launch, separately approve the conservative limit
or implement/test a resumable upload design. No paid plan is assumed as a solution.

R2 storage/operation headroom and billing configuration are UNVERIFIED. Public
pricing lookup could not be completed reliably here, so no numeric R2 allowance or
zero-charge guarantee is asserted. Independently inspect the EXISTING account's
current [R2 pricing/allowances](https://developers.cloudflare.com/r2/pricing/) and
shared usage before any real upload, HEAD, LIST, DELETE or polling test. If headroom
or zero-additional-charge operation cannot be established, keep that test blocked;
do not subscribe, upgrade or silently enable billing. Tiny files reduce work but
cannot guarantee cost when an account allowance is already exhausted.

Avoid unbounded scans, object bodies during cleanup, extra Cron slots, rapid polling
and repeat builds/deployments. Watch metadata-only rows read/written, CPU, error 1102,
request totals and R2 operations. If Free proves insufficient, stop/optimize the
affected feature; no paid upgrade is authorized.

## Rollback, production prerequisites and remaining blockers

Use compatible roll-forward fixes after cutover. Do not restore an old D1 backup
into service without current auth/protocol versions and retained tombstones. A D1
backup cannot restore deleted R2 bytes. Disabling flags/revoking D1 policy prevents
additional calls, not already-issued operations; preserve manifests and receipts.
Never downgrade protocol/auth versions, delete ownership records, or roll back to
untracked writers to restore availability.

Before production: successful approved staging integration on the actual Free
account, verified CPU/query/operation headroom, production-specific migration/schema
review and backups, strong auth and suitable login-abuse protection, independently
pinned production signing trust/scope, proven legacy drain, staged route rollout and
separate approval for every production flag/Cron change. None of the staging resource
IDs, keys, signatures or identity objects may be reused as production evidence.

Production customer URLs remain branded. Old HTML can still fetch assets after an
activation; no-store and confirmation warnings do not guarantee cross-version
consistency. Require content-hashed/backward-compatible assets or a maintenance
unpublish window for incompatible updates. Hosting's existing CSP/path/extension
restrictions still apply; verify real customer sites independently before publishing.

Remaining placeholders: verified staging auth version; independent public SPKI pin;
exact approved hosting workers.dev hostname; selected fake-portfolio slug. Missing
external facts: account identity/plan/usage, actual resource isolation/contents,
migration history/applied schema, secrets, access/rate-limit controls, runtime
acceptance/performance, genuine writer audit/epoch, identity object and approvals.

**READY FOR STAGING** means the local code, fixtures and disabled package can be
reviewed for a separately authorized integration trial; it does not mean deploy or
delete now. **BLOCKED** means actual deployment/access/cleanup cannot proceed until
its specific facts and approval are supplied. No paid workaround is pre-approved.

## One ordered user approval checklist

1. Review the local changes, portable 0006 correction, known limits and immutable
   staging package. Approve metadata-only account/resource/billing verification;
   confirm the exact supplied D1/R2 resources and sufficient existing free headroom.
2. Approve staging-only read-only schema/migration-history inspection. If not empty
   or if old 0006 is already applied remotely, stop and review its schema/repair plan.
3. Approve a private staging backup and separately authorize all pending 0001–0013
   on the verified target. Read back integrity, public auth version and disabled policies.
4. Supply legitimate public configuration and configure unique staging secrets through
   an approved secure channel; never send their values in chat. Rebuild/verify the
   disabled package and approve ONLY the two named staging deployments.
5. Approve an existing-plan access/rate-limit strategy and exact staging-only public
   endpoint/preview settings. Do not add production routes or a new subscription.
6. Independently audit/drain staging writers, approve cutover and genuine evidence
   signing/import, and approve provisioning/readback of the staging identity object.
   Keep destructive execution off and create cleanup-test portfolios only afterward.
7. Approve the tiny A/B workflow, then marking, then bounded cleanup/Cron, and finally
   finalization as separate controlled stages. Verify B, receipts and usage; turn the
   test controls off afterward. Stop on uncertainty or any unapproved cost.
8. Review actual staging results and unresolved production risks. Only a NEW explicit
   production authorization may permit production migration/config/deployment or
   destructive enablement. No such authorization exists in the current task.
