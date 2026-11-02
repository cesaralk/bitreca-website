# Sandbox permanent portfolio deletion readiness

## Step 3 offline signing prepared; import access still separately gated (2026-10-28)

The existing unsigned version-2 report remains usable: its canonical payload,
audit/reference hashes, sealed 25-file candidate, generation-1 policy/operator key
and chronology validated against the retained protocol-1 reconciliation. Settlement
assessment before cutover is legitimate; no report/audit/package rewrite was made.

`C:\Users\cezar\Desktop\bitreca-deletion-review\solo-step3-20261028` contains the
public-only offline kit and `sign-owner-evidence.ps1`. Default mode is plan-only;
separate `-ApprovedSigning` opens a private Windows console. The encrypted key is
decrypted only inside Node's private signing process via a SecureString/stdin
passphrase handoff, with no plaintext PEM/password file, command-line secret,
key generation or network operation. Existing signer/verifier code is reused.
No private key was opened or signature generated during preparation.

Three no-signing local tests, targeted ESLint, PowerShell parsing and PLAN-ONLY
checks passed. Import sequencing requires operator-only access before changing
main freeze/import flags, restores/verifies closed controls even on failed/lost
responses, and closes the window before epoch readback. A missing or failed restore
never reports success. Real process/network failures still require operator recovery.

The live API remains private and no approved operator-only origin/access transport
has been specified. `controlled-import-plan.json` and the two-flag delta are proposals;
`import-evidence.ps1` has no live transport and refuses `-ApprovedImport`. Do not
enable unrestricted public access or import evidence with direct SQL as a shortcut.
Next approval can cover offline signing only; remote control/access changes and
authenticated API import require a separate concrete approval. No Cloudflare
operation, control change, signing, import or repeated cutover occurred here.

## Protocol 1 committed; CLI parser failure reconciled (2026-10-28)

**Protocol is now 1. Do not repeat the cutover.** The approved SQL-file import
committed successfully before PowerShell failed to parse mixed Unicode CLI output
as JSON (`Invalid JSON primitive: Γö`). The original Wrangler import log records
`success:true`, `rows_written:1`, `changed_db:true` and aggregate `changes:2`.
The printed protocol-0 snapshot was the preflight, not the post-write state.

Fresh SELECT-only D1 verification and the corrected full read-only preflight both
confirmed generation 1, revision 1, 14 migrations, no epochs/portfolios/allocations,
and disabled cleanup/finalization. Current pinned Worker configurations remain
frozen/private, with deletion requests, schedules and import off. No deployment,
enrollment, signing, evidence import or remote mutation occurred during reconciliation.

The pure `scripts/portfolio-wrangler-json.mjs` parser accepts one complete structured
document amid ANSI/Unicode progress output and rejects failed native exits,
truncation, multiple/ambiguous documents, zero-row acknowledgments and import
summaries masquerading as direct-query acknowledgments. Six focused regressions,
targeted ESLint, Windows PowerShell pipeline/JSON tests, parser and PLAN-ONLY checks
passed. Original reviewed procedure/report/index/package bytes remain preserved.

The outside-Git review directory `solo-settlement-review-20261028` contains
`protocol-1-cutover.corrected.ps1`: plan-only by default, `-ReconcileOnly` for
GET/SELECT verification, and **no mutation path**. It rejects cutover approval flags.
Its successful read-only receipt is `protocol-1-reconciled.json`; the initial narrow
D1 receipt is `protocol-1-readonly-reconciliation-20261028.json`. The original
`protocol-1-cutover.ps1` is retained solely as historical evidence and must not run.
Next approval is private offline signing of the prepared version-2 report only;
import, control enablement, application test cleanup and finalization remain separate.

## Owner settlement review prepared (2026-10-28; not signed or activated)

The owner has now reported a full bucket inventory containing only the sentinel,
AWS S3 `ListMultipartUploads` returning zero unfinished uploads, deletion of the
temporary read-only inspection token, and no direct R2 Write permission on
`bitreca-worker-builds-limited`. These close the previously identified clearance
gaps for **owner settlement review**; do not repeat the token or Worker inventories.
The AWS/token findings are explicitly owner-reported, not invented agent-collected
provider responses. Preserve the owner's original read-only command/deletion receipts.

Unsigned factual audit, canonical version-2 report and separately approval-gated
protocol-only procedure are in
`C:\Users\cezar\Desktop\bitreca-deletion-review\solo-settlement-review-20261028`.
Audit SHA-256: `8d3c0b4c6ee889061c2f124fe9b5b6a4b9b7ababb726038ceed18e9a5efdfe09`.
The conclusion reconciles documented writers and completed/excluded operations;
it is not derived from empty D1. Observation/assessment chronology is documented
without guessing the original AWS check time. Sole-owner/deployment/restore authority
remains an explicit residual risk, and no independent oversight is claimed.

The cutover script defaults to plan-only and requires both owner factual approval
and explicit protocol-1 approval. It verifies exact pinned current Workers, candidate,
scope/key/generation, account/D1/R2 identities and disabled/empty D1 state before
one guarded monotonic protocol update, then verifies readback. No signing, evidence
import, deployment or deletion enablement is included. Canonical report/hash checks,
eight disposable in-memory SQL scenarios, PowerShell parser/plan-only and multiline
reply parsing checks passed; no remote operation or signature was performed.

## Final multipart clearance gap (2026-10-28)

**Resolved by owner confirmation:** `bitreca-worker-builds-limited` has no direct
R2 Storage Write permissions. Workers Scripts Edit is retained indirect deployment
authority under the explicit solo-owner policy; do not repeat its permission review
or the completed nine-Worker inventory.

All six preserved historical Worker artifacts were checked against their recorded
hashes and contain no R2 multipart API identifiers. The identified sentinel setup
uses a fixed-key single PUT, and its 42-byte source matches the successful retrieval.
These facts support exclusion for identified paths, but are not a bucket-side
unfinished-upload listing. Ordinary REST object listings do not supply that result;
the documented S3 `ListMultipartUploads` operation does. Existing Workers bindings
do not expose a multipart-list method. No AWS credential environment pair, standard
AWS profile files, rclone configuration or S3 CLI was found in the local checks.
No credentials were created or changed. No authoritative multipart count is claimed.

The remaining proof is a timestamped, whole-bucket, fully paginated
`ListMultipartUploads`-equivalent result for `bitreca-delete-sandbox-r2-20261025`.
With no suitable existing S3 access established, the no-new-credentials route is an
owner request to Cloudflare support for that read-only result. Request no abort,
cleanup, credential or configuration change. Signing and protocol cutover remain off.

## Solo-owner deployment reconciled after local reporting failure (2026-10-28)

**Both approved frozen deployments succeeded; do not redeploy or roll back.**
Fresh read-only deployment/content/configuration verification confirmed:

| Worker | Active version | Traffic | JavaScript SHA-256 |
| --- | --- | --- | --- |
| `bitreca-main-delete-sandbox-20261025` | `b8cec2ff-37df-4235-ae6e-858a63e9a8d3` | 100% | `4023684bbb1f85862d36b0b05ce6d87ab3c926128ea0b55d117ec17129bcb87a` |
| `bitreca-hosting-delete-sandbox-20261025` | `116ccbb3-97f0-40de-a55b-54994f782d9a` | 100% | `1f5a9c265f7774d03a3244f115ee6ac008e851fa45117d9d66e66a2972ef44d4` |

Both match sealed candidate `6ac0303aca92f5adf28e5512195d81ecffd5526759a3828cc26726e1af55520a`,
including exact D1/R2 bindings, generation-1 public pins, mutation freeze, private
access and disabled execution/schedules. Fresh SELECT-only D1 checks confirmed
protocol 0, runtime revision 1, generation 1, no revocation, disabled cleanup and
finalization, and no portfolio/writer/job/epoch records. Empty D1 remains no proof
of external writer settlement. No new remote mutation occurred during investigation.

The failure was local: `deployment-result.json` was successfully created for the
two individually verified Worker receipts, then the generic final state-summary
writer attempted to create the same filename with `flag: 'wx'`, causing `EEXIST`.
The script now uses `deployment-completion.json` for the final summary and reports
evidence-file collisions explicitly. Existing exclusive-create safeguards remain.
The focused regression reproduces the collision, checks distinct summary output,
and verifies neither receipt can be overwritten. **12 focused tests and targeted
ESLint passed.**

Original receipts/plan/package were preserved. A new read-only reconciliation is at
`C:\Users\cezar\Desktop\bitreca-deletion-review\solo-owner-enrollment-plan-20261027\deployment-readonly-reconciliation-20261028.json`,
SHA-256 `924d1460cddd29e6c96986c145603a5b69f1ff0d83e6eebf2720624033b0e0a8`.
The original approved executor source was archived with its original tool hash
verified, alongside the fixed source and diagnosis. Do not rerun the completed
deployment wrapper or update its historical baseline IDs just to bypass safeguards;
the local code fix intentionally changes its tool hash. No migration/enrollment
repeat, deployment or rollback is needed. Continue genuine settlement-evidence
preparation with controls frozen; protocol cutover remains separately approval-gated.

## Owner key and public-pin successor prepared (2026-10-27)

The one explicitly approved local retry completed. The private workflow verified
encrypted PKCS#8 format and OpenSSL private-key usability before exporting the
P-256 public key. Private material stays outside Git in the owner/LocalSystem-only
directory; passphrase entry occurred only in a separate private Windows console.
No private material or passphrase was captured in this report or the public package.

Operator: `bitreca-owner`; proposed policy UUID
`b156f918-7352-481e-8812-224b53dbe6a5`, generation 1 (**not remotely enrolled**).
Public SPKI SHA-256:
`3fb65d834cb5138bd49adeb5ee866268216183df7a0964eda5fe088a25c3d373`.

Successor candidate:
`C:\Users\cezar\Desktop\bitreca-deletion-review\solo-owner-pinned-20261027\candidate`.
Manifest SHA-256:
`6ac0303aca92f5adf28e5512195d81ecffd5526759a3828cc26726e1af55520a`.
All 25 payload digests verified. Only main/hosting public configurations changed
from the prior sealed candidate, plus the manifest entries describing them;
Worker JavaScript, client, all 14 migrations and code-only manifest are byte-identical.
Exact protected sandbox bindings and frozen/private/disabled controls are retained.
Public fingerprint independently recomputed locally; exported public copies match.

New guarded plan:
`C:\Users\cezar\Desktop\bitreca-deletion-review\solo-owner-enrollment-plan-20261027`.
Plan SHA-256: `e0c7095eeecb6abeabe1274753c7b85401c1639469d009bb32f5b5cf78732b0b`.
Enrollment and deployment wrappers passed parser and plan-only checks. Migration
0014 was previously completed and must not be rerun. Next remote approval is
**enrollment only**, then a separate frozen deployment approval. Preserve an
encrypted offline key backup before authorizing enrollment; no backup completion
is claimed. Public local validation is retained in
`solo-owner-public-20261027\public-validation.json` outside Git.

No Cloudflare operation, enrollment, deployment, protocol change or deletion was
performed in this key-preparation stage. No writer settlement or independent
oversight is claimed. Subsequent signing must use a private interactive encrypted-key
handoff; do not decrypt the key into repository/deployment automation or pass its
passphrase to the existing offline CLI through arguments/environment variables.

## Sealed solo-capable sandbox release preparation (2026-10-27)

New durable candidate:
`C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-solo-v1-20261027`.
Manifest SHA-256: `dd5b3e8318bf45c9015d368bf7590905f956ab864c632689b9fa0e3cba0c4262`.
All **25 payload file digests** verified, including both Workers, client, exact
unchanged private/frozen sandbox configurations, 14 migrations and a code-only
manifest. Code-manifest SHA-256:
`97dee6f267be82e94ff094a96f39528eaa68e9afa6446284a01c71f36bfbb6d4`.
Main JavaScript: `4023684bbb1f85862d36b0b05ce6d87ab3c926128ea0b55d117ec17129bcb87a`;
hosting: `1f5a9c265f7774d03a3244f115ee6ac008e851fa45117d9d66e66a2972ef44d4`.
Earlier sealed packages remain unchanged. This seals local bytes, not live identity
or provider-enforced immutable storage.

The public-key handoff is genuinely missing: this candidate contains solo-capable
code with current frozen configuration, **not an enrolled/public-key-pinned solo
deployment**. No placeholder key or evidence was fabricated. The public-only
`scripts/solo-sandbox-release.mjs owner` operation prepares a separately sealed
successor by changing only the two public configurations and their manifest entries;
code/client/migrations stay byte-identical. No rebuild or private key is required.

Outside-Git handoff and separately gated scripts:
`C:\Users\cezar\Desktop\bitreca-deletion-review\solo-release-preparation-20261027`.
See its `NEXT-STEPS.txt`, `evidence-reuse.json`, offline public signing-tool snapshot,
and `release-plan.json` (SHA-256
`9d66758b9b4f67151f2d8c470cb573438db89d882d35484af2a6a5396e830222`).
`migration.ps1` is plan-only by default; separate `-Approved` permits only migration
0014 after fresh identity, historical-baseline byte/binding/version and empty/disabled
state checks. Historical versions are guarded expectations, not fresh observations.
The initial enrollment/deployment stages refuse execution without owner public inputs.
After public-pin successor review, generate its new plan and approve enrollment and
frozen deployment separately. Partial deployment stops and retains individual results;
no automatic rollback, rebase or retry occurs. Do not use the old pinned deployment
wrapper or independent revision-zero cutover plan for this release.

All 30 previously indexed pre-cutover evidence files passed digest/size verification.
They remain historical unsigned observations: token-inventory 403s, broad administrator
rollback authority, no R2 lock and no proven R2 recovery or external-writer settlement.
Reuse the already performed nine-Worker/token review with original provenance and a
sandbox-specific conclusion; no new inventory is requested. Current credential
fencing, definite writer settlement, external generation/revocation retention and
actual recovery coverage remain operational blockers. Owner oversight is explicit,
never represented as independent review. No Cloudflare call or mutation was made
during this release-preparation session.

## Current local solo-policy implementation (2026-10-27)

`solo-operator-v1` is now implemented in the actual protected workflow, with strict
version-2 signed evidence, explicit owner/key/scope/artifact/generation pins and
chronology. Migration **0014** is forward-only and inert by default. No Cloudflare
resource/configuration, protocol, credential or enablement flag was changed during
this implementation. Existing pinned packages still describe the older deployed
candidate; they were not updated or re-signed. Historical independent-review
statements below describe that earlier candidate, not the new optional owner policy.

The independent v1 path remains explicit and backward compatible. Owner signatures
do not provide a second reviewer. Genuine writer-settlement evidence is still
mandatory; empty storage is not proof. See the
[solo policy, offline enrollment/signing and exact sandbox approval stages](portfolio-writer-cutover.md#solo-owner-policy-solo-operator-v1-local-implementation-not-activated).

Remaining operational blockers: owner-supplied public key/identity and offline key
custody; new reviewed candidate/public pins and migration/enrollment approval;
provider-verifiable deployment and credential/rollback fencing; actual legacy-writer
settlement records; externally retained immutable evidence/generation/revocation
history; and explicit protocol/import/test/finalization approvals. Account-wide
permissions and an owner rolling back both code and D1 cannot be prevented by this
code. Old-policy or revoked-generation portfolios remain blocked without a separate
reconciliation/recovery design. No production readiness is asserted.

The separate Cloudflare D1/R2 integration test already passed, but does not validate
this protected pipeline. Do not create another harness or environment. The next
live test must use new post-v2-epoch fixtures in the existing protected sandbox.

Local validation for this change: **326 portfolio tests passed**, ESLint passed,
offline Vite production client and both Worker bundles passed, and migrations
0001-0014 passed fresh/seeded in-memory integrity/default-preservation checks.
The regression suite includes both policy paths, confusion/key/revocation,
generation/rollback/restore, uncertain/untracked writer fencing, and the actual
application creation/upload/cleanup/recovery/finalization rehearsal. Test keys and
reports exist only as synthetic fixtures, not live authorization evidence.

Review date: 2026-10-27. **Both frozen sandbox Workers are deployed and verified
against candidate JavaScript. Protocol trust and destructive acceptance remain
blocked.** See [latest deployment verification](sandbox-deployment-verification.md)
for live version IDs, output clarification, fixes and tests. This report supersedes earlier
documents only for the isolated deletion sandbox. It grants no deployment or
remote-mutation approval.

## Solo-developer technical-test option

The sole developer has no independent reviewer. The current signed trust workflow
cannot honestly be passed by relabeling an owner audit as independent. No such
report, signature, policy bypass or change to that workflow was introduced.

A separate local-workerd/real-remote-D1/R2 integration harness is prepared at
`C:\Users\cezar\Desktop\bitreca-deletion-review\solo-integration-prepared`.
Initial package SHA-256: `634a348ee9e5f76872c6ffb58165ccbd01ed77ff6fa3896c2edda23e28112eea`.
Run ID: `e112e146-a32d-49f4-85ef-5afa4afe2939`.
Its only future resources are fresh D1 `bitreca-solo-delete-it-e112e146a32d-db`
and R2 `bitreca-solo-delete-it-e112e146a32d-r2`, in the already reviewed account.
The existing sandbox/application resources and pinned packages are excluded.

This harness has its own three `solo_it_*` tables and fixture lifecycle. It reuses
the existing tiny fixture generator, installed Wrangler/esbuild and Cloudflare
binding APIs; it does **not** execute or certify the protected application cleanup,
finalization, authentication or signed trust pipeline. A live pass demonstrates
real provider SQL/storage writes, HTML/folder/copy behavior, exact-key deletion,
lost-response recovery, retained manifests/receipts, B preservation and removal
of the harness's A row. The existing application tests remain separate evidence.

Prepared local files: `integration/solo-deletion/{worker.js,schema.sql}`,
`scripts/prepare-solo-deletion-integration.mjs`,
`scripts/run-solo-deletion-integration.mjs`, and focused harness regressions.
No new resources, live mutations, protocol changes or Worker deployments were run.
The six focused harness tests and changed-file ESLint pass; both driver modes were
also exercised without approval flags and made no requests. Existing app tests
were not repeated. The local package bundle and every package-file digest verify.
Public access is off; execution will be loopback-only local workerd with new remote
D1/R2 bindings. Remote-binding setup may create temporary provider preview/proxy
state and is included in the required setup approval, not silently preauthorized.

Approval gates (may be explicitly authorized together):

1. Create ONLY the two fresh named resources; stop on any name collision. Retain
   provider metadata, verify fresh ID/name and empty schema, bind the returned UUID
   locally using `prepare-solo-deletion-integration.mjs --bind PACKAGE METADATA_JSON`,
   apply only the separate harness schema, and start the localhost remote-binding
   session using the generated configuration. Never deploy an application Worker.
2. Authorize fake fixture writes, then run from the repository:
   `node scripts/run-solo-deletion-integration.mjs 'C:\Users\cezar\Desktop\bitreca-deletion-review\solo-integration-prepared' prepare --approve-fixture-writes`.
   This creates two fixture portfolios and 13 objects through bounded steps.
3. Authorize A-only deletion/finalization, then use the same driver with
   `delete --approve-fixture-deletion`. It deletes at most nine registered A keys,
   checks unknown keys/changed identity/uncertain writers, retains B and manifests,
   and records a clearly labelled integration result. Resource teardown is excluded.

Without the explicit approval flags the driver prints a plan and makes no request.
The initial local package cannot target a real D1 until its placeholder UUID is
replaced from fresh provider metadata and its local manifest is resealed. Local
tests use in-memory SQLite/mocked R2; no live result is claimed before approvals.
The exact protected signed workflow remains gated under the original trust policy;
any future owner-operated trust-policy change needs an explicit design decision.

## Scope and observed state

All original working-tree changes were preserved. No commit/reset/push, deployment,
permission change, protocol switch, deletion enablement, evidence import or remote
write/delete was performed. The original implementation session was offline; the
follow-up collected fresh GET/HEAD and fixed SELECT/PRAGMA evidence for the exact
sandbox only, plus local Wrangler dry-runs. Existing sandbox
configs remain frozen, private, without Cron and with deletion controls off.
Production, older staging and deletion-lab resources were untouched.

Fresh read-only observations confirm both deployed sandbox Workers at 100% traffic,
all 13 migrations, exact bindings, matching R2 sentinel custom metadata, zero
portfolios/allocations/unsettled writers/jobs/epochs, protocol 0 and disabled policy
revision 0. Both have no schedules/service routes, with workers.dev/previews off.
Prior authentication/freeze mutation checks remain reported historical results and
were not repeated. No live signed report or legacy-settlement finding was created.
See [fresh evidence and prior audit consolidation](sandbox-cloudflare-evidence.md).

Exact target identities and the unsigned independent checklist are in
[sandbox-writer-audit-checklist.md](sandbox-writer-audit-checklist.md).

## Audit result and changes

The local review covered repository/resource configuration, all 13 migrations,
admin authentication/Origin boundaries, marking/freeze and disposable-staging
guards, creation/birth provenance, both upload writers, publication/hosting,
signed inventory, bounded cleanup, leases/manifests/receipts, dispatch/retry,
atomic finalization, UI evidence, packaging/signing tools and operational docs.
No local audit can establish account permissions, deployed byte identity or
definitive settlement of external/legacy writes.

| Boundary | Finding/result |
| --- | --- |
| Authentication and marking | Server-side sessions and authoritative auth version; exact same Origin and typed portfolio ID; disabled request gate; staging requires disposable slug and trusted birth/scope. Freeze remains effective. |
| Writes and ownership | Fresh registered prefixes, per-PUT writer permit, awaited writes, uncertainty retained, CAS activation and SQL mutation fences. No age-based closure or automatic legacy adoption. |
| Inventory | Independent P-256 pin, canonical payload, scope/protocol/chronology, immutable birth/root seal/allocation history, paged complete snapshot and revision recheck. Max 2,000 allocations fails closed. |
| Cleanup | Exact prefix manifests precede DELETE; foreign/malformed listings rejected; bounded first-page sweeps; separate immutable batch/prefix/storage receipts. Identity and D1 revision rechecked through guarded adapter. |
| Verified bug fixed | Adapter policy revocation was caught as a transient R2 failure and dispatch entered automatic retry. It now retains `CONFIGURATION_BLOCKED`, blocks dispatch, preserves intent and requires explicit recheck after authority is restored. No safeguards were relaxed. |
| Finalization | Separate environment/D1 approval, atomic receipt/delete/release, fenced generation, permanent ownership tombstones and replay receipts. Environment flag alone cannot finalize. |
| Sandbox tooling | Exact sandbox pair validation and sealed offline artifact packaging added; legacy staging planner rejects sandbox packages; snapshot validator and SELECT/PRAGMA plans added. |
| Test coverage gap fixed | Standard portfolio command previously omitted the two portfolio `.test.mjs` files. It now includes both test extensions and new sandbox regressions; ESLint also checks these `.mjs` tests. |
| Sandbox hosting gap fixed locally | Fixed preview helper now permits the exact sandbox hosting Worker name with explicit opt-in, configured account hostname and fixed slug. Preview/access remain disabled; host spoofing and deletion-during-GET regressions added. |

Local tests cover untracked/open/uncertain writers, conflicts, deletion races,
partial/lost R2 and D1 responses, expired/stale leases, snapshot limits, replays,
revocation, foreign preservation, auth/CSRF, finalization rollback and recovery.
The exact sandbox-identity rehearsal additionally exercises frozen creation,
post-epoch births, both upload types, staging marking guards, cleanup-only state
and separate finalization. Test keys/reports exist only in disposable test memory.

## Files changed in this session

- Runtime: `worker/portfolio-deletion-config.js`,
  `worker/portfolio-cleanup-executor.js`, `worker/portfolio-deletion-workflow.js`.
- Sandbox preview: `shared/portfolio-staging.js`.
- Tests/config: `tests/portfolio-deletion.test.js`, new
  `tests/portfolio-sandbox.test.mjs`, `package.json`, `eslint.config.js`.
- Offline tools: `scripts/check-portfolio-config.mjs`,
  `scripts/prepare-portfolio-staging.mjs`, `scripts/portfolio-staging-plan.mjs`,
  new `scripts/check-portfolio-sandbox.mjs`.
- Evidence/docs: this report, `sandbox-writer-audit-checklist.md`,
  `sandbox-deletion-e2e.md`, `sandbox-deployment-artifact.json`.

No migrations, root production Wrangler files, older staging resource files or
sandbox resource configuration files were changed by this session.

## Validation

| Check | Result |
| --- | --- |
| Complete portfolio suite | **301 passed, 0 failed, 0 skipped**; includes both `.js` and `.mjs` tests |
| ESLint | PASS after resolving a test-only unused initial assignment |
| Production-mode offline build | PASS: Vite client (3 outputs) and both Worker bundles |
| Real-browser deletion UI | PASS: desktop/mobile, dialogs, typed confirmation, pending locks, retry/finalized evidence, auth expiry; loopback mocks only |
| Migrations | PASS: all 13, fresh and seeded in-memory databases, integrity/FK checks, D1-sized GLOB constraints |
| Default/staging static contracts | PASS; no resources accessed |
| Exact sandbox static contract | PASS; fresh D1 baseline validated and retained |
| Final sandbox package verification | PASS: 23 sealed files; retained manifest digest matches |
| Whitespace | `git diff --check` PASS |
| Remote cutover/E2E/recovery | NOT EXECUTED; independent evidence and explicit approval required |

Follow-up checks only: sandbox checker/snapshot validation PASS; five applicable
sandbox-tooling tests PASS; changed-tool ESLint PASS; guarded deployment default
plan mode PASS; both corrected Wrangler dry-runs PASS with emitted JS hashes equal
to sealed inputs. The completed full 301-test audit/build/UI suite was not repeated.
D1 foreign keys and supported `quick_check` passed read-only; `integrity_check`
was unavailable through D1 and is not claimed as a successful remote full scan.

Full-suite log: `C:\Users\cezar\AppData\Local\Temp\bitreca-deletion-tests-dff0cc23-1239-4133-8216-774f7fa1d98a.txt`.
Browser screenshots: `C:\Users\cezar\AppData\Local\Temp\portfolioforest-ui-uIR8qq`.
PowerShell blocked unsigned `npm.ps1`, so local commands used `npm.cmd` or Node
directly; Node/build/browser checks needed execution outside the filesystem sandbox.
Those approvals permitted local checks only and did not authorize remote actions.

Production compilation uses `check:portfolio-build`: real production-mode Vite/React and esbuild Worker
bundles, with Cloudflare integration and env-file loading bypassed. The standard
Cloudflare-integrated `npm run build`/deploy/preview paths were deliberately not
invoked because the root Vite configuration selects production Wrangler bindings.
Actual provider-runtime compatibility remains a remote acceptance requirement.

## Deployment artifact evidence

The original unsigned 23-file package was preserved outside Git and every digest
reverified, at:

```text
C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-76cf9c64aa605bb0
```

Retained manifest copy: [sandbox-deployment-artifact.json](sandbox-deployment-artifact.json).
SHA-256 of the exact manifest bytes:

```text
76cf9c64aa605bb0cfe685f917a79a8a4d4108969df43c1583439a34abaca52e
```

It seals 23 files: production-mode client, explicitly allowed static assets, both
actual Worker bundles, all 13 migrations and exact disabled sandbox configurations.
Main Worker: 74,895 bytes / 17,816 gzip. Hosting: 3,365 bytes / 1,521 gzip.
This is a **candidate local artifact**, not evidence of the currently deployed
version, not a signed audit and not a deployment approval. It is now in durable
local storage; the manifest alone cannot restore its files. Verify before review/use:

```powershell
node scripts/prepare-portfolio-staging.mjs --verify 'C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-76cf9c64aa605bb0'
```

A subsequent rebuild or approved configuration change creates a new candidate;
retain and compare its hash rather than silently replacing reviewed bytes.
Manifest integrity is not authenticity: pin the reviewed digest independently.

### Corrected deployable candidate

Wrangler dry-run found `--no-bundle` also discovers SQL/HTML modules throughout
the original package. A derived 23-file package now adds
`find_additional_modules:false` to both configs; all 21 other payload files,
including both Worker bundles, are unchanged. Both corrected dry-runs pass and
emit only their intended JS modules, byte-identical to the candidate inputs.

- Directory: `C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-module-discovery-off-20261027`
- Manifest: [sandbox-predeployment-artifact.json](sandbox-predeployment-artifact.json)
- SHA-256: `9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199`
- Original candidate remains unchanged as evidence; deploy only this corrected
  package through [the guarded procedure](sandbox-deployment-procedure.md).

The earlier pre-deployment observation of differing JavaScript is superseded:
both completed live deployments now match their pinned candidate modules, as
recorded in [deployment verification](sandbox-deployment-verification.md). Full
live static-asset inventory equality and immutable version-specific provenance
remain separate from current-script module verification.

The durable evidence directory contains 28 files and a separate hash index; see
[sandbox-cloudflare-evidence.md](sandbox-cloudflare-evidence.md) for actual version
IDs, module digests, account/scope, earlier findings and limitations. Previous
nine-Worker/token review was not repeated or treated as proof of legacy settlement.

## Automated sandbox verification and E2E preparation

```powershell
npm.cmd run check:portfolio-sandbox
node scripts/check-portfolio-sandbox.mjs --snapshot '<private-fresh-D1-json-file>'
npm.cmd run prepare:portfolio-sandbox
```

The checker validates exact sandbox names/IDs, both bindings/public identities,
frozen mutations, disabled controls, absent routes/Cron/environment overrides and
public-secret leakage. It prints exact read-only D1 commands without executing
them. `--snapshot` checks the initial migration list, empty counts, protocol 0 and
disabled runtime policy. It rejects unexpected/missing values. Offline input cannot
prove provider origin or freshness. Compare provider account, versions, sentinel,
credential authority and external writers independently.

The local executable rehearsal and the complete remote acceptance/recovery matrix
are in [sandbox-deletion-e2e.md](sandbox-deletion-e2e.md). The matrix supplies request
paths, multipart fields, confirmations, expected states and retained evidence.
No script silently enables gates, signs findings or executes remote mutations.

## Precise blockers and next approval

### Pre-cutover hand-off completed, 2026-10-27 17:27 UTC

No deployment investigation or nine-Worker inventory was repeated. Missing
read-only evidence is retained at
`C:\Users\cezar\Desktop\bitreca-deletion-review\precutover-20261027`.
`precutover-evidence.json` SHA-256 is
`46fa08f9b8d6cbc24b845c075cabd80dc86ca910b8cfae89cbcb97fb567a4383`.
It is explicitly unsigned observations, not independent approval or a signable
settlement assertion. The final `evidence-index.json` hashes the package files,
references, prepared commands and retained fake E2E fixture bytes.

Fresh facts: D1 allocations, origins, seals, allocation events, unsettled writers
and finalizations are all zero; protocol/policy revision remain 0 and runtime gates
off. Both account-token and user-token inventory reads return **403**; no additional
access was requested. One accepted member has **Super Administrator — All
Privileges**, so technical exclusion of privileged rollback is not established.
R2 has no lock rules and only a default seven-day multipart-abort rule. This is
neither in-flight settlement evidence nor a backup/restore guarantee.

The completed reviewed code confines the untracked generic media writer to
`projects/<UUID>.<extension>` (`worker/index.js:539`), outside portfolio namespaces;
portfolio HTML/folder PUTs use the registered writer helper (`worker/index.js:217`).
Hosting has no source write path. These scoped code findings, pinned module hashes
and empty registered history are reproducible; they do not exclude direct R2/S3/CI
credentials or a privileged code replacement. The independent reviewer must attach
the existing credential/writer review to this exact scope and prove settlement or
exclusion of each possible external/legacy writer. No timeout substitutes for proof.

Existing tools were extended rather than duplicated:

```powershell
node scripts/portfolio-evidence.mjs public-pin --public-key '<independently-obtained-public.pem>' --out '<new-public-pin.json>'
node scripts/check-portfolio-sandbox.mjs --cutover-plan 'C:\Users\cezar\Desktop\bitreca-deletion-review\precutover-20261027'
```

The public-pin command validates P-256 PUBLIC PEM, exports base64 DER SPKI and its
SHA-256; it generates no key and changes no configuration. Signature verification
now supports `--expected-signer <independently-confirmed-DER-SHA256>`. The existing
sign/verify workflow remains available, with private keys external and no live
attestation created. Two signing/pin and two conditional-plan/SQL tests passed;
changed-tool ESLint and both generated PowerShell template parsers passed.

Prepared `protocol-1-cutover.NOT-APPROVED.ps1` and
`evidence-import.NOT-APPROVED.ps1` are unexecuted command templates. They require
separate approvals and external inputs; cutover is conditional on protocol 0,
empty immutable history and disabled revision-0 runtime policy, with exact account,
package pin and sandbox D1 binding. Import binds the exact provider-derived sandbox
origin, independent signer fingerprint, scope/artifact/audit hashes and existing
authenticated session; redirects are forbidden. Current public access stays off.

Nine fake E2E source files (1,501 bytes) were prepared using the existing fixture
tool and preserved with verified digests. They are recoverable inputs for disposable
test uploads, not evidence of a tested D1/R2 restore. The existing E2E matrix remains
the next execution stage after independent review, key/pin provisioning, approved
protocol cutover and approved import/access changes. Then separately approve
post-epoch fixtures/marking, cleanup/Cron, and finalization. No credentials,
permissions, server configuration, protocol or remote data changed in this session.

**Latest update:** the user-approved deployment activated main
`8cd0d626-b2f3-45e9-b813-5f6fecdc6701` and hosting
`c94bc0ed-f2b5-4734-bc08-68510bd7f7f1`, both at 100%. Fresh GET checks confirm
exact candidate JS, frozen/private settings, expected bindings and no routes/Cron.
Hosting's earlier upload is in the local Wrangler log despite its omission from
the supplied output excerpt. No corrective deployment is needed. The rest of this
section records the earlier Stage A preparation; do not interpret its command as
a request to repeat deployment. Next work is the independent cutover prerequisites.

**Ready for deployment approval:** corrected sealed package, per-file verification,
fresh empty/disabled provider baseline, exact bindings/identity, JS mismatch
comparison and successful corrected dry-runs are complete. No remaining local
implementation blocker was identified for deploying these frozen Workers.

Next approval is **only** Stage A in
[sandbox-deployment-procedure.md](sandbox-deployment-procedure.md): deploy both fixed
sandbox Workers/static assets from the corrected manifest pin, keeping freeze true,
all deletion controls off, no public access/routes/Cron. After explicit approval:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-sandbox-reviewed.ps1 -Approved
```

The script stops on package/account/version/baseline drift. Without `-Approved`,
it only prints the plan. No approved branch was executed in this task.

Remaining **after** frozen deployment, as separate approval stages:

1. Read back new deployment versions, source modules, bindings/flags/routes and
   assets. Resolve any provider/candidate discrepancy before trusting the artifact.
2. Independent reviewer reconciles the previous nine-Worker/token review with
   exact sandbox writer/credential authority and definitive settlement/exclusion
   evidence. Deployment-token/rollback powers and recovery/restore arrangements
   remain unresolved; no generic inventory repetition is requested.
3. Separately approve monotonic protocol-1 cutover only after that evidence.
   Protocol 0 currently blocks trust import/automatic deletion. No timeout or empty
   count establishes writer settlement.
4. Independent auditor supplies authenticated P-256 public pin and genuine signed
   audit/artifact report. Pin absent and epochs 0 today. Separately approve control
   config changes, restricted access, temporary unfreeze/import, then disable import.
   The freeze blocks evidence import too; no implicit public exposure is permitted.
5. Approve disposable post-epoch creation/uploads and exact-ID marking, then
   separately approve cleanup/runtime revision/Cron and finally finalization.
   Complete the prepared E2E/recovery matrix while retaining foreign assets,
   sentinel, manifests, receipts and tombstones. Real destructive acceptance is
   still pending; no production authorization is implied.

Follow-up files added: `scripts/collect-sandbox-readonly-evidence.mjs`,
`scripts/deploy-sandbox-reviewed.ps1`, `docs/sandbox-cloudflare-evidence.md`,
`docs/sandbox-deployment-procedure.md`, `docs/sandbox-predeployment-artifact.json`.
Updated preparation/checker/config-validation tools, focused sandbox regression,
this readiness report and audit/E2E document cross-references. No runtime Worker,
schema, resource config, production or older-staging file was changed in this pass.

Remaining work depends on independent evidence and explicit remote-action approval.
Legacy reconciliation beyond post-epoch births remains deliberately unsupported;
this session does not certify old portfolios for deletion or authorize production.
