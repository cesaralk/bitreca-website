import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const target = 'C:/Users/cezar/Desktop/bitreca-deletion-integration'
const receiptPath = 'C:/Users/cezar/Desktop/bitreca-deletion-review/production-deletion-readonly-20261029.json'
const production = JSON.parse(await readFile(receiptPath, 'utf8'))
const rows = production.portfolios.map(portfolio => {
  const allocations = production.history.portfolio_storage_allocations.filter(row => row.portfolio_id === portfolio.id)
  const origin = production.history.portfolio_storage_origins.find(row => row.portfolio_id === portfolio.id)
  return { id: portfolio.id, slug: portfolio.slug, statusObserved: portfolio.status, knownRegisteredPrefixes: allocations.length,
    openRegisteredWritersObserved: allocations.filter(row => row.writer_state !== 'closed').length,
    minimumAtBirth: origin?.minimum_at_birth ?? null, signedEpochAtBirth: origin?.epoch_id ?? null,
    eligible: false, reason: 'Birth under protocol 0 with no signed epoch. Closed registered writers do not prove complete historical external-writer settlement. Origin cannot be retroactively relabeled.' }
})
await writeFile(target + '/docs/legacy-deletion-reconciliation.json', JSON.stringify({ evidenceReference: receiptPath,
  evidenceSha256: createHash('sha256').update(await readFile(receiptPath)).digest('hex'), readOnly: true, portfolios: rows }, null, 2) + '\n', { flag: 'wx' })
await writeFile(target + '/docs/deletion-live-activation.md', `# Deletion release: prepared, NOT activated

Integration branch: deletion/protected-release-20261029 at origin/main 4e161cb.
Original workspace and design-release worktree preserved. No commits/push/deploy.
Live PortfolioForest/App/Navbar preserved; all six website URL mappings tested.

## Verified reads and remaining approvals

Protected sandbox: read-only activation2 preflight completed. Protocol1, generation1,
revision1, gen2 enrolled/inactive; freeze/private access intact; execution off.
Public plan: C:\\Users\\cezar\\Desktop\\bitreca-deletion-review\\generation3-activate2-plan.json
Plan SHA256: 4076dc4310f96831f73ad28a139472ed8f0627cb62af7861b0f02c093ab62ab6
Plan expires 30 minutes after its saved createdAt. If expired, create a NEW read-only
preflight at a new output path; never overwrite/delete the old plan or use stale state.
No transition, signing, import, enablement or protected remote E2E was performed.

Next approval ONLY: activate enrolled generation2 in the exact sandbox D1 UUID
9c236935-b942-4cd7-9360-fed24db999fa. Expected generation2/revision2; protocol1
and all disabled controls unchanged. Before executing, verify plan freshness/hash.

\`node scripts/execute-generation3-recovery.mjs --stage activate2 --execute "C:\\Users\\cezar\\Desktop\\bitreca-deletion-review\\generation3-activate2-plan.json" --sha256 4076dc4310f96831f73ad28a139472ed8f0627cb62af7861b0f02c093ab62ab6 --approved-stage activate2\`

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
\`wrangler d1 migrations list bitreca-db --remote --config main.wrangler.jsonc\`
\`wrangler d1 migrations apply bitreca-db --remote --config main.wrangler.jsonc\`
\`wrangler deploy --config main.wrangler.jsonc\`
\`wrangler deploy --config hosting.wrangler.jsonc\`
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
`, { flag: 'wx' })
for (const file of ['scripts/execute-generation3-recovery.mjs', 'scripts/portfolio-schema-identity.mjs']) await copyFile(file, target + '/' + file)
console.log('Prepared exact legacy reconciliation findings and staged release/approval procedure from retained read-only evidence.')
