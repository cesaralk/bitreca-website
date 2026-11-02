// Verifier primitives: no R2 access or cutover mutation. The authenticated API
// may import policy-specific signed evidence only when explicitly enabled.
// The caller pins the authorized verifier's PUBLIC key and storage scope in
// trusted configuration. Neither may come from an administrator's HTTP body.
import { evidencePolicy, requireCurrentAuthorization } from './portfolio-authorization.js'
import { loadLegacyReconciliation } from './portfolio-legacy-reconciliation.js'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const hashPattern = /^[0-9a-f]{64}$/
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
const digest = async bytes => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
const textBytes = text => new TextEncoder().encode(text)
function success(result) {
  if (!result?.success || !Number.isSafeInteger(result.meta?.changes) || result.meta.changes < 0) throw new Error('Unconfirmed inventory operation.')
}
export async function verifyStorageProtocolEvidence(trust, evidence) {
  if (!(trust?.publicKeySpki instanceof Uint8Array) || trust.publicKeySpki.length > 512 ||
      typeof trust.storageScope !== 'string' || !trust.storageScope || trust.storageScope.length > 200 ||
      typeof evidence?.payload !== 'string' || evidence.payload.length > 16384 ||
      !(evidence.signature instanceof Uint8Array) || evidence.signature.length !== 64) throw new Error('Invalid verification evidence.')
  const report = JSON.parse(evidence.payload)
  const solo = evidencePolicy(trust) === 'solo-operator-v1'
  if (!['independent-v1', 'solo-operator-v1'].includes(evidencePolicy(trust))) throw new Error('Unknown authorization policy.')
  const canonical = { version: solo ? 2 : 1, id: report.id,
    ...(solo ? { authorization_policy: 'solo-operator-v1', policy_id: report.policy_id,
      policy_generation: report.policy_generation, operator_id: report.operator_id,
      operator_key_id: report.operator_key_id, deployment_verified_at: report.deployment_verified_at,
      writers_fenced_at: report.writers_fenced_at, writers_settled_at: report.writers_settled_at } : {}), storage_scope: report.storage_scope,
    writer_protocol: 1, deployment_sha256: report.deployment_sha256, evidence_sha256: report.evidence_sha256,
    legacy_writers_settled: true, verified_at: report.verified_at }
  if (evidence.payload !== JSON.stringify(canonical) || !uuidPattern.test(report.id) ||
      report.storage_scope !== trust.storageScope || !hashPattern.test(report.deployment_sha256) ||
      !hashPattern.test(report.evidence_sha256) || !Number.isSafeInteger(report.verified_at) || report.verified_at < 0) {
    throw new Error('Invalid verification report.')
  }
  const signer = await digest(trust.publicKeySpki)
  if (solo && (!uuidPattern.test(report.policy_id) || report.policy_id !== trust.policyId ||
      !Number.isSafeInteger(report.policy_generation) || report.policy_generation < 1 || report.policy_generation !== trust.policyGeneration ||
      typeof report.operator_id !== 'string' || !/^[a-zA-Z0-9._@-]{1,100}$/.test(report.operator_id) || report.operator_id !== trust.operatorId ||
      report.operator_key_id !== signer || report.operator_key_id !== trust.operatorKeyId ||
      report.deployment_sha256 !== trust.deploymentSha256 ||
      ![report.deployment_verified_at, report.writers_fenced_at, report.writers_settled_at].every(value => Number.isSafeInteger(value) && value >= 0) ||
      report.deployment_verified_at > report.writers_fenced_at || report.writers_fenced_at > report.writers_settled_at ||
      report.writers_settled_at > report.verified_at)) throw new Error('Solo authorization differs from trusted policy.')
  const key = await crypto.subtle.importKey('spki', trust.publicKeySpki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, evidence.signature, textBytes(evidence.payload))) {
    throw new Error('Invalid verification signature.')
  }
  return { report, signer }
}

// The explicitly configured independent auditor or solo operator signs real
// deployment and writer-drain evidence. Verification cannot observe/drain old
// Workers itself. No key, report, or epoch is seeded or imported automatically.
export async function registerStorageProtocolVerification(db, trust, evidence) {
  try {
    const { report, signer } = await verifyStorageProtocolEvidence(trust, evidence)
    if (report.version === 2) {
      const policy = await requireCurrentAuthorization(db, trust)
      if (report.deployment_verified_at < policy.enrolled_at) throw new Error('Evidence predates enrollment.')
    }
    success(await db.prepare(`INSERT INTO portfolio_storage_protocol_verifications
      (id,storage_scope,evidence_json,signature_hex,signer_sha256,verified_at)
      SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM portfolio_storage_protocol_verifications WHERE id=?)`
    ).bind(report.id, report.storage_scope, evidence.payload, hex(evidence.signature), signer, report.verified_at, report.id).run())
    const row = await db.prepare('SELECT evidence_json,signature_hex,signer_sha256 FROM portfolio_storage_protocol_verifications WHERE id=?').bind(report.id).first()
    if (!row || row.evidence_json !== evidence.payload || row.signature_hex !== hex(evidence.signature) || row.signer_sha256 !== signer) {
      throw new Error('Verification identity conflict.')
    }
    return { state: 'recorded', id: report.id }
  } catch { return { state: 'blocked', error: { code: 'PROTOCOL_EVIDENCE_UNVERIFIED' } } }
}

export async function attestPortfolioInventory(db, trust, jobId) {
  if (!uuidPattern.test(jobId)) throw new Error('Invalid inventory job ID.')
  try {
    const history = await db.prepare('SELECT * FROM portfolio_inventory_history WHERE job_id=?').bind(jobId).first()
    if (!history) return { state: 'blocked', error: { code: 'STORAGE_HISTORY_UNVERIFIED' } }
    const epoch = await db.prepare('SELECT * FROM portfolio_storage_protocol_verifications WHERE id=?').bind(history.epoch_id).first()
    if (!epoch || !/^[0-9a-f]{128}$/.test(epoch.signature_hex)) throw new Error('Missing protocol evidence.')
    const signature = Uint8Array.from(epoch.signature_hex.match(/../g), part => parseInt(part, 16))
    const verified = await verifyStorageProtocolEvidence(trust, { payload: epoch.evidence_json, signature })
    if (verified.report.id !== history.epoch_id || verified.signer !== epoch.signer_sha256 ||
        verified.report.storage_scope !== epoch.storage_scope || verified.report.verified_at !== epoch.verified_at) {
      throw new Error('Mismatched protocol evidence.')
    }
    const legacyOrigin = await db.prepare('SELECT minimum_at_birth FROM portfolio_storage_origins WHERE portfolio_id=?').bind(history.portfolio_id).first()
    let legacy = null
    if (legacyOrigin?.minimum_at_birth === 0) {
      const authority = await db.prepare(`SELECT r.id FROM portfolio_legacy_reconciliations_current r
        WHERE r.portfolio_id=? AND r.epoch_id=? AND r.id=COALESCE(
          (SELECT reconciliation_id FROM portfolio_legacy_inventory_bindings WHERE job_id=?),
          (SELECT current.id FROM portfolio_legacy_reconciliations_current current WHERE current.portfolio_id=r.portfolio_id ORDER BY current.verified_at DESC,current.id DESC LIMIT 1))`
      ).bind(history.portfolio_id, history.epoch_id, jobId).first()
      if (!authority) throw new Error('Legacy reconciliation is unavailable.')
      legacy = await loadLegacyReconciliation(db, trust, history.portfolio_id, authority.id)
    }
    // Pending deletion freezes allocation identity; closed writer states are
    // terminal. Still recheck the revision atomically when storing the proof.
    if (history.allocation_count < 1 || history.allocation_count > 2000) throw new Error('Inventory verification limit exceeded.')
    const rows = []
    let cursor = ''
    while (rows.length < history.allocation_count) {
      const page = await db.prepare(`SELECT a.prefix,a.allocation_kind,a.source_prefix,a.writer_protocol_version,
        a.writer_token,a.writer_state,a.writer_closed_at,e.sequence
        FROM portfolio_storage_allocations a JOIN portfolio_storage_allocation_events e ON e.prefix=a.prefix AND e.portfolio_id=a.portfolio_id
        WHERE a.portfolio_id=? AND a.prefix>? ORDER BY a.prefix LIMIT 100`).bind(history.portfolio_id, cursor).all()
      if (!page?.success || !Array.isArray(page.results) || page.results.length < 1 || page.results.length > 100 ||
          rows.length + page.results.length > history.allocation_count) throw new Error('Incomplete inventory snapshot.')
      if (page.results.some((row, index) => typeof row.prefix !== 'string' ||
          row.prefix <= (index ? page.results[index - 1].prefix : cursor) ||
          row.writer_state !== 'closed' || row.writer_protocol_version !== 1 || !Number.isSafeInteger(row.sequence))) {
        throw new Error('Invalid inventory snapshot page.')
      }
      rows.push(...page.results)
      cursor = rows.at(-1).prefix
    }
    // Keep native snapshot bytes backward compatible. Legacy proof additionally
    // commits to its DISTINCT authority, signed payload and exact object manifest.
    const snapshot = await digest(textBytes(JSON.stringify({ history, allocations: rows,
      ...(legacy ? { reconciliation: { id: legacy.reconciliationId,
        payload_sha256: await digest(textBytes(JSON.stringify(legacy.report))), manifest_sha256: legacy.report.manifest_sha256 } } : {}) })))
    if (legacy) {
      success(await db.prepare(`INSERT INTO portfolio_legacy_inventory_bindings(job_id,reconciliation_id,snapshot_sha256)
        SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM portfolio_legacy_inventory_bindings WHERE job_id=?)`
      ).bind(jobId, legacy.reconciliationId, snapshot, jobId).run())
      const binding = await db.prepare('SELECT reconciliation_id,snapshot_sha256 FROM portfolio_legacy_inventory_bindings WHERE job_id=?').bind(jobId).first()
      if (!binding || binding.reconciliation_id !== legacy.reconciliationId || binding.snapshot_sha256 !== snapshot) throw new Error('Legacy inventory authority conflict.')
    }
    success(await db.prepare(`INSERT INTO portfolio_inventory_verifications
      (job_id,portfolio_id,birth_token,epoch_id,storage_prefix,allocation_count,allocation_revision,snapshot_sha256,signer_sha256)
      SELECT job_id,portfolio_id,birth_token,epoch_id,storage_prefix,allocation_count,allocation_revision,?,?
      FROM portfolio_inventory_history WHERE job_id=? AND birth_token=? AND epoch_id=? AND storage_prefix=?
        AND allocation_count=? AND allocation_revision=?
        AND NOT EXISTS (SELECT 1 FROM portfolio_inventory_verifications WHERE job_id=?)`
    ).bind(snapshot, verified.signer, jobId, history.birth_token, history.epoch_id, history.storage_prefix,
      history.allocation_count, history.allocation_revision, jobId).run())
    const proof = await db.prepare(`SELECT proof.snapshot_sha256 FROM portfolio_inventory_verifications proof
      JOIN portfolio_verified_inventories valid ON valid.job_id=proof.job_id
      WHERE proof.job_id=? AND proof.snapshot_sha256=? AND proof.signer_sha256=?`
    ).bind(jobId, snapshot, verified.signer).first()
    return proof ? { state: 'attested', allocationCount: history.allocation_count, snapshotSha256: snapshot, ...(legacy ? { exactInventory: legacy.objects } : {}) }
      : { state: 'blocked', error: { code: 'INVENTORY_CHANGED' } }
  } catch { return { state: 'blocked', error: { code: 'INVENTORY_UNVERIFIED' } } }
}
