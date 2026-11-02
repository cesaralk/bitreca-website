# Reviewed sandbox deployment and approval stages

Prepared 2026-10-27. **Stage A was subsequently executed under the user's separate
approval; both Workers are now verified.** This verification task performed no
remote mutation. See [actual deployment result](sandbox-deployment-verification.md).
This is the one deployment procedure for the fixed Workers. It replaces using the
older staging command planner or the original package directly for deployment.

## Stage A: approve frozen deployment only

Deployable candidate, outside Git:

```text
C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-module-discovery-off-20261027
```

Manifest SHA-256:

```text
9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199
```

The original 23-file package is separately preserved at
`C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-76cf9c64aa605bb0`,
with its original manifest pin `76cf9c64aa605bb0cfe685f917a79a8a4d4108969df43c1583439a34abaca52e`.
All original payload bytes are retained. The derived package changes only the two
Wrangler configurations to add `find_additional_modules:false` (and serialize JSON
formatting), plus their size/digest entries in the new manifest. No Worker/client,
migration or asset bytes changed.

This correction is required because actual Wrangler 4.139.0 dry-runs otherwise
attach all 13 SQL migrations and `client/index.html` as extra Worker modules under
`--no-bundle`. Corrected dry-runs emit only the appropriate JavaScript Worker;
main static assets are uploaded through the assets binding. Both emitted JavaScript
digests equal the sealed input digests. The original package remains evidence,
but the guarded procedure deploys only the corrected package.

Requested approval: **deploy both exact sandbox Workers and main static assets
from this corrected pinned package, preserving the mutation freeze, all deletion
flags off, no routes, no Cron and public access off.** This approval does not cover
protocol/policy writes, credential changes, evidence import or customer operations.
Independently signed settlement is a later cutover prerequisite, not needed to
replace frozen code while storage execution remains disabled.

From the repository directory, the reviewed command is:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-sandbox-reviewed.ps1 -Approved
```

The default command without `-Approved` is plan-only and was exercised locally.
The approval switch is an operator gate; it must only be used after explicit user
approval. The script rechecks every package digest, exact sandbox identities,
disabled controls/module discovery, expected account, current versions at 100%,
empty D1 baseline, protocol/policy revision 0 and migration names. It pins account
`4ec868eac2a3b9127531ad39d2501f15` for the child Wrangler commands and stops on drift.
It uses the installed Wrangler 4.139.0, absolute package configs, `--no-bundle`,
`--no-autoconfig` and `--strict`. It does not invoke root Vite/deploy scripts,
`--env`, name/route overrides, migrations, secret commands or scheduling.

Current baseline expected by the guard:

| Worker | Expected current version / traffic |
| --- | --- |
| `bitreca-main-delete-sandbox-20261025` | `8cd0d626-b2f3-45e9-b813-5f6fecdc6701` / 100% |
| `bitreca-hosting-delete-sandbox-20261025` | `c94bc0ed-f2b5-4734-bc08-68510bd7f7f1` / 100% |

These are the newly verified current versions, not the original pre-deployment
baseline. No corrective deployment is required. The guarded script now selects
the newest deployment by timestamp and requires per-Worker active-version/source/
frozen-configuration verification before its final success message.

The two deployments are not atomic. On any failure, stop with the freeze and
execution flags off, retain output/version IDs, and read current metadata. Do not
automatically roll back or retry both uploads. Re-review the guard's expected
versions before any separately authorized recovery deployment.

After successful approval/execution, collect fresh read-only evidence into a NEW
directory, retaining actual new version IDs, bindings, schedules, routes and source:

```powershell
node scripts/collect-sandbox-readonly-evidence.mjs 'C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-module-discovery-off-20261027' 'C:\Users\cezar\Desktop\bitreca-deletion-review\evidence-after-approved-deploy'
```

Require single-version 100% deployments, exact D1/R2 bindings, freeze true,
deletion/import/execution/finalization/schedule/preview off, absent routes/Cron and
workers.dev/previews disabled. Compare returned JavaScript modules with sealed
candidate modules. Check main assets separately: successful module comparison
does not prove the full deployed static asset inventory. Keep all flags off on
any discrepancy. No mutation/authentication test is included in this read-only stage.

## Stage B: approve protocol-1 cutover separately

Complete the independent [writer checklist](sandbox-writer-audit-checklist.md),
using the previous nine-Worker/token review as historical input without rerunning
that account inventory. Resolve current sandbox-bucket writer/credential authority,
historical in-flight writes, legacy rollback/deployment rights and recovery.
Empty D1 and a frozen Worker are not proof that external/untracked writes settled.
Retain actual findings and source records; the coding agent has not attested them.

After genuine independent approval and a fresh baseline, the only policy change is
the conditional protocol-1 UPDATE shown in the writer checklist, against database
`9c236935-b942-4cd7-9360-fed24db999fa`. Review the exact command separately before
execution. Require one changed row and a separate readback. Never lower protocol,
reset writer records, or use this switch as proof of settlement. Keep all execution
flags and the mutation freeze unchanged.

## Stage C: independent signing, then approve pin/import separately

The independent auditor supplies the genuine audit and separately authenticated
P-256 public pin. No private signing key is generated or copied by this task.
Use the **corrected** deployment manifest above as `--deployment`, and the retained
independent audit bytes as `--audit`. The canonical report is prepared by the
auditor using the schema in [operations](portfolio-deletion-operations.md).
Only the auditor may truthfully assert `legacy_writers_settled:true` after proof.

```powershell
node scripts/portfolio-evidence.mjs sign --report '<external-report.json>' --private-key '<external-private.pem>' --scope 'portfolioforest/staging/bitreca-delete-sandbox-r2-20261025/9c236935-b942-4cd7-9360-fed24db999fa' --deployment 'C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-module-discovery-off-20261027\deployment-artifact.json' --audit '<independent-audit>' --out '<new-external-evidence.json>' --acknowledge-independent-audit
node scripts/portfolio-evidence.mjs verify --evidence '<new-external-evidence.json>' --public-key '<independently-pinned-public.pem>' --scope 'portfolioforest/staging/bitreca-delete-sandbox-r2-20261025/9c236935-b942-4cd7-9360-fed24db999fa' --deployment 'C:\Users\cezar\Desktop\bitreca-deletion-review\candidate-module-discovery-off-20261027\deployment-artifact.json' --audit '<independent-audit>'
```

These are incomplete auditor templates, not commands executed or evidence signed
in this session. Pin configuration and enabling import require a separately
reviewed configuration artifact and approval. The freeze must temporarily be lifted
for import; it also blocks this endpoint. Approve the exact restricted access path
and origin first; workers.dev/public routes currently remain disabled. Do not enable
public endpoints or Cloudflare Access/permission changes implicitly.

Import only through authenticated same-origin
`POST /api/admin/portfolio-protocol-evidence`, with execution/Cron/finalization and
marking still off. Read back the immutable epoch, disable import, and re-freeze as
appropriate. Retain actual version IDs and approved control-only changes linking
this stage to the audited writer artifact. Changed write-capable code, resource
scope or writer authority requires a new audit/epoch.

## Stage D: approve creation/uploads and marking separately

Approve the exact sandbox access mechanism, temporary mutation unfreeze, and
disposable `delete-test-` portfolio operations described in
[E2E acceptance](sandbox-deletion-e2e.md). Create only after the trusted epoch.
Keep cleanup/finalization/Cron off. Confirm both upload types and writer history,
then approve exact-ID marking; verify mutation fencing and retained storage.
Do not use an older staging hostname or reinterpret legacy rows as trusted births.

## Stage E: approve cleanup/scheduling, then finalization separately

First approve the conditional D1 runtime-policy revision with exact account/scope,
bucket/database/public-key fingerprint, `cleanup_enabled=1`, `finalization_enabled=0`;
then approve cleanup flag plus low-cadence Cron. Keep the one-R2-operation budget.
Inspect manifests, unique receipts, foreign portfolio preservation and recovery.
Only after `storage_verified`, separately approve finalization in BOTH D1 and
environment and trigger a safe recheck. Retain the one permanent finalization
receipt, all allocation tombstones and recovery bookkeeping. No destructive
configuration commands are preauthorized by Stage A.
