// A separate authority for the six legacy production portfolios. This never
// changes an origin, closes a writer, or treats a prefix name as ownership proof.
import { requireCurrentAuthorization } from './portfolio-authorization.js'
import { verifyStorageProtocolEvidence } from './portfolio-inventory.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const hash = /^[0-9a-f]{64}$/
const productionScope = 'portfolioforest/production/bitreca-media/8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const bytes = value => new TextEncoder().encode(value)
const hex = value => Array.from(value, part => part.toString(16).padStart(2, '0')).join('')
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', value)))
const fromHex = value => Uint8Array.from(value.match(/../g), part => parseInt(part, 16))
const integer = value => Number.isSafeInteger(value) && value >= 0
const path = value => typeof value === 'string' && value.length > 0 && bytes(value).length <= 1024 && !value.includes('\0')

export async function legacyManifestSha256(prefixes, objects) {
  return digest(bytes(JSON.stringify({ prefixes, objects })))
}

export function canonicalLegacyReconciliation(report) {
  if (report.version !== 2 || report.report_type !== 'legacy-portfolio-reconciliation' ||
      report.authorization_policy !== 'solo-operator-v1' || report.ownership_verified !== true ||
      report.historical_namespaces_complete !== true || report.legacy_writers_settled !== true) {
    throw new Error('Explicit distinct policy and factual reconciliation acknowledgements are required.')
  }
  return JSON.stringify({ version: 2, report_type: 'legacy-portfolio-reconciliation', id: report.id,
    authorization_policy: 'solo-operator-v1', policy_id: report.policy_id, policy_generation: report.policy_generation,
    operator_id: report.operator_id, operator_key_id: report.operator_key_id, storage_scope: report.storage_scope,
    deployment_sha256: report.deployment_sha256, epoch_id: report.epoch_id, portfolio_id: report.portfolio_id,
    birth_token: report.birth_token, storage_prefix: report.storage_prefix, publication_revision: report.publication_revision,
    allocation_count: report.allocation_count, allocation_revision: report.allocation_revision,
    snapshot_sha256: report.snapshot_sha256, prefixes: report.prefixes, objects: report.objects,
    manifest_sha256: report.manifest_sha256, audit_sha256: report.audit_sha256,
    ownership_verified: true, historical_namespaces_complete: true, legacy_writers_settled: true,
    observed_at: report.observed_at, verified_at: report.verified_at })
}

export async function verifyLegacyReconciliation(trust, evidence) {
  if (trust?.authorizationPolicy !== 'solo-operator-v1' || trust.storageScope !== productionScope ||
      !(trust.publicKeySpki instanceof Uint8Array) || trust.publicKeySpki.length > 512 ||
      typeof evidence?.payload !== 'string' || bytes(evidence.payload).length > 32768 ||
      !(evidence.signature instanceof Uint8Array) || evidence.signature.length !== 64) throw new Error('Invalid legacy reconciliation evidence.')
  const report = JSON.parse(evidence.payload)
  const signer = await digest(trust.publicKeySpki)
  if (evidence.payload !== canonicalLegacyReconciliation(report) || !uuid.test(report.id) || !uuid.test(report.epoch_id) ||
      report.policy_id !== trust.policyId || !uuid.test(report.policy_id) ||
      !integer(report.policy_generation) || report.policy_generation < 1 || report.policy_generation !== trust.policyGeneration ||
      typeof report.operator_id !== 'string' || report.operator_id !== trust.operatorId || !/^[a-zA-Z0-9._@-]{1,100}$/.test(report.operator_id) ||
      report.operator_key_id !== signer || report.operator_key_id !== trust.operatorKeyId ||
      report.storage_scope !== productionScope || report.deployment_sha256 !== trust.deploymentSha256 ||
      ![report.operator_key_id, report.deployment_sha256, report.snapshot_sha256, report.manifest_sha256, report.audit_sha256].every(value => hash.test(value)) ||
      !Number.isSafeInteger(report.portfolio_id) || report.portfolio_id < 5 || report.portfolio_id > 10 ||
      !/^[0-9a-f]{32}$/.test(report.birth_token) || !integer(report.publication_revision) ||
      !integer(report.allocation_count) || report.allocation_count < 1 || report.allocation_count > 2000 ||
      !integer(report.allocation_revision) || report.allocation_revision < 1 ||
      !integer(report.observed_at) || !integer(report.verified_at) || report.observed_at > report.verified_at ||
      report.verified_at > Math.floor(Date.now() / 1000)) throw new Error('Legacy reconciliation differs from trusted policy.')
  if (!Array.isArray(report.prefixes) || report.prefixes.length !== report.allocation_count ||
      report.prefixes.some((prefix, index) => !path(prefix) || !prefix.endsWith('/') || prefix.startsWith('__portfolioforest_control__/') ||
        (index > 0 && (prefix <= report.prefixes[index - 1] || prefix.startsWith(report.prefixes[index - 1])))) ||
      !report.prefixes.includes(report.storage_prefix) || !Array.isArray(report.objects) || report.objects.length < 1 || report.objects.length > 100) {
    throw new Error('Invalid exact legacy inventory.')
  }
  for (const [index, object] of report.objects.entries()) {
    if (JSON.stringify(object) !== JSON.stringify({ prefix: object.prefix, key: object.key, size: object.size, etag: object.etag }) ||
        !report.prefixes.includes(object.prefix) || !path(object.key) || !object.key.startsWith(object.prefix) ||
        object.key.startsWith('__portfolioforest_control__/') || !integer(object.size) ||
        typeof object.etag !== 'string' || object.etag.length < 1 || object.etag.length > 200 ||
        Array.from(object.etag).some(part => part.charCodeAt(0) < 32 || part.charCodeAt(0) === 127) ||
        (index > 0 && object.key <= report.objects[index - 1].key)) throw new Error('Invalid exact legacy object.')
  }
  if (await legacyManifestSha256(report.prefixes, report.objects) !== report.manifest_sha256) throw new Error('Legacy manifest digest differs.')
  const key = await crypto.subtle.importKey('spki', trust.publicKeySpki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, evidence.signature, bytes(evidence.payload))) {
    throw new Error('Invalid legacy reconciliation signature.')
  }
  return { report, signer }
}

export async function readLegacyReconciliationSnapshot(db, portfolioId) {
  if (!Number.isSafeInteger(portfolioId) || portfolioId < 5 || portfolioId > 10) throw new Error('Unsupported legacy portfolio.')
  const row = await db.prepare(`SELECT c.*,p.deletion_requested_at,p.status FROM portfolio_legacy_reconciliation_candidates c
    JOIN portfolios p ON p.id=c.portfolio_id WHERE c.portfolio_id=?`).bind(portfolioId).first()
  if (!row || row.allocation_count < 1 || row.allocation_count > 2000) throw new Error('Legacy ownership/writer history is unavailable.')
  const allocations = []
  let cursor = ''
  while (allocations.length < row.allocation_count) {
    const page = await db.prepare(`SELECT a.prefix,a.allocation_kind,a.source_prefix,a.writer_protocol_version,
      a.writer_token,a.writer_state,a.writer_closed_at,e.sequence FROM portfolio_storage_allocations a
      JOIN portfolio_storage_allocation_events e ON e.prefix=a.prefix AND e.portfolio_id=a.portfolio_id
      WHERE a.portfolio_id=? AND a.prefix>? ORDER BY a.prefix LIMIT 100`).bind(portfolioId, cursor).all()
    if (!page?.success || !Array.isArray(page.results) || page.results.length < 1 || page.results.length > 100 ||
        allocations.length + page.results.length > row.allocation_count || page.results.some((value, index) =>
          typeof value.prefix !== 'string' || value.prefix <= (index ? page.results[index - 1].prefix : cursor) ||
          value.writer_protocol_version !== 1 || value.writer_state !== 'closed' || !integer(value.writer_closed_at) ||
          !integer(value.sequence))) throw new Error('Incomplete legacy allocation snapshot.')
    allocations.push(...page.results)
    cursor = allocations.at(-1).prefix
  }
  const portfolio = { portfolio_id: row.portfolio_id, storage_prefix: row.storage_prefix, birth_token: row.birth_token,
    initial_prefix: row.initial_prefix, born_at: row.born_at, minimum_at_birth: row.minimum_at_birth,
    publication_revision: row.publication_revision - (row.deletion_requested_at == null ? 0 : 1),
    allocation_count: row.allocation_count, allocation_revision: row.allocation_revision }
  if (!integer(portfolio.publication_revision) || (row.deletion_requested_at != null && row.status !== 'draft')) throw new Error('Unexpected legacy publication revision.')
  const snapshot = { portfolio, allocations }
  return { snapshot, snapshotSha256: await digest(bytes(JSON.stringify(snapshot))), history: row }
}

async function validateCurrent(db, trust, verified) {
  const { report, signer } = verified
  const policy = await requireCurrentAuthorization(db, trust)
  const epoch = await db.prepare('SELECT * FROM portfolio_storage_authorized_epochs WHERE id=?').bind(report.epoch_id).first()
  if (!epoch || !/^[0-9a-f]{128}$/.test(epoch.signature_hex) || epoch.signer_sha256 !== signer ||
      epoch.verified_at > report.observed_at || epoch.verified_at < policy.enrolled_at) throw new Error('Current signed settlement epoch is unavailable.')
  const settlement = await verifyStorageProtocolEvidence(trust, { payload: epoch.evidence_json, signature: fromHex(epoch.signature_hex) })
  if (settlement.report.id !== report.epoch_id || settlement.signer !== signer ||
      settlement.report.verified_at !== epoch.verified_at || settlement.report.storage_scope !== epoch.storage_scope) throw new Error('Mismatched signed settlement epoch.')
  const current = await readLegacyReconciliationSnapshot(db, report.portfolio_id)
  if (current.snapshotSha256 !== report.snapshot_sha256 ||
      ['birth_token', 'storage_prefix', 'publication_revision', 'allocation_count', 'allocation_revision'].some(name => current.snapshot.portfolio[name] !== report[name]) ||
      JSON.stringify(current.snapshot.allocations.map(row => row.prefix)) !== JSON.stringify(report.prefixes) ||
      current.snapshot.allocations.some(row => row.writer_closed_at > report.observed_at)) throw new Error('Legacy snapshot or writer settlement differs.')
  return current
}

export async function registerLegacyReconciliation(db, trust, evidence) {
  try {
    const verified = await verifyLegacyReconciliation(trust, evidence), { report, signer } = verified
    const current = await validateCurrent(db, trust, verified)
    const existing = await db.prepare('SELECT evidence_json,signature_hex,signer_sha256 FROM portfolio_legacy_reconciliations WHERE id=?').bind(report.id).first()
    if (existing) {
      if (existing.evidence_json !== evidence.payload || existing.signature_hex !== hex(evidence.signature) || existing.signer_sha256 !== signer) throw new Error('Reconciliation identity conflict.')
      return { state: 'recorded', id: report.id }
    }
    if (current.history.deletion_requested_at != null) throw new Error('Cannot replace authority after deletion request.')
    const result = await db.prepare(`INSERT INTO portfolio_legacy_reconciliations
      (id,portfolio_id,birth_token,storage_prefix,publication_revision,allocation_count,allocation_revision,snapshot_sha256,
       manifest_sha256,epoch_id,policy_id,policy_generation,operator_key_id,deployment_sha256,storage_scope,evidence_json,signature_hex,signer_sha256,verified_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(report.id, report.portfolio_id, report.birth_token,
      report.storage_prefix, report.publication_revision, report.allocation_count, report.allocation_revision,
      report.snapshot_sha256, report.manifest_sha256, report.epoch_id, report.policy_id, report.policy_generation,
      report.operator_key_id, report.deployment_sha256, report.storage_scope, evidence.payload, hex(evidence.signature), signer, report.verified_at).run()
    if (!result?.success || !Number.isSafeInteger(result.meta?.changes) || result.meta.changes < 0) throw new Error('Unconfirmed reconciliation import.')
    const stored = await db.prepare('SELECT evidence_json,signature_hex,signer_sha256 FROM portfolio_legacy_reconciliations WHERE id=?').bind(report.id).first()
    if (!stored || stored.evidence_json !== evidence.payload || stored.signature_hex !== hex(evidence.signature) || stored.signer_sha256 !== signer) throw new Error('Reconciliation import outcome is unresolved.')
    return { state: 'recorded', id: report.id }
  } catch { return { state: 'blocked', error: { code: 'LEGACY_RECONCILIATION_UNVERIFIED' } } }
}

export async function loadLegacyReconciliation(db, trust, portfolioId, reconciliationId = null) {
  if (reconciliationId !== null && !uuid.test(reconciliationId)) throw new Error('Invalid legacy reconciliation identity.')
  const rows = await db.prepare(`SELECT * FROM portfolio_legacy_reconciliations_current WHERE portfolio_id=? AND (? IS NULL OR id=?)
    ORDER BY verified_at DESC,id DESC LIMIT 1`).bind(portfolioId, reconciliationId, reconciliationId).all()
  if (!rows?.success || !Array.isArray(rows.results) || rows.results.length !== 1) throw new Error('Current legacy reconciliation is unavailable.')
  const row = rows.results[0]
  if (!/^[0-9a-f]{128}$/.test(row.signature_hex)) throw new Error('Invalid retained legacy signature.')
  const verified = await verifyLegacyReconciliation(trust, { payload: row.evidence_json, signature: fromHex(row.signature_hex) })
  if (verified.report.portfolio_id !== portfolioId || verified.signer !== row.signer_sha256 ||
      ['id', 'portfolio_id', 'birth_token', 'storage_prefix', 'storage_scope', 'publication_revision',
        'allocation_count', 'allocation_revision', 'snapshot_sha256', 'manifest_sha256', 'epoch_id',
        'policy_id', 'policy_generation', 'operator_key_id', 'deployment_sha256', 'verified_at']
        .some(name => verified.report[name] !== row[name]) ||
      (reconciliationId !== null && row.id !== reconciliationId)) throw new Error('Retained legacy authority differs.')
  await validateCurrent(db, trust, verified)
  return { ...verified, reconciliationId: row.id, objects: verified.report.objects }
}
