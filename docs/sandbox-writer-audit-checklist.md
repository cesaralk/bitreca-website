# Independent sandbox writer audit and protocol cutover

This remains the **independent-v1** checklist. The optional
[solo-operator-v1 procedure](portfolio-writer-cutover.md#solo-owner-policy-solo-operator-v1-local-implementation-not-activated)
uses explicitly identified owner approval, not an independent-audit signature.
Its factual writer inventory, credential fencing and settlement requirements remain
applicable; unproved boxes stay unproved. Never rename this checklist as a completed
independent review or infer settlement from an empty database.

Prepared 2026-10-27. This is an **unsigned checklist**, not settlement evidence.
All boxes start incomplete. Do not sign this template or replace missing proof
with a timestamp, empty listing, test result or statement from this coding session.

Pre-deployment follow-up: the original package is durably preserved and fresh
read-only sandbox observations are in [sandbox-cloudflare-evidence.md](sandbox-cloudflare-evidence.md).
The corrected candidate and the one guarded frozen-deployment command are in
[sandbox-deployment-procedure.md](sandbox-deployment-procedure.md). These observations
do not check off the independent settlement/authority requirements below.

Pre-cutover hand-off: [readiness](sandbox-deletion-readiness.md#pre-cutover-hand-off-completed-2026-10-27-1727-utc)
now records the hashed unsigned evidence package, zero immutable registered-writer
history, 403 credential-inventory limits, Super Administrator rollback authority,
R2 retention findings, offline public-pin tooling and separate guarded command
templates. These facts narrow the review; they do not authorize checking the
independent external-writer/settlement/rollback assertions without genuine proof.

## Exact scope

| Resource | Only permitted sandbox target |
| --- | --- |
| Main Worker | `bitreca-main-delete-sandbox-20261025` |
| Hosting Worker | `bitreca-hosting-delete-sandbox-20261025` |
| D1 | `bitreca-delete-sandbox-db-20261025` / `9c236935-b942-4cd7-9360-fed24db999fa` |
| R2 | `bitreca-delete-sandbox-r2-20261025` |
| Storage scope | `portfolioforest/staging/bitreca-delete-sandbox-r2-20261025/9c236935-b942-4cd7-9360-fed24db999fa` |

Do not inspect or mutate production, older staging, or deletion-lab resources as
part of this procedure. Account identity must be independently established; bucket
and Worker names alone are insufficient.

## Independent audit record

Record auditor identity, review date, provider account ID, source of each observation,
actual version IDs, and private evidence references. Keep credentials and signing
private keys outside the repository and Worker runtime. Preserve audit bytes immutably.

- [ ] Compare actual deployed module bytes and asset/configuration metadata with
      the retained review package. Record exact main/hosting versions and traffic
      percentages, all routes/custom domains, previews and deploy/rollback authority.
      Local package hashes do not prove what is deployed.
- [ ] Enumerate every authority that can PUT/copy/multipart-write into this R2
      bucket: Worker bindings, account/bucket API tokens, S3 keys, CI jobs, scripts,
      importers and any other service. The hosting Worker is read-only in source,
      but its binding authority must still be inventoried. Retain provider evidence.
- [ ] Review the complete main Worker artifact, including the generic media upload
      route. Its current UUID filename namespace is separate from portfolio prefixes;
      confirm no deployed alternative can choose a portfolio key. Check all direct
      `put`, copy, multipart and delete calls, not only named portfolio endpoints.
- [ ] Confirm creation atomically captures a fresh birth and zero-write root seal;
      every folder/HTML destination registers ownership and an open writer before
      each PUT; all issued writes are awaited; uncertainty remains unresolved;
      closure stops local issuance and activation uses current ownership/protocol.
- [ ] Review all historical deployments and traffic splits, active requests,
      queues/retries, multipart uploads and external writers. For each possible
      untracked writer, attach definitive settlement or exclusion evidence. Removing
      traffic, waiting, observing zero D1 writers, or enabling a SQL gate cannot
      establish that an already-issued R2 PUT has settled.
- [ ] Prove unauthorized legacy writers cannot resume or be rolled back into
      service. Any credential/permission changes need separate approval; this
      checklist authorizes none. If the proof is unavailable, remain frozen/off.
- [ ] Compare both D1 bindings, bucket bindings, preview targets, resource vars,
      actual provider account and sentinel HEAD metadata. Record the four exact
      identity fields; do not recreate/copy the sentinel as a shortcut.
- [ ] Establish recoverability of disposable object bytes and D1 metadata before
      destructive testing. An exported D1 database does not recover R2 objects.
- [ ] Verify the independent P-256 public pin through a separate trusted channel;
      record DER/SPKI fingerprint and exact scope. Do not trust a key in a report.
- [ ] Independently approve the final write-capable deployment and genuine writer
      settlement findings. Hash the retained deployment manifest and actual audit
      bytes. Only then may `legacy_writers_settled:true` be asserted and signed.

## Safe cutover, after explicit approval

1. Verify a fresh read-only baseline using `npm.cmd run check:portfolio-sandbox`.
   It prints only SELECT/PRAGMA commands. Confirm all 13 migration names, zero
   portfolios/allocations/unsettled writers, protocol 0, disabled runtime policy,
   no epochs/jobs, integrity and foreign-key results. These are expected initial
   values, not a universal validator after the trial starts.
2. Keep mutation freeze, marking, import, cleanup, scheduling and finalization
   disabled while reviewing/deploying tracking-compatible bytes. No old untracked
   version may serve writes afterward. Deployment itself needs explicit approval.
3. Complete the independent writer audit above. **Stop here if settlement is not
   proved.** Back up metadata and preserve the genuine audit record.
4. Separately authorize the exact sandbox D1 cutover. The reviewed SQL template is:

   ```sql
   UPDATE portfolio_storage_writer_policy
   SET minimum_protocol_version=1
   WHERE id=1 AND minimum_protocol_version=0;
   ```

   Execute only against the sandbox database ID above, with separately reviewed
   operator credentials. Require one changed row, then independently read back
   protocol 1. If zero rows change, inspect state rather than forcing an update.
   This switch is monotonic; there is no protocol-0 rollback.
5. Obtain the independent signature after the audit, using the exact schema and
   offline tool in [operations](portfolio-deletion-operations.md). Bind
   `deployment_sha256` to retained `deployment-artifact.json` bytes (the manifest
   seals all actual bundle/config/migration/asset files) and `evidence_sha256` to
   the genuine private audit. Retain the whole package, not just its digest.
6. After separate approval, configure the independently pinned public key and
   briefly lift the sandbox mutation freeze for evidence import only, with marking,
   cleanup, Cron and finalization off. The freeze also blocks evidence import;
   merely setting the import flag is insufficient. Keep ingress restricted to the
   approved operator, import through the authenticated same-origin endpoint,
   read back the immutable epoch, and disable import again.
7. Review each subsequent configuration/deployment change against the audited
   writer artifact. Retain an explicit chain of approved control-only changes and
   actual deployed version IDs. A change to write-capable code, bindings, scope,
   credential authority or protocol requires a new independent audit/epoch; do not
   reuse a signed assertion as blanket approval for different code.
8. After approval to create disposable data, allow creation/uploads, with execution
   still off. Create `delete-test-` portfolios only after the trusted epoch. Run
   [E2E acceptance](sandbox-deletion-e2e.md), approving marking, cleanup/D1 revision,
   scheduling and finalization separately. Keep the one-operation budget.

If interrupted, keep mutation ingress frozen and execution off. Do not downgrade
the protocol, close an uncertain writer, adopt a legacy prefix, erase receipts or
reset a generation. Roll forward to reviewed compatible code. Revocation during
LIST/DELETE now blocks dispatch as `CONFIGURATION_BLOCKED`; restored authority
alone does not restart it. Investigate, wait for any active lease to settle, and
use authenticated retry under fresh approval. Already-issued calls may finish.
