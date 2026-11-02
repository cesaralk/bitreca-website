# Legacy reconciliation release boundary

Migration 0016 is complete in production. Do not repeat it. Migration 0017 and
the distinct signed reconciliation authority are local release changes only;
neither this document nor the fourteen-object dossier authorizes deletion.

Run the local evidence preparation without Cloudflare access:

```powershell
node scripts/prepare-legacy-reconciliation.mjs
```

The pinned dossier SHA-256 is
`81426542792d2f9284ecc886341d6016c53c8a3cc6a3f2e980a5a78962415295`.
It records fourteen objects across twelve registered prefixes for IDs 5–10,
matching original births/seals, closed registered writers, and no known foreign
registered overlap. These observations do not establish exclusive object custody,
complete historical namespaces, or settlement/exclusion of untracked writers.
The preparation command preserves `eligible=false` and `signingReady=false`.
Only genuine supporting records can close those factual gaps; ownership by slug,
empty listings, owner approval alone, or a sandbox authorization cannot do so.

The release uses a distinct P-256 signed report bound to the production scope,
original birth and exact allocation/publication snapshot, current policy/key and
generation, reviewed artifact, signed settlement epoch, supporting evidence hash,
and exact prefix/key/ETag/size inventory. Records and object manifests are append
only. Replays with different bytes, stale policy or snapshots, uncertain writers,
foreign/changed objects and unapproved persisted batch keys fail closed. Existing
cleanup receipts and separately authorized finalization remain authoritative.
Original legacy birth provenance is never rewritten. Reconciliation does not
authorize legacy uploads or other edits; later allocations/publication changes
invalidate the approved snapshot. Public serving and PortfolioForest are preserved.

Remaining separately approved production stages, in order:

1. Seal the final successor candidate and verify every digest. Prepare a fresh
   production metadata backup and restore/integrity validation. Review an
   apply-only-0017 procedure pinned to that candidate, exact D1 UUID
   `8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a`, only pending 0017, six complete published
   records unchanged, and disabled controls. Execute only after explicit approval.
   The previous apply-0016 runner and candidate must not be reused or edited.
2. Separately approve each production Worker deployment and verify active bytes,
   bindings, existing Admin secrets/auth version 2, disabled import/request/cleanup/
   finalization/scheduling controls, and all six published sites unchanged. Stop on
   partial outcomes; no automatic retry or rollback.
3. Separately approve conditional no-overwrite initialization of the absent storage
   identity control key, production policy/public-key enrollment and protocol cutover.
   Preserve all customer objects. Production mutation ingress must be fenced with a
   production-effective control; the existing staging-only freeze is insufficient.
4. Reconcile genuine production writer settlement and per-object ownership/history.
   Separately approve private-console signing, then controlled evidence imports.
   Each import is separately disabled by default and never marks or deletes a site.
5. Separately approve runtime cleanup/finalization and scheduling only after reviewed
   queue checks excluding historical receipted jobs. Enable exact-ID requests last.
   No release approval authorizes a deletion request for any of IDs 5–10.

Code cannot prevent the sole administrator or a broad D1/deployment credential from
replacing code or restoring a database. Retain credential restrictions, rollback
discipline and recovery evidence. A metadata backup does not recover deleted R2 bytes.
No production-readiness or live-enablement claim is made by local preparation.
