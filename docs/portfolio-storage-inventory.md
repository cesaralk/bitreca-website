# Trusted storage inventory

Optional migration 0014 adds the explicit `solo-operator-v1` policy and signed
version-2 evidence without changing the default independent-v1 policy. See
[owner enrollment, chronology, settlement and recovery](portfolio-writer-cutover.md#solo-owner-policy-solo-operator-v1-local-implementation-not-activated).
It supplies no independent second-person oversight and never adopts older origins.

The checked-in defaults do not enable deletion or change the writer protocol policy.
Migration 0012 adds no verification epochs and backfills no birth or writer history.
The dispatcher can verify inventory, and an admin-only, separately disabled API
can import signed protocol evidence. Neither can activate the writer cutover.

## Trust boundary

The independent verifier must establish that the deployed write paths register
every destination before writing, all legacy Worker versions have been removed,
and every previously issued untracked write has definitively settled. A deployment
name, elapsed timeout, policy change, or empty listing is not sufficient evidence.
The signed evidence must describe the actual storage scope and deployment artifact.
External bucket credentials and deployment rollback to untracked writers remain
outside D1's control and must be prohibited by the operational process.

The verifier signs the exact UTF-8 JSON below using ECDSA P-256 / SHA-256, with a
64-byte IEEE P1363 signature. Property order is significant; extra fields fail:

```json
{"version":1,"id":"<UUID v4>","storage_scope":"<approved scope>","writer_protocol":1,"deployment_sha256":"<64 lowercase hex>","evidence_sha256":"<64 lowercase hex>","legacy_writers_settled":true,"verified_at":0}
```

The timestamp is the audited verification time in Unix seconds, not the example
zero above. The evidence digest references retained independent audit material.
Signing keys are not included. The offline operator tool and pinning procedure
are documented in [portfolio-deletion-operations.md](portfolio-deletion-operations.md).

`registerStorageProtocolVerification(db, trust, evidence)` verifies this signature
against `trust.publicKeySpki` (DER SPKI bytes) and `trust.storageScope`. Both trust
values must come from separately reviewed, pinned server/operator configuration;
never accept them from an HTTP request. No verification can be registered until
the existing writer minimum has separately been raised to 1. This code never
raises it. Private signing keys belong outside the application.

## Creation and attestation

Creation verifies an empty random namespace and uses a server-generated nonce in
the existing atomic portfolio/root-allocation batch. Database triggers capture
the birth, its then-current epoch and policy, the matching zero-write root seal,
and all later registered allocation identities. These records are immutable.
Legacy rows cannot acquire a birth token later. Origins born before the verified
epoch or cutover cannot be retroactively auto-certified.

After deletion marking freezes the portfolio, call
`attestPortfolioInventory(db, trust, jobId)` internally. It re-verifies the epoch,
requires complete allocation history and exclusive ownership, rejects every open,
uncertain or untracked writer, hashes the snapshot in pages of 100 allocations,
and atomically rechecks its revision before writing proof and inventory evidence.
The limit is 2,000 allocations; larger inventories fail closed without skipping.
Repeated calls recover the same immutable proof after lost responses.

Old free-text inventory attestations remain retained but cannot authorize cleanup
without the new proof. No legacy reconciliation or automatic ownership adoption
is implemented. Those portfolios require a separately designed and authorized
independent verification workflow. Cleanup and finalization are now connected
through the disabled-by-default dispatcher and independent environment/D1 gates;
pending migrations and Cloudflare compatibility checks still require separate
authorization before deployment or activation.
