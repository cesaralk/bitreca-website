# PortfolioForest deletion operations — review before authorization

Production rollout is complete. Historical SQL examples below must not be replayed. Every SQL example
below changes state and therefore needs separate authorization for its EXACT
database. Do not paste it into an existing local or production database as a test.
The safe automated commands at the end use only disposable fixtures.

## Resource and trust configuration

Use the two production Wrangler configurations and the approved identity in
[production handover](deletion-live-activation.md). Historical environment configs
are disabled fixtures under tests/fixtures/retired-environments, not live targets.
Keep production resources and credentials separate from every test fixture.

These source files are templates, not proof that staging exists. `remote:false`
selects local simulation for development; it does not make deployment safe or
change a deployed binding. A preview bucket name does not provision a bucket.
The root Wrangler files still name the existing deployment resources; do not use
them for remote development or staging. Existing `npm run preview` invokes Wrangler;
it is NOT an isolated readiness test.

Configure the following explicit public identity values for a reviewed environment:

| Variable | Value |
| --- | --- |
| `PORTFOLIO_ENVIRONMENT` | `staging` or `production`; `development` cannot run deletion |
| `PORTFOLIO_DATABASE_ID` | Actual approved D1 UUID; match the binding |
| `PORTFOLIO_BUCKET_NAME` | Actual approved R2 bucket name; match the binding |
| `PORTFOLIO_STORAGE_SCOPE` | `portfolioforest/{environment}/{bucket}/{database_uuid}` |
| `PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI` | Base64 DER SPKI of the independently pinned P-256 PUBLIC key |

Provision one zero-byte control object, only after separate storage-write approval:
`__portfolioforest_control__/storage-identity`. Its custom metadata must contain
`environment`, `storage_scope`, `bucket_name`, `database_id`, exactly matching the
approved environment. Cleanup performs HEAD on this object; it is outside every
customer allocation and must not appear in a deletion manifest. No automated
provisioner for this control object is included. A missing/mismatched object blocks
all cleanup LIST/DELETE calls.
An identity mismatch is a blocked configuration state, not a repeated automatic
retry. A transient HEAD failure retains evidence and backs off safely.

Independently compare the provider account, binding resource IDs, restricted token
permissions and control metadata. The sentinel prevents accidental binding aliases;
it is not a cryptographic statement about Cloudflare account ownership. A privileged
operator who copies approved production configuration/credentials can bypass an
environment separation policy. Keep that authority outside development credentials.

Admin authentication still requires secret `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
`SESSION_SECRET`, and explicit `ADMIN_AUTH_VERSION` matching D1 `admin_auth_state`.
Never place secrets in these templates or logs. Use unique strong credentials for
staging. On rotation, separately advance the authoritative auth version, update all
matching Worker configuration, and verify old cookies and old deployments fail.
Do not lower versions or restore an older auth-state snapshot into service.

## Independent signing

The signing private key belongs outside the repository and outside the Worker.
Use an independently controlled P-256 key and obtain its public pin through a
separate trusted channel. This task generated fake keys only in test memory.
Do not sign a report merely because mock tests pass.

Retain an immutable reviewed deployment bundle and an independent audit file
covering routes, Worker versions, traffic splits, all R2 writers/credentials, and
definitive settlement of legacy requests. Hash the actual bytes, not a deployment
name. Neither a timestamp nor a policy switch proves those facts.

Create a report outside the repository using this exact field order/schema:

```json
{"version":1,"id":"<new UUID v4>","storage_scope":"<exact approved scope>","writer_protocol":1,"deployment_sha256":"<SHA256 of reviewed bundle>","evidence_sha256":"<SHA256 of independent audit>","legacy_writers_settled":true,"verified_at":0}
```

Replace the example timestamp with the genuine audited Unix time. Only affirm
settlement after independently proving it. `Get-FileHash -Algorithm SHA256` may
calculate artifact digests; the report requires lowercase hex. These examples use
operator files outside the repository and placeholders, and were NOT executed:

```powershell
node scripts/portfolio-evidence.mjs sign --report <report.json> --private-key <external-private.pem> --scope <approved-scope> --deployment <reviewed-bundle> --audit <independent-audit> --out <new-evidence.json> --acknowledge-independent-audit
node scripts/portfolio-evidence.mjs verify --evidence <new-evidence.json> --public-key <independently-pinned-public.pem> --scope <approved-scope> --deployment <reviewed-bundle> --audit <independent-audit>
```

The CLI refuses a private-key path inside this repository, refuses overwriting its
output, and prints no key material. Audit confidentiality remains the operator's
responsibility. The tool cannot verify that the auditor's assertions are true.
Changing storage bindings, credential authority or the writer protocol after an
audit requires stopping mutations and independently reviewing a new deployment/
scope epoch before treating new births as trusted. Do not reuse an old signed
deployment assertion as approval of new write-capable code or configuration.
For public pin conversion, an operator can export their PUBLIC PEM to DER SPKI
using `openssl pkey -pubin -in <public.pem> -outform DER -out <public.spki.der>`.
Base64 the DER for the environment pin; SHA-256 the same DER for D1 `signer_sha256`.
Do not pin a public key supplied by an HTTP evidence body.

After the separately authorized cutover described in
[portfolio-writer-cutover.md](portfolio-writer-cutover.md), briefly enable only
`PORTFOLIO_EVIDENCE_IMPORT_ENABLED=true` in the reviewed environment. Import the
tool's `{payload,signature_base64}` package with a valid admin session and the exact
same-origin `Origin` header to `POST /api/admin/portfolio-protocol-evidence`.
The body is bounded to 32 KiB. Signature, scope, protocol gate and chronology must
pass. Replays recover the same immutable epoch. Turn import off afterwards.
There is no HTTP route to activate the writer policy or authorize cleanup.

## Activation controls and order

Each environment flag is the string `true` to opt in; every checked-in flag is
`false`. Enable them only under separate approval, in this order:

1. Verify migration history. A newly created empty staging database requires ALL
   0001–0013 in order; the existing LOCAL history does not transfer to staging.
   Only a database verified through 0011 would need just pending 0012 then 0013.
   Review the latest 0006 D1 portability correction before applying to a fresh target;
   never reapply an already-recorded migration. Deploy compatible code with all flags off. Confirm
   neither Worker exposes staging through production customer routes.
2. Complete the legacy-writer drain/cutover audit and evidence import. No time-based
   grace period can replace settlement proof. Create a NEW test portfolio after
   the verified epoch, upload both ways, and inspect its complete registry/history.
3. Test admin status/retry with execution disabled. Retry only queues verification;
   it does not certify writers or ownership. Uncertain/legacy inventories stay blocked.
4. Independently authorize and create the bucket identity object. Review both
   Worker bindings, scope and public pin, and verify isolation with provider metadata.
5. Set `PORTFOLIO_DELETE_REQUESTS_ENABLED=true` only after reviewing the irreversible
   marking behavior. Typed exact ID is required. Marking immediately unpublishes
   and freezes mutations; it does not delete storage. There is no cancellation.
6. Separately authorize D1 runtime policy using the reviewed identity and the
   current expected revision. Then set `PORTFOLIO_CLEANUP_ENABLED=true`. Keep
   finalization and scheduling off. There is deliberately no run-cleanup HTTP API.
7. For a separately approved staging run, enable scheduling and configure one
   Cron at a deliberately low cadence, for example once per five minutes. This
   document does not enable that Cron. Observe actual D1/Worker budgets and durable
   progress using fake customer assets in the isolated bucket only.
8. Only after cleanup receipts and storage identity checks pass, separately enable
   D1 `finalization_enabled` AND `PORTFOLIO_FINALIZATION_ENABLED`. The current
   authorization revision is rechecked inside the atomic finalization SQL.
9. Production requires a separate full review and additionally
   `PORTFOLIO_PRODUCTION_CLEANUP_APPROVED=true`. Staging approval cannot substitute.

Runtime-policy TEMPLATE, NOT executed:

```sql
UPDATE portfolio_deletion_runtime_policy
SET revision=revision+1, environment='staging',
    storage_scope='<approved scope>', bucket_name='<approved staging bucket>',
    database_id='<approved staging UUID>', signer_sha256='<public DER SHA256>',
    cleanup_enabled=1, finalization_enabled=0
WHERE id=1 AND revision=<reviewed current revision>;
```

Require exactly one changed row and independently read back all public identity
fields. Every policy update must increment revision by exactly one. The policy
starts disabled. Environment flags alone cannot override it. To pause, turn flags
off and separately disable D1 cleanup/finalization with a fresh conditional revision.
The adapter rechecks the revision before each LIST/DELETE. A call already issued
cannot be recalled; preserve its manifest and reconcile its response.

## Bounds, progress and recovery

One scheduled tick selects at most one due job. Dispatch leases last 120 seconds;
cleanup/finalization use separate bounded token/generation fences. Each cleanup
tick allows at most two R2 LIST/DELETE calls, pages/manifests of at most 100 keys,
plus the bucket identity HEAD. Inventory verification reads pages of 100, at most
2,000 allocations. Larger portfolios are explicitly UNSUPPORTED for automatic
deletion and remain blocked. Do not truncate their inventory; a separately reviewed
bounded verifier upgrade is required before cleanup. Include failed allocations
when monitoring this limit.

The executor re-lists the first page after deleting its durable manifest, avoiding
cursor skips in a changing keyset. It never scans a bucket root, infers slug
ownership, fetches file bodies for cleanup, or deletes the control object. Confirmed
key counts come from unique immutable manifests, not attempts or percentage guesses.

Open writers wait; uncertain/untracked writers and legacy ownership block. Leases
and elapsed time never settle writers. Safe retry does not reset history. Ordinary
progress is queued after five seconds; open writers are revisited after 60 seconds;
execution failures wait an hour at dispatch level, in addition to inner cleanup
backoff. An actual low-cadence Cron determines when due work runs. Blocked jobs
require independent investigation and an admin recheck; they are not hot-looped.

`GET /api/admin/portfolio-deletion-jobs` returns ten sanitized jobs per cursor page.
The per-job status retains receipts, blocker reasons, actual verified counts and
dispatch timing/attempts without prefixes, manifests or lease tokens. The admin UI
polls while pending, supports safe recheck and never claims deletion from `prepared`
or an empty listing alone. Finalized means the permanent D1 receipt exists.

On an interrupted request, lost response or partial deletion, retain all manifests,
receipts, generations and tombstones. Resume via the dispatcher. Never manually
set writers closed, falsify evidence, change prefix ownership or delete bookkeeping
to make progress. Unresolved legacy objects may continue incurring storage costs.
This Phase A implementation deliberately provides no automatic legacy adoption.

## Local maintenance

Keep reusable tests, source checks and owner-key recovery tools. Retired staging
preparation commands are no longer npm scripts. See the project README for current
development commands. Historical operational examples remain in
[release history](https://github.com/cesaralk/bitreca-website/blob/14dabbdbd3468c88e6919b1bb954b90d17234526/docs/portfolio-deletion-operations.md).
