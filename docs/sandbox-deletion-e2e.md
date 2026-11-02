# Deletion sandbox E2E acceptance procedure

For solo-owner testing, first complete the separately approved
[solo policy stages](portfolio-writer-cutover.md#existing-protected-sandbox-exact-approval-stages).
The actual Worker rehearsal now exercises both independent-v1 and solo-operator-v1
with migrations 0001-0014, including ten-file solo uploads, partial cleanup recovery,
preserved B, receipts and separate finalization. Its keys and evidence are synthetic
in-memory fixtures, never deployable attestations. Historical v1 evidence commands
below do not authorize a solo test: use the explicit version-2 signing procedure.

Prepared 2026-10-27. **Remote mutation steps below are NOT authorized or executed.**
Use only `wrangler.delete-sandbox.jsonc` and `wrangler.delete-sandbox-hosting.jsonc`.
The older staging and deletion-lab environments are excluded. See
[readiness](sandbox-deletion-readiness.md) for exact resource IDs and blockers.
The deployment, cutover, signing/import and destructive-test approvals are separated
in [sandbox-deployment-procedure.md](sandbox-deployment-procedure.md); Stage A alone
permits only deployment of frozen code. Fresh baseline/identity observations are
retained in [sandbox-cloudflare-evidence.md](sandbox-cloudflare-evidence.md).

## Executable offline rehearsal

```powershell
node --test --test-name-pattern="sandbox E2E rehearsal|complete customer workflow|revocation|revoked|lost|partial|uncertain" tests/portfolio-deletion.test.js
npm.cmd run prepare:portfolio-fixture
```

The rehearsal uses actual Worker handlers and migrations 0001–0013 with in-memory
SQLite, fake R2, fake credentials, and ephemeral test keys. It prohibits network.
It covers frozen creation, a post-epoch birth, HTML and folder uploads, preserved
assets, staging disposable-slug/legacy guards, marking, disabled execution,
one-operation cleanup, lost DELETE responses, immutable manifests and receipts,
independent finalization approval and retained foreign portfolios. The larger
customer workflow additionally covers publishing/hosting, delayed writers,
partial DELETE and concurrent mutation fencing. These are local simulations,
not proof of provider behavior or legacy settlement.

## Remote preparation gate

Before the remote trial, obtain explicit approval for the exact sandbox changes:
deploying reviewed bytes, protocol cutover, verifier public pin, lifting the
mutation freeze, evidence import, disposable uploads, marking, cleanup/Cron and
finalization. They are distinct actions; approval of an audit is insufficient.
Do not create a diagnostic executor HTTP route or bypass the scheduled dispatcher.
No external failure proxy or permission changes are needed for this procedure.

Retain the fresh baseline, approved account and Worker version IDs, reviewed
deployment manifest hash, independently signed audit, R2 sentinel HEAD metadata,
auth checks, minimum protocol and runtime-policy revisions. Creation must occur
**after** the verified epoch and protocol 1. A pre-cutover test portfolio cannot
later be auto-certified. Leave it blocked rather than rewriting its birth.

The supplied configs currently disable public access and preview. A remote hosting
check needs separately approved sandbox access and the exact provider hostname.
The fixed preview helper now accepts `bitreca-hosting-delete-sandbox-20261025`
on `workers.dev` as well as the existing older staging host. Configure only the
exact sandbox hostname and one `delete-test-` slug in the approved sandbox pair;
do not point it at older staging. Preview and public access remain off locally.
Local hosting tests pass; live sandbox hosting acceptance remains pending approval.

## Remote test matrix, after the relevant approvals

Use a unique run suffix and record returned portfolio/job IDs privately. Authenticate
through the existing admin login in an operator session; do not put cookie or
password values in scripts, arguments, evidence files or logs. Every mutation uses
the exact same-origin `Origin` header and admin cookie. Reject redirects to another
origin. Start with `delete-test-<run>-a` and `delete-test-<run>-b`, fresh after epoch.

| Step | Request/action | Required result and retained evidence |
| --- | --- | --- |
| Frozen baseline | Attempt create/upload/mark/retry/import while frozen | 503; unchanged D1 counts and R2 bytes |
| Create A/B | `POST /api/admin/portfolios`, `{name,slug}` | 201; distinct server-generated initial UUID prefixes, birth seal and epoch; closed zero-write root writers |
| HTML A | `POST /api/admin/portfolios/<A>/upload`, multipart `file=index.html` | 200; new allocation, closed writer, owned activation |
| Folder A/B | `POST .../<id>/upload-folder`, paired multipart `files` and `paths` | 200; use four-file fixture folders, different bytes with matching filenames; each PUT registered before issuance |
| Replace HTML A | HTML upload again | New active prefix; CSS/JS/SVG bytes and metadata preserved; historical versions retained |
| Publish/unpublish A | `PATCH .../<A>/status`, `{status:"published"}` then `{status:"draft"}` | Revision advances; approved hosting shows content then refuses it; do not use production hosts |
| Negative marking | Wrong/missing confirmation; non-`delete-test-` slug; legacy or wrong epoch/scope | 400 or 403 as applicable; no marker/job/storage deletion |
| Mark A | `DELETE .../<A>`, `X-Portfolio-Delete-Confirm: <exact A>` | 202; record job UUID; atomic draft/marker/revision; no storage deletion with execution off |
| Retry marking | Repeat the same marked-ID request | Same job UUID and no new revision while row exists; after finalization use job status, not portfolio DELETE |
| Frozen row | Edit/publish/upload A, GET hosted A | Mutation 409; hosted 404 under approved access; unrelated B unchanged |
| Status/recheck | `GET /api/admin/portfolio-deletion-jobs/<job>` and `POST .../<job>/retry` | Sanitized status, no keys/tokens; recheck does not settle writers or delete bytes |
| Cleanup only | Approved matching D1 policy + cleanup flag; one-operation budget; approved low-cadence Cron | New post-attestation manifests before DELETE; closed writers only; counts reflect unique receipts; B and sentinel unchanged |
| Cleanup complete | Poll status with bounded operator deadline | `storage_verified`; every allocation has empty-prefix receipt; all batches confirmed; portfolio row still exists; no final receipt |
| Environment-only finalization | Finalization flag while D1 finalization remains off | Row remains; no permanent receipt |
| Finalization | Separately approve D1 finalization revision and environment flag, then safe retry/Cron | Exactly one permanent receipt; A absent; allocations, origins, manifests, receipts, job and tombstones retained |
| Replay | Status and repeated job recheck after completion | Still finalized, immutable receipt/counts, no object resurrection or duplicate receipt |
| Reuse slug | Create new disposable portfolio with old A slug, if approved | Fresh portfolio ID/prefix; no old file inheritance |

The per-job status path is `/api/admin/portfolio-deletion-jobs/<job>`; job listing
and capabilities are separate GET endpoints. Check foreign-key and SQLite integrity
after the run using the read-only commands from `check:portfolio-sandbox`.
Inspect R2 using only the recorded allocation prefixes, never a bucket-wide cleanup.
Do not automatically delete B or later fixture portfolios: each marking needs the
same approved scope and exact-ID confirmation.

## Recovery acceptance

1. With a multi-step cleanup pending, separately approve disabling cleanup and
   incrementing the D1 revision. Verify no new R2 DELETE is issued. A call already
   issued may settle; preserve its manifest and receipts. Restore reviewed authority
   and use admin retry; the next lease must replay retained intent safely.
2. Stop before finalization. Verify `storage_verified` survives worker inactivity
   and admin reload. Authorize finalization separately and retain its permanent
   receipt. Do not reset generations, dispatch rows or history.
3. Simulate partial DELETE, lost D1/R2 responses, expired leases, uncertain writers
   and interrupted finalization **only in the offline fault-injection suite**.
   Do not break real credentials, kill active writers or fabricate writer closure
   to manufacture a remote incident. An actual uncertain writer stays blocked until
   independent definitive evidence exists; no timer or retry can settle it.

Stop if scope, account, writer history, signature, identity or receipt counts differ.
Retain the job ID, timestamps, sanitized response/error codes, revisions, actual
deployment versions and private provider logs. Report pass/fail/pending separately;
do not call local failure injection a completed remote recovery trial.
