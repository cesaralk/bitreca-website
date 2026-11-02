# Frozen sandbox deployment verification — 2026-10-27

This verification task made GET/SELECT reads and local fixes/tests only. The
deployments below were performed by the user's earlier approved command, not by
this task. No protocol/policy writes, R2 deletion, rollback or deployment was run.

## Live result

| Exact Worker | Latest active version | Deployment ID | Traffic |
| --- | --- | --- | --- |
| `bitreca-main-delete-sandbox-20261025` | `8cd0d626-b2f3-45e9-b813-5f6fecdc6701` | `4155bbe0-eee0-4814-a5c1-31fb35f56441` | 100% |
| `bitreca-hosting-delete-sandbox-20261025` | `c94bc0ed-f2b5-4734-bc08-68510bd7f7f1` | `555671e9-a0b3-40de-bdb4-f57fec5b5f10` | 100% |

The main deployment was created at 2026-10-27 16:42:22 UTC; hosting at 16:42:39 UTC.
The original main `10047b0a...` and hosting `f2e95989...` versions remain in history
but are not the versions selected by the latest deployments. The new main is
active, not merely uploaded. Public serving remains intentionally disabled.

Both live JavaScript modules match the pinned candidate exactly through GET
`content/v2`, bracketed by stable latest-deployment reads:

- Main SHA-256: `b2d37a6f27b8d204c33a76756b04f3ae6f3f0aec17f508af1a7b29902e31ac46`.
- Hosting SHA-256: `1f5a9c265f7774d03a3244f115ee6ac008e851fa45117d9d66e66a2972ef44d4`.

The source endpoint describes current-script content; this is not a claim of
immutable per-version source provenance or full static-asset inventory equality.

## Why hosting appeared missing

Hosting was **not missing**. The retained local Wrangler logs contain both uploads:

- `%APPDATA%\xdg.config\.wrangler\logs\wrangler-2026-10-27_16-42-03_020.log`:
  main uploaded, no targets, version `8cd0d626-b2f3-45e9-b813-5f6fecdc6701`.
- `%APPDATA%\xdg.config\.wrangler\logs\wrangler-2026-10-27_16-42-30_455.log`:
  hosting uploaded, no targets, version `c94bc0ed-f2b5-4734-bc08-68510bd7f7f1`.

The supplied output excerpt omitted the hosting section; the reason the terminal
excerpt omitted it cannot be established from Cloudflare metadata. The installed
Wrangler code prints `No targets deployed` when its routing-target list is empty.
It does not mean no version was activated. No loop-skipping defect was reproduced.

The old script's completion message happened to agree with this run, but only
checked native exit codes. It lacked individual post-deployment verification and
could have reported success for an uploaded-but-inactive or incorrect result.
An additional confirmed bug selected `history[0]`, even though this account's
history is oldest-first. That checked obsolete versions instead of current ones.
The read-only evidence collector had the same ordering assumption; both are fixed.

## Local fixes and regressions

`scripts/deploy-sandbox-reviewed.ps1` now:

1. Pins its expected baseline to the two actual versions above.
2. Selects the latest deployment by parsed timestamp, rejecting ambiguous timestamps
   or split/non-100% traffic, without relying on array order.
3. Uses a tested sequence requiring exactly the two distinct sandbox Workers.
4. Rechecks the sealed package before each upload, captures/presents each CLI
   output and exit code, and requires exactly one uploaded version ID.
5. Runs a GET-only verifier for each Worker/version and reports per-Worker verified
   progress. Full success is emitted only after both independently pass.

The new `scripts/verify-sandbox-deployment.mjs` checks active version, live version
and current settings bindings/vars, frozen controls, private access, no routes/Cron,
and exact single-module JavaScript hash. Token stdout from existing Wrangler auth
resolution stays in memory. No credential values are printed or written as evidence.

Local validation:

- `tests/sandbox-deployment-sequence.ps1`: 11 passing checks, with mocked deployment
  and verification callbacks only. Both distinct Workers are targeted/verified once;
  main/hosting upload failure, hosting verification failure, upload without activation,
  wrong Worker verification and missing version ID never report full success.
  Chronology is tested in both orders; duplicate targets rejected.
- `tests/portfolio-deployment-verification.test.mjs`: 7 tests passed using fake
  authentication and mocked GET responses; both Worker types, chronology, inactive
  version, wrong bytes, unfreeze and public access covered. Network is not used.
- Full deployment-script PowerShell parser: zero errors; plan-only mode exits 0
  and prints two commands. Changed JavaScript/test ESLint passed.
- No full portfolio-suite rerun; the completed 301-test baseline remains historical.

## Safeguards and preserved artifacts

Both original and corrected package files were verified without modification.
Manifest pins remain `76cf9c64aa605bb0cfe685f917a79a8a4d4108969df43c1583439a34abaca52e`
and `9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199`.

Live version metadata and current settings agree on sandbox D1
`9c236935-b942-4cd7-9360-fed24db999fa`, sandbox bucket
`bitreca-delete-sandbox-r2-20261025`, scope, mutation freeze and all configured
disabled deletion/import/cleanup/finalization/scheduling/preview controls.
workers.dev/previews are off; both service-route and schedule lists are empty.
Any absent hosting execution flag is disabled by default; hosting executes no cleanup.

Fresh read-only D1 baseline still has 13 migrations, zero portfolios/allocations/
unsettled writers/jobs/epochs, protocol 0, policy revision 0 and cleanup/finalization
0. Provider metadata reports `rows_written:0`, `changed_db:false`.

## Shortest safe next procedure

**No corrective deployment is needed. Do not redeploy hosting to fix an omission
that exists only in the supplied output excerpt.** Frozen deployment verification
is complete; independent writer/credential/rollback/recovery evidence and signer
trust still block protocol cutover/destructive testing.

If another deployment is explicitly required and separately approved later, the
guard now uses the current version IDs above. The exact approval-gated command is:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-sandbox-reviewed.ps1 -Approved
```

This command is NOT recommended or authorized merely to repeat today's successful
deployment. Without `-Approved`, it is local plan-only. No old baseline is silently
accepted. On partial failure, stop; retain actual versions and re-review state,
without rollback, policy changes, or resetting evidence. The later cutover/import/
deletion stages remain separately gated in [deployment procedure](sandbox-deployment-procedure.md).
