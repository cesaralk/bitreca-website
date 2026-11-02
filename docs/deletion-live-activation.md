# Completed production handover (2026-11-02)

Stages1-9D are complete. Protected deletion was exercised on disposable portfolio11
with one313-byte HTML object; its immutable finalization receipt and finalized
dispatch are job ea5631ea-eb6f-4db6-bf35-0ef9117c2eaa. Both owned prefixes are empty.
Portfolios5-10 remain published in bitreca-media and their full metadata hashes
match the pre-deletion baseline. Legacy deletion remains disabled.

The source Wrangler configurations now reflect the retained approved production
bindings: bitreca-db, bitreca-media and bitreca-portfolios-prod-20261031. Main uses
protocol1/generation2 authorization, runtime revision4, enabled requests/cleanup/
finalization/scheduling and one minute Cron; import remains disabled. Hosting keeps
its separate frozen read configuration and all execution controls disabled.
Runtime revision/protocol, evidence and Admin secret values remain external state;
no migration, enrollment, import or activation is performed by this Git handover.

Published PortfolioForest layout/styles come unchanged from origin/main4e161cb.
Completed deletion source/migrations come from the preserved integration worktree.
The signed deployment artifact remains2e8cc4a9a9cee71809be0d00a7170dc3794e3f86d272a2832c2665d7dedeed95;
a source commit or future build does not establish new byte identity or deployment
authority. Encrypted owner keys and signed operational evidence remain outside Git.

Historical staging/sandbox configs and their tests are retained as disabled fixtures,
not current deployments. The legacy check:portfolio-config default command asserts
pre-activation disabled production defaults; it is not the operational production
preflight. It was deliberately left fail-closed and was not rerun or weakened here.
No completed test suite/build or production verification was repeated.

Do not push before checking both production Workers' dashboard Builds/Git automatic
deployments, production branch, root and build/deploy commands. Read-only API access
to those trigger settings returned403. A future push/deployment is separately gated.
Do not execute the superseded migration/cutover/deployment commands below.

---

# Clean storage activation for future portfolios (2026-10-31)

This checkpoint supersedes earlier activation instructions below. Owner-confirmed:
production0016/0017 and both Worker deployments are complete; solo policy generation1
and writer protocol1 are active; cleanup/finalization disabled; website online.
Do not repeat migrations, cutover, old tests or the previous deployment investigation.

The shortest path excludes the six legacy portfolios from the new deletion scope.
Do not reconcile/adopt their births, copy their objects, mark them for deletion or
remove records. IDs5-10 keep their old-bucket public serving; retirement means a
separately approved unpublication, never implicit record/R2 deletion.

Implementation uses a separate PORTFOLIO_STORAGE binding proposed for
bitreca-portfolios-prod-20261031. Its absence/creation is NOT yet verified. Keep
bitreca_media/PORTFOLIO_FILES on bitreca-media for projects/media and old-site reads.
Immutable origin.epoch_id -> retained epoch.storage_scope selects public reads.
Unknown/missing epochs or mismatched birth identity block; a missing object never
falls back to another bucket. Reads of old storage expose no put/delete capability
in this code. Actual Worker bindings are NOT provider-enforced read-only credentials.

Future writes require current-policy min1 origins and a signed epoch in the new
scope; the sentinel is checked before writer issuance. Cleanup uses only the new
binding and preserves existing signature, writer, inventory, receipt and finalization
checks. There is no new schema migration. A new-scope configuration without the
explicit clean-mode flag fails closed instead of writing into old storage.

Production data freeze PORTFOLIO_MUTATIONS_FROZEN defaults closed in clean mode.
It blocks portfolio mutations, cleanup and schedules. Only the already authenticated,
same-origin protocol-evidence POST can operate under its SEPARATE import flag while
data remains frozen. Keep legacy reconciliation import disabled for this route.

One consolidated plan; every remote stage requires separate explicit approval:

1. Review/seal the new source, actual Worker bytes, preserved client and proposed
   frozen configuration. Offline preparation:
   node scripts/prepare-clean-portfolio-activation.mjs
   To produce proposals, use --prepare NEW_DIRECTORY --policy-id NEW_UUID
   --deployment-artifact ACTUAL_CODE_ARTIFACT_JSON. No keys/credentials/network used.
2. Check the exact proposed bucket name is absent, then approve creating ONLY it.
   Retain account/bucket creation identity. No old-bucket inventory or cleanup is needed
   for authorization of this NEW scope. No D1 replacement/new environment is proposed.
3. Approve the next production policy generation2 with the SAME existing owner
   public key/fingerprint and new scope/artifact; preserve generation1 and protocol1.
   This is a policy/scope advance, not signing-key rotation. Pin fresh current policy
   and runtime state; activation automatically advances runtime revision and disables
   execution. Never hardcode the old runtime revision into later enablement SQL.
4. Approve each frozen Worker deployment and verify bytes, old/new bindings, public
   serving and retained Admin secrets/version2. Init ONLY the new identity sentinel
   with conditional no-overwrite protection, retaining acknowledged completion.
5. Establish genuine new-bucket writer exclusion/settlement: creation chronology,
   only approved bound deployments, setup/sentinel completion, no unfinished multipart
   uploads, direct credential/S3 scope and deployment/rollback authority restrictions.
   Both bound Workers remain potential writers under code replacement. Empty storage,
   an empty D1, or owner responsibility alone is not proof. Old-bucket writers need
   exclusion from the NEW scope, not an invented claim that old history was settled.
6. Privately sign a truthful version2 new-scope report with the EXISTING encrypted key
   only after approval. The legacy_writers_settled field applies ONLY to the signed
   new scope. Chronology follows actual generation2 enrollment and verified deployment.
   Separately approve restricted same-origin signed import while data stays frozen;
   close import immediately and verify the exact stored epoch after any lost response.
7. Approve explicit unfreeze for future creation/uploads only after the signed epoch
   and sentinel are verified. Approve one new disposable real-application portfolio
   creation/upload/publication if wanted; deletion acceptance waits for stage8 approval.
   No historical test reruns or another harness are required. Keep IDs5-10 untouched.
8. After reviewed queue checks, separately approve new-scope runtime cleanup, separate
   finalization and schedule controls, then exact-ID requests last. Enabling requests
   never authorizes deletion of an existing portfolio. Separately approve any exact-ID
   acceptance deletion afterward; no deletion runs in preparation.

Code cannot remove broad Worker/D1 authority, restrict R2 credentials, guarantee a
sole-admin rollback policy or recover deleted R2 bytes. Those remain actual operational
approval facts. The proposed report leaves all settlement/signing/import assertions
false until real evidence exists. No production-readiness claim is made here.

Prepared locally:20 new focused tests pass; focused ESLint clean; both changed Workers
compiled offline. Six existing client files copied byte-for-byte from the deployed
production-pinned-main package. No production records/objects/settings/key changed.

Frozen public proposal (12 payload digests verified, NOT live authorization):
C:/Users/cezar/Desktop/bitreca-deletion-review/production-clean-storage-PROPOSED-20261031
Manifest SHA256:c55f66ec6052c9c57bd3a585af027237482bb4c6d50adce88596111da87c0d2a
Code artifact SHA256:2e8cc4a9a9cee71809be0d00a7170dc3794e3f86d272a2832c2665d7dedeed95
Proposed generation2 policy ID:4580c991-6b1e-4e00-9a26-0b5d1a60c645 (NOT enrolled).
Existing public-key fingerprint remains
7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e.
The reviewed scope proposal's evidence booleans all remain false. New bucket
absence/creation, identity, writer facts, real deployment and signed epoch remain
approval-gated. No existing sealed candidate was modified.

## Historical release records (superseded; do not execute their old commands)

# Deletion release: prepared, NOT activated

## Migration0016 completed (2026-10-30)

ONLY production0016 is now committed. Read-only reconciliation verifies both guard
triggers, the migration record and all six full portfolio hashes/statuses unchanged.
One write attempt; initial runner confirmation unresolved, reconciled successfully;
no retry/rollback. Protocol0, generation0, revision0; cleanup/finalization disabled.
No Worker or R2 operations. Do not rerun0016 or the historical migration instructions.
Receipt: C:\Users\cezar\Desktop\bitreca-deletion-review\production-live-enablement-20261030\migration16-execution\completion.json
Next local scope: legacy-reconciliation-implementation.md and the exact input dossier
legacy-reconciliation-preparation.json. They are preparation only, not an authority,
new migration, deployment, signature or deletion enablement.

## Production activation checkpoint (2026-10-30 — current)

Priority is live activation; do not resume sandbox-only audits or historical suites.
No production change/deployment/enablement/deletion has been performed in this stage.
Read-only production preflight: protocol0, independent-v1 generation0, runtime0,
no signed epochs, no marked portfolios or unfinished jobs without historical receipts.
The three older pending job rows have immutable legacy-completion receipts; preserve
those records. All six IDs5-10 remain published with unchanged registered prefixes.
Admin D1 version is2; all four existing secret names including ADMIN_AUTH_VERSION
are present. Preserve existing secret values; ensure auth version matches2 privately.
The production identity sentinel is absent (exact control-key GET404).

The sealed candidate remains at:
C:\Users\cezar\Desktop\bitreca-deletion-review\deletion-production-candidate-20261029
Manifest39a757be83bf446aa126e4241604ac0ae03b7abec1f8e035e10d3ea468fa6e73;
all122 file digests verified. Existing public design/links are retained. All request,
cleanup, finalization, import, schedule and legacy flags are false.

Prepared production plan and exact approval-separated command list:
C:\Users\cezar\Desktop\bitreca-deletion-review\production-live-enablement-20261030\production-release-plan.json
SHA2568a3bfe0e145f3eb65a5be3c2a33272388cc9216df960eaa70200f123f05ccd0f.
Migrations1-15 already applied; ONLY16 is pending. A new private owner/SYSTEM metadata
backup exists and was restored exclusively in SQLite memory. Applying16 preserved
all27 table row digests and all six published portfolio records. No delete was tested.
Backup/proof public receipts: production-metadata-backup-20261030.json and
production-migration16-snapshot-validation.json in the review directory. R2 object
recovery is not implied by a metadata backup.

Exact next PRODUCTION SECURITY approval may cover ONLY migration0016 against
bitreca-db UUID8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a. Reconfirm pending list and exact
identity immediately before executing; stop on drift. It disables the old hardcoded
legacy-finalization exception, preserving every row/receipt and leaving deletion off:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply bitreca-db --remote --config "C:\Users\cezar\Desktop\bitreca-deletion-review\deletion-production-candidate-20261029\main.wrangler.jsonc"
```

Each subsequent main/hosting deployment needs its own approval; see the production
plan. Verify each active version/bytes/bindings, all disabled controls, Admin login
and the six unchanged sites. No blind retry/rollback after a partial result.
A disabled deployment alone does not satisfy the live-activation goal.

## Exact remaining activation blockers

1. Production trust initialization: absent storage-identity control object; protocol0;
   no enrolled solo policy or signed epoch. Separately approve no-overwrite control
   initialization, production-scoped owner enrollment/pins and writer cutover,
   genuine production writer settlement, private signing and controlled import.
   Never reuse sandbox settlement authority. Configure runtime and scheduling only
   after separate approval and reviewed empty-eligible-queue checks; requests last.
2. Current six: missing distinct signed legacy reconciliation authority in code and
   missing complete external-writer/historical-object proof. New object dossier has
   fourteen objects over twelve registered prefixes; birth identities/seals/source
   chains match, registered writers closed, no known foreign allocation overlap.
   BUT min_at_birth remains0 and epoch_id=null. Do not rewrite those immutable rows.

Actual per-ID object/lineage dossier:
C:\Users\cezar\Desktop\bitreca-deletion-review\production-legacy-object-proof-20261030.json
SHA25681426542792d2f9284ecc886341d6016c53c8a3cc6a3f2e980a5a78962415295.
This is current registered-namespace metadata, not invented historical ownership.
Original upload/provenance and external writer settlement must account for any
unregistered historical namespace/operation. Resolve only specific gaps, not another
nine-Worker/bucket-wide audit unless a discrepancy actually warrants it.

Minimal local legacy extension: append-only separately signed per-portfolio
reconciliation and exact-object manifest (proposed0017), signature/current-policy
verification on every inventory/retry, stale-snapshot rejection, and an allowlist-aware
storage adapter rejecting unknown/changed objects. Reuse existing leases, bounded
executor, receipts and atomic finalization. Add only focused tests for those NEW
security predicates. Global epoch signatures alone cannot authorize old births.
All six remain blocked until genuine evidence and that guarded path are in place.
No force flag, hardcoded ID authorization or automatic adoption is acceptable.

## Earlier sandbox/release records (historical; do not repeat completed stages)

## Current checkpoint: generation 3 active; pin deployment prepared (2026-10-29)

Generation3 activation is complete, per retained activation receipt: protocol1,
generation3, revision3, all three enrollment records retained; cleanup/finalization
still off. Do not repeat migrations, activation or the historical commands below.
Policy ID: 16563bc5-549f-490d-b392-9284c0769782.
Public SPKI fingerprint: 7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e.

Public-only successor:
C:\Users\cezar\Desktop\bitreca-deletion-review\solo-generation3-pinned-20261029\candidate
Manifest SHA256: 6d41f50d1ed0a77ff431e5926b251f60d78394b10df081ba29fc8085e57f6602.
Only public pins changed. Both reviewed JavaScript bundles, client and fourteen
sandbox migrations are byte-identical to the original sealed sandbox candidate.
Production's separate 122-file candidate and migration0016 are NOT this deployment.

Fresh GET/SELECT-only preflight passed. Both sandbox Workers still use the expected
old frozen versions b8cec2ff-37df-4235-ae6e-858a63e9a8d3 and
116ccbb3-97f0-40de-a55b-54994f782d9a. D1 matches completed generation3 activation.
The next approval is ONLY deployment of the successor to these exact two Workers:

```powershell
node scripts/generation3-sandbox-release.mjs run "C:\Users\cezar\Desktop\bitreca-deletion-review\solo-generation3-pinned-20261029\frozen-deployment-preflight.json" 87d8bcd2b65e4cfec2332cbf9ddaf086d46e040106d95d3ab5d7ad43b3f2c696 --approved-deployment
```

Run from the original workspace. The runner verifies reviewed tool/package hashes,
exact identities, current full D1 snapshot, and frozen/private bindings/config before
each Worker. It verifies active 100% traffic, public pins and byte hashes individually,
retains per-Worker receipts, and never reports both completed after partial failure.
No D1 write, cutover, activation, deletion, cleanup, finalization or import is included.
Stop on any ambiguity; no automatic retry/rollback. Preflight expires after 30 minutes.
If expired, use a NEW external JSON path with the following read-only command and
review its NEW digest; all existing plans/receipts remain immutable:

```powershell
node scripts/generation3-sandbox-release.mjs preflight "C:\Users\cezar\Desktop\bitreca-deletion-review\solo-generation3-pinned-20261029\frozen-deployment-preflight-refresh.json"
```

After successful deployment, deployment-completion.json supplies actual verification
time, both live Worker receipts, and unchanged protocol1/generation3/revision3 state.
Prepare actual evidence/owner-settlement-audit.json and owner-evidence-v2.UNSIGNED.json
under the successor folder. No such factual reports were fabricated in preparation.
Reuse prior sentinel setup/verification, writer/credential/multipart/history records
with exact hashes, plus this NEW deployment receipt and a truthful assessment of any
intervening authority/operations. Empty D1 or owner responsibility alone is no drain
proof. Preserve observed facts, inferences and residual solo-owner/rollback risks.
The audit must reference deployment-completion.json and all actual cited records;
include explicit owner-reviewed factual settlement confirmation for this scope/gen3.
Do not relabel generation1/2 reports. Chronology must follow actual gen3 enrollment,
deployment verification, fencing, settlement review and evidence verification.

Offline validation (no key access) and FUTURE separately approved signing commands:

```powershell
node scripts/generation3-evidence.mjs --plan
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sign-generation3-evidence.ps1 -ApprovedSigning
node scripts/generation3-evidence.mjs --verify-signed
```

The private Windows console uses the encrypted existing owner key and anonymous
stdin SecureString helper. Private material stays outside Git and deployment tools.
Signing remains BLOCKED until the actual report/audit/deployment facts exist.

Restricted import is a SEPARATE approval stage and remains blocked pending a concrete
verified owner-only Access hostname/identity policy or equivalent private transport.
See restricted-import-plan.json. No unrestricted public route or direct SQL bypass.
Use existing admin session + exact same Origin + pinned P256 signed evidence. The
sealed code's freeze also covers the import endpoint; opening import would require
main-only import=true/freeze=false in a separately reviewed control deployment.
Request, cleanup, finalization and schedule flags remain false; hosting stays frozen.
Use controlledEvidenceImport: verify closed/restricted -> open/verify -> POST ONCE ->
finally restore import=false/freeze=true and verify -> read back the exact epoch.
Lost responses require closed-state recovery and read-only reconciliation, never
blind POST replay. No live transport/control operation has been executed/pre-approved.

The six PRODUCTION IDs5-10 remain independently blocked: birth protocol0 and no
signed birth epoch. Gen3 sandbox deployment/evidence cannot authorize or rewrite
those origins. Per-portfolio historical object/source/writer evidence and a separately
reviewed append-only signed legacy reconciliation model are still required; absent
complete proof, retain the block. Prepared production migration0016 has NOT run.
No production/customer/R2 changes occurred in this stage. No production readiness.

New checks only: three public-pin/partial-deployment tests and two gen3 evidence
validator tests, focused ESLint and signing-wrapper parser; no passed deletion suite
was rerun. Offline evidence plan correctly blocks missing genuine future inputs.

## Historical preparation record (superseded by the current checkpoint)

Integration branch: deletion/protected-release-20261029 at origin/main 4e161cb.
Original workspace and design-release worktree preserved. No commits/push/deploy.
Live PortfolioForest/App/Navbar preserved; all six website URL mappings tested.

## Verified reads and remaining approvals

Protected sandbox: read-only activation2 preflight completed. Protocol1, generation1,
revision1, gen2 enrolled/inactive; freeze/private access intact; execution off.
Public plan: C:\Users\cezar\Desktop\bitreca-deletion-review\generation3-activate2-plan.json
Plan SHA256: 4076dc4310f96831f73ad28a139472ed8f0627cb62af7861b0f02c093ab62ab6
Plan expires 30 minutes after its saved createdAt. If expired, create a NEW read-only
preflight at a new output path; never overwrite/delete the old plan or use stale state.
No transition, signing, import, enablement or protected remote E2E was performed.

Next approval ONLY: activate enrolled generation2 in the exact sandbox D1 UUID
9c236935-b942-4cd7-9360-fed24db999fa. Expected generation2/revision2; protocol1
and all disabled controls unchanged. Before executing, verify plan freshness/hash.

`node scripts/execute-generation3-recovery.mjs --stage activate2 --execute "C:\Users\cezar\Desktop\bitreca-deletion-review\generation3-activate2-plan.json" --sha256 4076dc4310f96831f73ad28a139472ed8f0627cb62af7861b0f02c093ab62ab6 --approved-stage activate2`

Then separately approve enroll3 (requires real tested offline-backup confirmation),
activate3, public-only pin deployment to BOTH sandbox Workers, fresh truthful gen3
settlement evidence, private-console signing, restricted import/restoration, and
disposable protected E2E fixtures. Do not reuse old reports by changing generations.
Use existing recovery, deployment, signing, import-sequencing and E2E tools. Their
historical generation1 scripts are not gen3 authorization. Live API is private:
operator-only import access still needs a concrete separately approved transport;
no general public exposure or direct-SQL evidence bypass. Immediate restoration is
mandatory even on ambiguous responses. No fabricated chronology or approval.

## Production (read-only observations)

Exact bitreca-db UUID 8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a and bitreca-media
verified. Applied migration history is 0001–0015, NOT the sandbox's fourteen.
Website active: 886361fb-788e-40d6-addd-33576a7bc236 at 100%.
Hosting active: ccc4f095-40cd-481e-9a91-37370f26261b at 100%.
Both schedule lists empty. Current settings returned no portfolio enablement
plaintext flags. This is not a deployed-byte audit or a claim of production readiness.
No live permanent-deletion enablement occurred here.

All six remain published. See legacy-deletion-reconciliation.json: IDs5–10 have
two tracked allocations each and currently closed registered writers, but all
origins have minimum_at_birth=0 and epoch_id=null. None is safely deletable under
the protected inventory model. This is not simply missing owner approval.

Minimum reconciliation evidence per ID: retain the exact immutable DB origin,
allocation/event/source chain; recover original upload requests/results, historical
deployment artifacts and any external setup-tool records; obtain a complete R2
inventory with key/version-or-ETag/size/content digest and multipart state for BOTH
registered prefixes and every additionally proven historical prefix. Establish
exclusive ownership and genuine writer settlement from those records, not names,
slugs, current closure, empty listings or waiting. List operations observe objects;
they do not prove title or completeness of lost history. Keep foreign/shared keys
excluded. No customer changes, publication changes or freeze are authorized now.

If complete historical evidence is recovered, a separately reviewed, signed,
portfolio-specific reconciliation authorization and forward-only ownership model
is still required: current immutable births CANNOT be upgraded to a new epoch.
Do not synthesize a birth token, rewrite origins/events, or grant the old bridge.
If history cannot be recovered, that portfolio stays blocked; production deletion
of the other independently eligible portfolios must not depend on an override.

## Release and migration gates

All release request/cleanup/finalization/import/schedule/legacy flags false. No Cron.
The synchronous hardcoded legacy implementation is replaced by an inert gate.
Historical migration0015 preserved byte-for-byte; new0016 restores the original
protected finalization guard and rejects new bridge receipts, retaining old receipts
and tombstones. Fresh/seeded memory upgrades1–16 and historical receipt preservation
tested. The protected sandbox remains1–14 until a separately reviewed release plan;
do not run production migration plans against it.

Before any production migration/deployment: compare all applied names and actual
schema to the release, approve ONLY pending0016 (never reapply1–15), preserve a
production metadata backup and verified object-recovery material, reconcile current
admin/session AUTH_VERSION and secrets by name without exposing values, and review
both hosting/resource bindings. Migration0016 and each Worker deployment require
their own explicit target approval. Keep all destructive controls off afterward.

Disabled deployment command templates, NOT authorized:
`wrangler d1 migrations list bitreca-db --remote --config main.wrangler.jsonc`
`wrangler d1 migrations apply bitreca-db --remote --config main.wrangler.jsonc`
`wrangler deploy --config main.wrangler.jsonc`
`wrangler deploy --config hosting.wrangler.jsonc`
Use ONLY the verified external candidate directory and current reviewed identity
receipts, not the original development wrangler.jsonc (it enables the old bridge).
Never run these commands through the Vite deployment script as implicit approval.

Production writer fencing/protocol, owner enrollment, signed evidence, request
enablement, cleanup revision, finalization revision and schedules are SEPARATE
future approvals requiring PRODUCTION evidence. Sandbox proof transfers no authority.
Emergency stop is separately approved forward-only disable/revision advance; no
automatic rollback/restore. Reject any rollback that reintroduces the legacy bridge
or untracked writes. D1 backups cannot resurrect deleted R2 objects. Credentials
with Worker/D1 edit power and the sole administrator remain external residual risks.

Local validations: 32 focused Admin/public URL/publication/freeze tests; 33 selected
request/history/retry/legacy/E2E-rehearsal tests; four release/forward-fence tests;
ten recovery/schema tests; browser desktop/mobile fixture acceptance; ESLint;
offline client+both Worker builds; fresh/seeded migrations1–16. None of the mocked
E2E results is the remaining protected Cloudflare acceptance test.
