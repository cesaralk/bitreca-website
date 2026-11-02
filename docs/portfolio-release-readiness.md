# Bitreca / PortfolioForest — Phase A release readiness

This is the earlier Phase A baseline report. The current staging names, migration
0006 portability correction, 280-test validation and deployment approval plan are
in [portfolio-staging-release-checklist.md](portfolio-staging-release-checklist.md).
The newer report supersedes this document's staging migration/deployment guidance.

Review date: 2026-10-22. Classification: **BLOCKED — NEEDS MANUAL CONFIGURATION**.

The Phase A implementation is available for an independently isolated staging
trial after the prerequisites below. This is NOT a production-ready certification.
No Cloudflare account, existing database, bucket, secret file or live deployment
was accessed. No migrations were applied, no real storage/portfolio records were
deleted, and no commit, push, deployment, writer cutover or Cron activation occurred.

## Completed development phases

| Phase | Result |
| --- | --- |
| Safety audit | Reviewed schema, authentication, uploads, hosting, ownership, writer tracking, cleanup and finalization; corrected unsafe preview alias in source |
| Trusted inventory | Offline signing/verification tool; independently pinned public-key/scope configuration; gated evidence import; complete-history attestation retained |
| Cutover readiness | Drain/cutover/recovery checklist; gate left at its existing setting; no signed live evidence fabricated |
| Backend connection | Disabled-by-default orchestrator joins marking, inventory, writer settlement, bounded cleanup and atomic finalization |
| Scheduling/retries | Disabled scheduled handler, durable dispatcher, conditional leases, bounded selection, backoff and safe admin retry |
| Admin redesign | Responsive branded cards, search/filter/pagination, protected upload/publish controls, typed deletion dialog and actual job evidence |
| Isolated tests | Complete mock workflow, migration preservation, failure/replay/concurrency tests, real-browser fixture and offline build |
| Readiness review | This report and the operator/cutover runbooks; external prerequisites remain explicit |

## Changes made in this task

Existing working-tree changes were preserved. The following files were added or
changed during this master task; an untracked file is not assumed to have been
created by this task unless listed as new here.

| Files | Change |
| --- | --- |
| `.gitignore` | Added scoped operator-material/private-key ignores; preserved prior local ignores |
| `eslint.config.js` | Lint offline `.mjs` tools; exclude the already-existing generated `.build-check-portfolio-admin` bundle |
| `package.json` | Added safe isolated test/config/build/browser/evidence commands; dependencies and deploy/preview scripts unchanged |
| `wrangler.jsonc`, `wrangler.portfolio-hosting.jsonc` | Explicit local-only development bindings; separate preview bucket name; main deletion flags off and no Cron |
| `wrangler.portfolio-staging.example.jsonc`, `wrangler.portfolio-hosting-staging.example.jsonc` (new) | Matching unprovisioned staging templates with placeholders, disabled controls and no routes/Cron |
| `migrations/0013_add_portfolio_deletion_dispatch.sql` (new) | Disabled authoritative execution policy and durable dispatch leases/retries/progress; unapplied |
| `worker/index.js` | Connect authenticated deletion administration and disabled scheduled orchestration; gate marking and require exact-ID confirmation; include job ID in portfolio metadata |
| `worker/portfolio-deletion-config.js` (new) | Public trust/resource identity validation, production/staging separation checks, independent D1 approval and guarded storage adapter |
| `worker/portfolio-deletion-workflow.js` (new) | Bounded durable dispatcher, eligibility/attestation, writer waiting, cleanup/finalization connection and safe retry |
| `worker/portfolio-deletion-api.js` (new) | Authenticated capabilities, cursor-paginated job history, sanitized dispatch status, retry and separately gated evidence import |
| `worker/portfolio-inventory.js` | Export reusable signature verifier for offline tooling; existing strict evidence/history protections preserved |
| `worker/portfolio-finalization.js` | Optional authoritative revision predicate used by the connected workflow inside finalization SQL |
| `worker/portfolio-cleanup-executor.js` | Updated obsolete disconnected-entry-point comment; destructive algorithm preserved |
| `src/pages/AdminPortfolios.jsx`, `src/pages/AdminPortfolios.css` (new CSS) | Dashboard and accessible confirmation dialogs; pending-operation locks and truthful progress |
| `src/utils/portfolioAdmin.js` (new) | Testable state, address, folder-path, concurrency and immutable finalization-display helpers |
| `src/utils/adminApi.js` | Explicit same-origin credentials/no-store default; existing unauthorized redirect remains compatible |
| `scripts/portfolio-evidence.mjs` (new) | Offline independently controlled P-256 evidence signing/verification; private keys kept outside repository |
| `scripts/check-portfolio-config.mjs` (new) | Static disabled-default and staging isolation contract checks; no provider access |
| `scripts/check-portfolio-build.mjs` (new) | In-memory Vite client and esbuild Worker checks bypassing Cloudflare plugin and env files |
| `scripts/check-portfolio-ui.mjs` (new) | Installed headless Chromium, loopback mock API, interaction checks and temporary screenshots |
| `tests/portfolio-deletion.test.js` | Extended in-memory migration, connected workflow, dispatch, evidence and fault tests |
| `tests/portfolio-admin.test.js`, `tests/portfolio-evidence.test.js`, `tests/portfolio-config.test.js` (new) | Isolated frontend helper, signing and configuration regressions |
| `docs/portfolio-storage-inventory.md` | Updated integration status and operator-tool references |
| `docs/portfolio-writer-cutover.md`, `docs/portfolio-deletion-operations.md`, this report (new) | Cutover, identity/signing/activation/recovery and release instructions |

Pre-existing local changes retained without additional logic changes in this task:
`portfolio-hosting/index.js`, migrations `0004`–`0012`,
`worker/portfolio-cleanup-state.js`, `tests/admin-sessions.test.js`,
`tests/portfolio-publication.test.js`, and `tests/portfolio-allocations.test.js`.
The hosting deletion-marker predicate and post-R2 recheck were reviewed and tested.
No marketing-page or shared admin-layout redesign was performed. A generated build
directory already present before this task was preserved, not removed or overwritten.

## Safety and race assessment

**Ownership:** New portfolios get random immutable initial UUID storage; creation
checks an empty namespace and registers its root seal atomically. Every later
folder/HTML allocation has immutable exclusive ownership before writes. Canonical
UUID prefixes, overlap guards and retained tombstones prevent reassignment/reuse.
No slug, prefix resemblance or timestamp confers legacy ownership.

**Inventory:** Signed deployment/drain evidence is checked against server-pinned
P-256 public trust and exact resource scope. Birth epoch, immutable nonce/root seal,
ordered allocation history, source ownership, closed writers and frozen inventory
revision must all agree. Snapshot verification is paged and bounded to 2,000
allocations, including failed/conflicted uploads. Larger inventories fail closed;
they need a separately reviewed verifier extension, never truncation.

**Uploads:** Existing HTML/path/type/size validation and CAS activation remain.
HTML replacements copy assets/metadata into a new version; folder uploads replace
the full website. A marker stops additional issuance and activation, while an
already-issued PUT may finish. Its writer remains open/uncertain until definitive
settlement. An interrupted worker or rejected/ambiguous R2 promise never becomes
closed through age, timeout, lease expiry or an admin retry.

**Publication/hosting:** Root HTML must be readable before publishing, and status
updates compare prefix and publication revision. Unpublish increments revision
even when already draft. Marking atomically unpublishes and freezes mutation;
hosting checks the marker before and after the R2 await. Responses already sent,
downloaded pages and active streams cannot be recalled. Serving reads fail closed
on D1 errors; customer responses use no-store in the current hosting implementation.

**Cleanup:** The only connected execution path requires environment opt-in,
matching authoritative D1 revision/resource/key pin and a matching bucket identity
HEAD. It only lists exact verified allocations. Every returned key is validated;
immutable bounded manifests precede DELETE; uncertain outcomes replay the same
manifest without counting attempts as additional removed objects. Multiple cleanup
workers use token/generation fences. An already-issued stale DELETE can settle,
but cannot delete a reused prefix or update another worker's receipts.

**Finalization:** A separate flag and D1 permission are required. The connected
function rechecks authorization revision inside its final SQL. Complete trusted
inventory, settled writers, manifest acknowledgements, empty-prefix receipts and
storage receipt plus an active matching cleanup lease are required. Receipt insertion,
portfolio deletion and lease release are atomic. Lost responses replay permanent
evidence. Registry ownership, job/history/receipt rows and tombstones survive.
`prepared`, an empty listing alone or elapsed time cannot finalize anything.

## Migration order and database prerequisites

The user reports LOCAL migrations 0001–0011 already applied. That existing database
was intentionally not opened or verified. All 0001–0013 were applied sequentially
only in disposable SQLite memory with foreign keys enabled. Existing portfolio and
allocation data survive, with integrity/relationship checks in the regression suite.

For a separately authorized database whose applied history is confirmed through
0011, the next order is:

1. `0012_add_trusted_storage_inventory.sql` — existing unapplied migration; no birth
   history backfill, no cutover and no live epoch/certification inserted.
2. `0013_add_portfolio_deletion_dispatch.sql` — new unapplied additive migration;
   disabled runtime singleton and dispatch metadata for existing/new immutable jobs.

Migration 0013 does not alter existing ownership, writers, receipts or deletion
guards. Its policy updates must advance revision exactly once. Migration 0012 is
required before current portfolio-creation SQL; both migrations are prerequisites
before this connected Worker is deployed. Production migration history is UNKNOWN:
do not assume it matches local, skip migrations, or apply these blindly. Existing
earlier migration files were not rewritten. Back up and review the target history
under separate authorization before any application.

## Trusted key, cutover and legacy prerequisites

Follow [portfolio-deletion-operations.md](portfolio-deletion-operations.md) for the
exact environment scope, public SPKI pin, sentinel metadata, evidence tool commands
and conditional runtime policy template. The private signing key is never placed
in the Worker/repository or sent to the evidence endpoint. No actual key, epoch,
ownership evidence, credentials or secret values were generated/imported here.

Follow [portfolio-writer-cutover.md](portfolio-writer-cutover.md) before changing
the minimum from 0 to 1. Drain mutation ingress; remove legacy deployments/traffic
splits; account for all external R2 credentials; independently establish that every
untracked writer has settled. D1 cannot cancel legacy direct PUTs. Never use a
waiting period as proof or roll back to an untracked deployment after cutover.
Only portfolios born AFTER an independently verified epoch and cutover can receive
automatic complete-inventory attestation. An earlier UUID alone is insufficient.

Legacy portfolios continue normal hosting/uploads under existing rules. Their
permanent deletion remains blocked unless independent complete provenance can be
established through a separately designed reconciliation workflow. There is NO
automatic legacy adoption or unsafe override. Marking such a portfolio still makes
it offline/frozen if deletion requests are explicitly enabled; it may remain blocked
and incur storage charges. Explain this restriction before enabling that control.

## Staging, preview and production separation

Audit found `wrangler.portfolio-hosting.jsonc` pointing its preview bucket at the
same `bitreca-media` bucket used by the primary configuration. Source now names
`bitreca-media-preview-isolated` and marks development bindings `remote:false`.
**No bucket was created or inspected.** Do not assume that new name exists, belongs
to an isolated account, or is suitable for testing. Primary root configs still name
the existing deployment resources. Their environment defaults deny deletion.

The new staging templates contain deliberate placeholders and no customer routes.
The static checker rejects known production IDs/bucket aliases, mismatched scope,
enabled controls and attached routes/Cron. The runtime adapter checks a separately
provisioned bucket identity object. Those are defense in depth, not independent
provider verification. Actual staging D1/R2/account/permissions/isolation remain
UNVERIFIED and require separate manual approval. Do not copy production identity
objects, data, pins or signed reports into staging.

The hosting Worker currently recognizes approved `*.bitreca.com` customer hosts,
not arbitrary `workers.dev` names. Stage its routing only under an explicitly
approved isolated test hostname/route, or test it by direct isolated runtime request.
Never attach a staging Worker broadly to customer domains. The example configs
intentionally attach no routes and do not provision static build output or secrets.

## Scheduling and activation

No Cron is configured. The scheduled handler is a no-op without explicit opt-in
AND current D1 authorization. One invocation selects one due job, prepares at most
100 allocation items and performs at most two cleanup LIST/DELETE calls of up to
100 keys each, plus identity HEAD. Inventory verification uses at most 20 pages.
Inner leases fence destructive checkpoints; dispatch leases coordinate scheduling.
Open writers wait; ownership/history/uncertainty blockers are not automatically
hot-looped. Retry only requeues when no active dispatcher owns the job.

Approve staging marking first, then cleanup permissions, then a deliberately low
cadence Cron, and finally separate finalization approval after inspecting receipts.
Production additionally needs `PORTFOLIO_PRODUCTION_CLEANUP_APPROVED=true`, its
own matching D1 policy revision, identity and independent review. No runtime
authorization route exists. Every checked-in request/cleanup/finalization/schedule/
evidence-import flag is `false`, and all checked-in Cron arrays are empty.

## Authentication and security

Admin APIs retain same-origin mutation enforcement and awaited D1 session checks.
Sessions use independent random tokens, hash-only D1 storage, absolute eight-hour
server expiry, D1 logout revocation and configuration/version invalidation. Legacy
cookies are rejected. The __Host cookie is Secure, HttpOnly, Path=/, SameSite=Strict.
Authentication and cleanup D1 errors fail closed; new job errors are sanitized and
no manifests, tokens, raw storage prefixes or signing secrets are returned by the
new job-status APIs. Existing admin-only file-check APIs retain their prior contract.

There is no application login rate limiter in this implementation. Before public
admin launch, independently configure and test suitable edge/WAF rate limiting or
Cloudflare Access with an account-level recovery plan. Strong unique credentials,
restricted operator permissions and HTTPS remain required. No live secret strength,
edge policy, DNS or TLS state was inspected. Multi-customer account authorization is
not implemented; this remains a single-admin system with immutable portfolio IDs.

Git safety checks found no tracked files matching `.dev.vars`, `.env*`, private-key
or SQL-backup filename patterns; ignore checks passed. This is a filename-level
check, NOT a full Git-history secret scan. No secret contents or session data were
read. Review all preserved untracked work explicitly before a future authorized commit.

## Remaining publishing and platform limits

Branded customer URLs are retained. Version activation is atomic for D1 selection,
but a browser can load old HTML and request assets after the prefix changes. No-store
and upload warnings mitigate this; they DO NOT guarantee cross-version consistency.
For a controlled static-site launch, require content-hashed asset names, backward
compatible assets across a release, or an explicit maintenance/unpublish window for
incompatible updates. Do not promise zero mixed-version requests. Immutable version
hostnames/redirects were not added.

Hosting retains its restrictive CSP, approved extensions and safe-path restrictions.
Uploaded sites must be compatible static websites with root `index.html`, allowed
relative/root-relative paths and local assets. External scripts/styles/connections,
forms, embeds, inline styles, server routes, SPA fallbacks and unsupported path/extension
formats are not generally supported by the current Worker. Test actual customer
sites before publishing; do not broaden CSP or proxy arbitrary external content as
part of deletion enablement. Current uploads remain bounded (100 files, individual
and aggregate size limits; HTML-copy snapshot/metadata preservation checks).

Local tests used Node 22.14.0 with its experimental SQLite module, real SQL and
mock D1/R2 adapters. Worker Web Crypto/streams/Blob/Fetch APIs compiled successfully.
Cloudflare SQL/trigger/JSON/transaction behavior, D1 read consistency, result metadata,
R2 response/DELETE semantics, bindings, Cron duration/subrequest limits and actual
latency remain to be verified in separately authorized isolated staging. Do not
enable unconstrained D1 read replicas for auth/fencing. No numeric Cloudflare plan
limit is assumed from local tests. The safe build bypasses Cloudflare packaging
and does not copy public assets; the actual deployment bundle also needs review.
The ownership views deliberately recheck conflicts against other registry rows;
bounded result pages do not cap the underlying SQL work. Measure query latency,
rows read and execution limits with realistic registry sizes before activation.
Unrelated project-image writes stay confined to `projects/` and are outside owned
portfolio allocations; the independent audit must verify that separation too.

## Costs, backups and rollback

Cleanup never enumerates a bucket root or reads object bodies. Bounded pages,
small manifests and backoff limit bursts. HEAD and repeated verification have
operation costs; retained SQL evidence grows with allocations/manifests. Monitor
backlog, retry reasons, allocation counts, runtime budget, D1 query cost and R2
operations in staging before choosing cadence. Low throughput is deliberate for
Phase A. Old versions/failed uploads keep costing storage until a portfolio is safely
deleted; automatic pruning of active portfolios' history is not included.

Back up metadata and establish any required object-recovery policy BEFORE approving
deletion. A database backup cannot restore R2 bytes. Restoring an old D1 snapshot
without its retained tombstones/current policies can violate protocol assumptions;
do not restore it into service blindly. Disabling flags and advancing/disabling D1
policy stops new calls, not already-issued DELETEs. Preserve manifests and reconcile.
After cutover/migration, roll forward with compatible code; never roll back to an
untracked writer or erase receipts/generations to recover availability.

## Validation results

- Baseline: all 245 existing isolated tests passed before integration.
- Final automated suite: 270 tests passed, zero failures/skips/cancellations. Covers
  auth/session rotation, status races, initial ownership, folder/HTML uploads,
  deletion/writer races, incomplete/legacy inventories, schema preservation,
  malformed/foreign listings, bounded large-prefix cleanup, partial deletion,
  lost R2/D1/dispatch responses, leases/competing workers, replay/rollback,
  finalization/tombstones, public pins/scopes and disabled-by-default behavior.
- Full lifecycle test used actual handlers with SQLite memory and Map storage:
  create → folder → HTML preserving CSS → publish → update live → unpublish →
  deletion during delayed PUT → block modifications → wait for settlement →
  partial-delete retry → empty receipts → finalize → retain immutable evidence.
- All migrations 0001–0013 validated sequentially in SQLite memory. Existing rows
  and relationships preserved; integrity and foreign-key assertions passed.
- Full-project ESLint passed, including new `.mjs` scripts. Initial broad lint
  encountered 134 findings in a pre-existing generated vendor bundle; that build
  output was properly excluded rather than edited/deleted. Source checks passed.
- Syntax checks passed for 13 Worker/offline-script files. JSX also passed lint and
  the production client compilation. `git diff --check` passed.
- In-memory Vite production client compilation passed (three outputs); both Workers
  bundled in memory. No Wrangler/plugin/env loading or new project build artifacts.
- Real installed headless Chromium passed desktop 1440×1050 and mobile 390×844
  layout/overflow, cards/modal, search/filter/edit, loading, duplicate/conflicting
  upload prevention, failure and HTTP 409 refresh, published warning, folder paths,
  HTML preservation messaging, creation/publishing, exact-ID delete confirmation,
  keyboard focus containment, pending locks, blocked/retry/finalized reporting,
  metadata refresh failure and expired-session redirect. All APIs were loopback mocks.
- Screenshots were visually reviewed; retained only in OS temporary directories.
  No full screen-reader, Safari/Firefox, actual remote upload-progress, edge caching,
  Cloudflare integration, staging resource or production test was performed.

## Remaining blockers and exact next manual step

**Release blockers needing manual configuration/verification:** independently
isolated staging resources and permissions; verified migration history/backups;
approved application of pending migrations; correct admin secrets/version and edge
brute-force protection; pinned public signing trust/scope; legacy-writer drain and
genuine signed epoch; bucket identity provisioning; real staging runtime tests;
reviewed routes/packaging; and separate approval for each destructive runtime/Cron
control. No runtime flags or database evidence substitute for those checks.

**Features explicitly blocked pending further work:** automatic legacy deletion
or settlement of uncertain/untracked writers without independent evidence, and
automatic deletion beyond the 2,000-allocation verifier cap. These stay blocked;
they do not authorize a bypass for new portfolios or unrelated customers.

**Exact next manual action:** review this source change and the two staging
templates, then separately authorize provisioning/verification of dedicated empty
staging D1 and R2 resources with restricted credentials and a reviewed hostname.
Fill and statically validate the staging configuration with all flags still false.
Only AFTER isolation and target migration history are verified, separately
authorize applying 0012 then 0013 to that isolated target and deploying both compatible
Workers with deletion still off for integration testing. No production deployment,
writer cutover, signing assertion, R2 write/delete or Cron enablement is authorized
by this report or by the current task.
