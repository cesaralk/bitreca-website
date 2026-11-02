# Fresh sandbox evidence and prior audit consolidation

Collected 2026-10-27, 15:54–16:02 UTC, with existing OAuth authentication.
Only the exact sandbox Worker/service, D1 and R2 resources were queried.
Cloudflare operations were GET/HEAD and fixed SELECT/PRAGMA reads; no deployments,
database writes, object writes/deletes, credential changes or token refresh commands
were issued. Local Wrangler dry-runs uploaded nothing.

## Retained evidence

Durable root: `C:\Users\cezar\Desktop\bitreca-deletion-review`.
The `evidence-20261027-predeploy` directory holds 28 evidence files: version/history,
settings/bindings, routing/access/schedules, returned raw script bodies and parsed
modules, D1 baseline/FK/quick check, resource metadata and sentinel evidence.
`predeployment-evidence-index.json` records every file's size and SHA-256.
Its digest is `5871bb08ae0c48eff61720bafede73e5c66cad56a77a02a3110cd462e4655b9c`.
These are agent-collected observations, not an independent signature or proof of
legacy-writer settlement. Earlier individual observations remain retained even
when a later supplemental read resolves a limitation.

Provider account: `4ec868eac2a3b9127531ad39d2501f15`.

| Resource/check | Fresh finding |
| --- | --- |
| Main sandbox Worker | `bitreca-main-delete-sandbox-20261025`; version `10047b0a-9778-4df5-a6be-45392b3e241a`, created 2026-10-25 22:21:33 UTC, 100% traffic; one returned version/deployment |
| Hosting sandbox Worker | `bitreca-hosting-delete-sandbox-20261025`; version `f2e95989-aa50-4fcb-947a-5ea1a9e60a19`, created 2026-10-25 22:23:46 UTC, 100% traffic; one returned version/deployment |
| Bindings | Both versions bind exactly D1 `9c236935-b942-4cd7-9360-fed24db999fa` and bucket `bitreca-delete-sandbox-r2-20261025`, with their respective binding names |
| Public controls | workers.dev and preview URLs disabled on both; service routes endpoints return empty arrays; schedules empty; frozen mutations true; all present deletion/import/cleanup/finalization/schedule/preview flags false; main verifier pin absent |
| D1 | All 13 expected migration names; portfolios/allocations/unsettled-or-untracked writers/jobs/epochs all 0; minimum protocol 0; policy revision 0; cleanup/finalization 0 |
| D1 safety | Successful reads report `rows_written:0`, `changed_db:false`; foreign-key result empty; `PRAGMA quick_check` returns `ok` |
| R2 bucket | Provider metadata returns exact bucket, created 2026-10-25 21:44:47 UTC, default jurisdiction, EEUR |
| Sentinel | Exact-prefix metadata listing returns only `__portfolioforest_control__/storage-identity`; environment/scope/bucket/database all match the sandbox; ETag `661dc6cdb8237bf9cb468341c91e9c30`; object GET succeeds |

`PRAGMA integrity_check` was unavailable through D1; the checker now uses the
successful supported `quick_check`. This is not represented as a full integrity
scan. Direct REST HEAD of the object returned 405, and GET alone exposed no custom
metadata; the subsequent scoped metadata listing established the identity match.
The sentinel is 42 bytes, rather than the zero-byte example in older operations
documentation. Current cleanup authorization checks its key and four metadata
fields, not body length. This observation does not justify rewriting it.

The empty service-routes response and disabled workers.dev/previews describe the
queried exposure surfaces. They do not independently exclude every possible
account-level custom domain, proxy, historical client or credential holder.

## Actual JavaScript comparison

Current-script content was retrieved successfully for each exact Worker. The
multipart response was parsed and the returned `index.js` bytes hashed separately
from transport headers/boundaries. Deployment metadata was read before and after;
the active version sets remained unchanged during retrieval.

| JavaScript | Returned deployed module SHA-256 | Candidate module SHA-256 |
| --- | --- | --- |
| Main | `6f4f1e1e6f416da299362215268918e52d9ee1b31e13af912a8b7e8a0c0a0700` | `b2d37a6f27b8d204c33a76756b04f3ae6f3f0aec17f508af1a7b29902e31ac46` |
| Hosting | `f1b1e876ad3b6d1a8523a2f842412aabb467b524a40a51599e87c2ea593ebbc1` | `1f5a9c265f7774d03a3244f115ee6ac008e851fa45117d9d66e66a2972ef44d4` |

**Neither retrieved module is byte-identical to the candidate.** Sizes are
116,489 vs 74,895 bytes (main) and 5,732 vs 3,365 (hosting). Formatting/bundling can
contribute to differences, so hash mismatch alone is not a semantic-difference
proof. Direct inspection also confirms the old main's generic
`Deletion authorization changed.` exception remains, rather than the candidate's
corrected configuration-block propagation. The fixed candidate has not been deployed.

What is proven locally: all original and corrected package file digests; the two
corrected dry-run JavaScript outputs exactly equal their candidate inputs; the
corrected package changes only module-discovery settings/config serialization and
their manifest entries, retaining all 21 other payload files byte-for-byte.

What is not proven: immutable version-specific content provenance from the
current-script endpoint; full static-assets byte identity in the live environment;
provider runtime execution of the candidate; absence of all external writers;
historical request settlement. An ETag/version name is not substituted for SHA-256
evidence. Candidate evidence must not be signed as if already deployed.

## Prior findings carried forward

The user reports the nine-Worker inventory and token review already performed.
They were not repeated and no re-enumeration of the account's Workers was requested.
The retained `bitreca-staging-worker-inventory.mjs` confirms earlier scope: enumerate
active versions and identify bindings to the **older staging** D1/bucket. It is not
executed by this task and its older-scope results cannot establish sandbox exclusion.
Its complete nine-Worker result/token-review record is not among the retained
summary files located here; no detailed outcome is invented or newly certified.

Retained historical sources consulted, without contacting their resources:

- `Desktop\bitreca-staging-audit-status-20261025.md`: old staging versions,
  100% traffic, 13 migrations, identity and disabled controls; independently
  deployed bytes, external writer inventory, legacy settlement, rollback enforcement
  and restore testing explicitly unresolved at that time.
- `Desktop\bitreca-staging-audit-summary.json`: preliminary, unsigned older-scope
  report; protocol 0, no signed epoch, no cutover; local package equality only.
- Earlier sandbox results reported in this thread: deployed pair, 13 migrations,
  identity/auth/freeze checks and empty baseline. Fresh reads above now corroborate
  schema/counts, current bindings/flags and sentinel metadata; authentication/freeze
  mutation probes were not repeated during this read-only stage.

An independent reviewer should reuse the existing nine-Worker/token review and
attach its original provenance to the sandbox-specific findings. This is a request
for evidence reconciliation, not a requirement to repeat the account inventory.

## Remaining authority, rollback and recovery risks

- The current authenticated principal has broad Worker/script/route and D1 write
  scopes. GET authorization succeeded for sandbox R2 too. Those observed abilities
  do not prove bucket-scoped least privilege or enumerate every API/S3/CI token.
  No credential values were printed/copied, and no permissions changed.
- Current version bindings establish two known authorities, not the complete set
  of present or historical external R2 writers. The earlier review needs a scoped
  conclusion for this sandbox bucket and definitive settlement/exclusion evidence.
- Deployment-capable credentials can replace/rebind a Worker or restore retained
  old versions. D1 minimum protocol cannot cancel an issued PUT or stop arbitrary
  direct R2 credentials. A documented/enforced compatible rollback or roll-forward
  policy must be independently established before trusting a signed epoch.
- No sandbox-specific D1 restore or R2 restore exercise was performed. Existing
  production/older-staging/lab backup material was not adopted as sandbox recovery
  proof. Keep original disposable fixture bytes, actual sandbox backup/recovery
  metadata and immutable manifests/receipts. D1 backup alone cannot restore R2 bytes.
- Provider account settings, active tokens or an empty bucket do not establish
  writer settlement. `legacy_writers_settled` remains **NOT PROVEN**. No independent
  public-key pin, genuine audit signature or trusted sandbox epoch exists yet.

These risks block protocol trust and destructive acceptance. They do not require
enabling deletion to investigate, and do not block the separately approved frozen
code deployment defined in [deployment procedure](sandbox-deployment-procedure.md).
