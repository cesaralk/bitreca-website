# Generation-3 recovery — prepared, not authorized

## Guarded execution adapter prepared (2026-10-29)

Owner reports generation-3 encrypted key generation/usability succeeded. Do NOT
regenerate keys. Only its public PEM/pin was inspected during executor preparation:
SPKI SHA-256 `7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e`.
The earlier key-generation instructions below are historical, not the next action.

`scripts/execute-generation3-recovery.mjs` now supplies one guarded procedure for
`activate2`, `enroll3`, `activate3`, reusing `generation3-recovery.mjs`. No TEMP table,
explicit BEGIN/COMMIT, schema change, or additional deployed Worker is required.
The adapter uses the documented [D1 REST batch request](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
and [D1 batch transaction rollback semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
Each batch has three parameterized statements: assert complete pre-state, perform
one transition, assert complete expected post-state. Failed assertions raise a SQL
error and roll back the batch, including trigger-induced revision changes. No new
evidence, revocations, protocols, runtime signer changes or destructive operations.

Default command performs no network/credential/key access:

```powershell
node scripts/execute-generation3-recovery.mjs --stage activate2
```

**Exact next approval: read-only generation-2 activation preflight only.** After
approval run (existing parent directory; output must not exist):

```powershell
node scripts/execute-generation3-recovery.mjs --stage activate2 --preflight "C:\Users\cezar\Desktop\bitreca-deletion-review\generation3-activate2-plan.json"
```

This checks the exact account, D1 name/UUID, R2 bucket, sealed candidate, both
existing pinned live Worker versions/configuration/bytes/bindings, disabled controls,
private exposure, schedules, schema and full immutable generation-1/2 enrollments.
It saves a public JSON plan and prints its SHA-256. Unexpected versions STOP; do not
substitute obsolete IDs or deploy. If actual versions have legitimately changed,
review their retained evidence separately before revising the adapter pins.

Review the public plan/digest. Within 30 minutes, a SECOND, explicit approval is
required for the one write:

```powershell
node scripts/execute-generation3-recovery.mjs --stage activate2 --execute "C:\Users\cezar\Desktop\bitreca-deletion-review\generation3-activate2-plan.json" --sha256 <reviewed-plan-SHA256> --approved-stage activate2
```

The literal digest is intentionally not fabricated before fresh preflight. The
adapter repeats remote identity/config and D1 checks, re-derives the batch, fsyncs an
exclusive intent receipt before the single batch, verifies exact post-state and
rechecks both Workers afterward. Existing intent blocks reuse. HTTP errors, failed
reads, lost responses and incomplete verification stop without retry or rollback;
use read-only reconciliation, never delete the intent to force a rerun. A failure
after commit does not mean nothing changed. Retain intent/completed/unresolved
receipts beside the external plan. Do not call the older review-only TEMP SQL.

After confirmed activation2 completion, prepare a NEW `enroll3` preflight plan;
review/approve that stage independently. No stage chains automatically. Enrollment
execution additionally requires `--backup-receipt <external-public-JSON-path>`.
The owner must first verify a genuinely offline encrypted backup and test passphrase
recovery privately. Public confirmation format (contains NO backup path or secret):

```json
{
  "operator": "bitreca-owner",
  "fingerprint": "7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e",
  "encryptedOfflineBackupVerified": true,
  "passphraseRecoveryTested": true,
  "verifiedAt": "REPLACE WITH ACTUAL INTEGER UTC SECONDS AFTER VERIFICATION"
}
```

The tool validates this explicit owner assertion; it cannot independently prove
physical offline custody or recovery. Do not fabricate the confirmation. The backup
receipt and plan must be external public JSON files outside the key directories.
The script never reads encrypted key material. The enrollment timestamp is captured
at preflight (not future-dated); plans expire after 30 minutes. Activation3 obtains
the actual enrolled UUID/time and verifies the entire immutable generation-3 row.
Use new `--stage activate3 --preflight <new-path>` and separately approve its matching
`--execute ... --sha256 ... --approved-stage activate3` only after enroll3 succeeds.

Database comparisons are atomic; Cloudflare Worker/control-plane checks necessarily
bracket the transaction and cannot lock out the sole administrator or another
deployment credential. No concurrent deployment/configuration/restore/credential
operation is permitted during these stages. Permissions and workstation/offline
backup custody remain operator responsibilities. All stages preserve current code,
disabled flags, protocol 1 and old history. Generation/config mismatches remain
fail-closed until a separately approved owner-pinned successor deployment.

Focused offline execution tests use real SQLite plus mocked batch transport for
all three stages, rollback/partial failure, stale state, lost committed responses,
replay/intent protection and backup gating. They are not a live D1 execution test.

No keys generated, Cloudflare operations performed, or state independently refreshed
during this preparation. Starting state is owner-provided: generation 1 active,
generation 2 enrolled/inactive, revision 1, protocol 1, zero portfolios/epochs.
Generation-2 fingerprint:
`2b0c4db371b429f5af93a57900133df8599504116ef96ad9522bd06704cc1012`.
Preserve both old encrypted keys, policies, evidence and all existing packages.
Unavailable passphrases do not authorize bypassing signature verification.

## Next approval: local key generation only

Review `scripts/prepare-generation3-key.ps1` and the two secret-input helpers it
extracts from `prepare-solo-owner-key.ps1`. Default invocation is PLAN ONLY:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-generation3-key.ps1
```

After explicit approval of ONE attempt, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-generation3-key.ps1 -ApprovedGeneration3Key
```

This opens a visible private Windows console. Disable transcripts, screen sharing,
recording and shell debugging beforehand. Enter a newly chosen >=20-character
passphrase twice at hidden prompts. No passphrase in chat, arguments, environment
or files. Secret handoff is only local anonymous stdin to OpenSSL; private bytes
never leave the protected directory. Output is AES-256-CBC encrypted PKCS8 P-256;
usability and public-curve verification follow. No automatic retry. Existing output
directory is a hard stop, even if empty; preserve partial results for inspection.
No earlier key is overwritten or removed. Private directory permits only owner and
SYSTEM, without changing parent permissions. Keep the workstation trusted; software
cannot prevent administrator access, malware or console recording.

Verify the public SPKI fingerprint on the owner machine. Preserve an encrypted
offline backup and independently test its passphrase before any remote enrollment.
Only public PEM/pin may leave `C:\Users\cezar\BitrecaOwnerKeys\solo-owner-generation3`.

## Separately approved transitions

`generation3-recovery.mjs` is an offline preparation library, not a remote runner.
`prepareRecoverySQL(snapshot, stage, enrollmentInputs)` returns REVIEW-ONLY SQL;
`validateRecovery` rejects incorrect targets/state/flags. No supplied SQL is trusted:
generation-3 enrollment is rebuilt using existing P-256 enrollment tooling. Inputs
include public PEM, exact scope, reviewed code-artifact bytes, new policy UUID,
generation 3, operator `bitreca-owner`, and actual enrollment timestamp.
Never use synthetic snapshots/tests as live evidence.

Before EACH future operation, separately approve a concrete execution plan after
fresh read-only D1 and BOTH Worker/config checks. Pin the complete immutable policy
rows, active policy ID, public fingerprints, artifact hashes and reviewed runtime
scope/bindings; preserve receipts outside Git. All controls: mutations frozen,
deletion/import/cleanup/finalization/schedules/public access disabled. Zero portfolios,
allocations, jobs, epochs and unsettled writers required. No credential changes.

1. **Activate generation 2 only:** require generation 1/revision 1, exact enrolled
   generation-2 policy/key and no revocations. Expect generation 2/revision 2.
   No signature is needed for this administrator transition; it provides no settlement
   evidence. Old deployed generation-1 pins will fail closed. Do not unfreeze them.
2. **Enroll generation 3 only:** require generation 2/revision 2, exactly two immutable
   policies, new verified public key, reviewed code digest and actual timestamp.
   Insert only; do not use the existing combined enroll-and-activate SQL verbatim.
   Expect generation 2/revision 2 still active, three retained policies.
3. **Activate generation 3 only:** independently verify that exact enrollment,
   generation 2/revision 2 and all disabled flags; expect generation 3/revision 3.
   Never skip or decrease generations; never revoke/delete old keys as a shortcut.

The prepared SQL includes assert-before-write checks and row-count assertions.
It is NOT a Cloudflare execution command. A future reviewed adapter must use a
provider-supported atomic D1 batch (rollback all assertions/writes on error), not
independent CLI statements or an assumed Wrangler transaction. TEMP-table support
and batching must be validated before using the review template remotely. Assert
complete expected post-state in that same transaction and independently read it back.
The callback guard requires separate stage approval, verifies before writing, applies
once and verifies completion; it is not an installed transport. On any failure or
lost response, stop, retain diagnostics, reconcile read-only; never retry or advance
automatically. Configuration identity/flags cannot be proven by SQL alone.

## After recovery

No deployment is included in this task. Separately seal/review a public-only successor
pinning generation 3 and its policy UUID/key on BOTH Workers, preserving reviewed
code and disabled controls. Require separate deployment approval and verification.
Keep existing runtime signer pins consistent in a separately reviewed operation;
do not enable cleanup to repair mismatch. Generations 1/2 reports cannot be relabeled
or reused. New generation-3 version-2 evidence needs genuine fresh deployment/fencing/
settlement chronology after enrollment, separate signing and separate controlled import
approval. Zero data is not settlement proof. Recovery alone neither validates the
protected deletion E2E nor makes production ready.
