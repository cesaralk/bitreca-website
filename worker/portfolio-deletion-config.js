import { cleanPortfolioStorageEnabled, portfolioStorageBinding, portfolioMutationsFrozen } from '../shared/portfolio-storage.js'
import { stagingPortfolioPreview } from '../shared/portfolio-staging.js'
import { requireCurrentAuthorization } from './portfolio-authorization.js'
import { legacyDeletionEnabled } from './portfolio-legacy-deletion.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const PORTFOLIO_STORAGE_SENTINEL = '__portfolioforest_control__/storage-identity'
const productionBucket = 'bitreca-media'
const productionDatabase = '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
class DeletionConfigurationError extends Error {
  constructor() { super('Storage identity does not match the approved environment.'); this.code = 'CONFIGURATION_BLOCKED' }
}
export const deletionRequestsEnabled = env => !portfolioMutationsFrozen(env) && env.PORTFOLIO_DELETE_REQUESTS_ENABLED === 'true' &&
  ['staging', 'production'].includes(env.PORTFOLIO_ENVIRONMENT)

export async function inventoryTrustFromEnvironment(env) {
  const environment = env.PORTFOLIO_ENVIRONMENT
  const bucket = env.PORTFOLIO_BUCKET_NAME, database = env.PORTFOLIO_DATABASE_ID
  if (environment === 'production' && bucket !== productionBucket && !cleanPortfolioStorageEnabled(env)) throw new DeletionConfigurationError()
  if (!['staging', 'production'].includes(environment) || typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket) ||
      typeof database !== 'string' || !uuid.test(database) ||
      env.PORTFOLIO_STORAGE_SCOPE !== `portfolioforest/${environment}/${bucket}/${database}` ||
      (environment === 'staging' && (bucket === productionBucket || database === productionDatabase))) {
    throw new Error('Portfolio resource configuration is not approved.')
  }
  const encoded = env.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI
  if (typeof encoded !== 'string' || encoded.length < 40 || encoded.length > 700 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('A pinned public verification key is required.')
  }
  const publicKeySpki = Uint8Array.from(atob(encoded), character => character.charCodeAt(0))
  await crypto.subtle.importKey('spki', publicKeySpki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', publicKeySpki)), byte => byte.toString(16).padStart(2, '0')).join('')
  const authorizationPolicy = env.PORTFOLIO_AUTHORIZATION_POLICY || 'independent-v1'
  if (cleanPortfolioStorageEnabled(env) && authorizationPolicy !== 'solo-operator-v1') throw new DeletionConfigurationError()
  if (!['independent-v1', 'solo-operator-v1'].includes(authorizationPolicy)) throw new Error('Unknown authorization policy.')
  const trust = { publicKeySpki, storageScope: env.PORTFOLIO_STORAGE_SCOPE, fingerprint, environment, bucket, database, authorizationPolicy }
  if (authorizationPolicy === 'solo-operator-v1') {
    Object.assign(trust, { policyId: env.PORTFOLIO_AUTHORIZATION_POLICY_ID,
      policyGeneration: Number(env.PORTFOLIO_AUTHORIZATION_GENERATION), operatorId: env.PORTFOLIO_OPERATOR_ID,
      operatorKeyId: env.PORTFOLIO_OPERATOR_KEY_ID, deploymentSha256: env.PORTFOLIO_DEPLOYMENT_SHA256 })
    if (!uuid.test(trust.policyId || '') || !Number.isSafeInteger(trust.policyGeneration) || trust.policyGeneration < 1 ||
        !/^[a-zA-Z0-9._@-]{1,100}$/.test(trust.operatorId || '') || trust.operatorKeyId !== fingerprint ||
        !/^[0-9a-f]{64}$/.test(trust.deploymentSha256 || '')) throw new Error('Solo policy pins are incomplete.')
  }
  return trust
}

// Called before issuance, not settlement: an uncertain writer can never be
// closed merely because its authorization was revoked.
export async function authorizePortfolioWriter(env, { verifyStorageIdentity = false } = {}) {
  if (portfolioMutationsFrozen(env)) throw new DeletionConfigurationError()
  if (env.PORTFOLIO_AUTHORIZATION_POLICY && !['independent-v1', 'solo-operator-v1'].includes(env.PORTFOLIO_AUTHORIZATION_POLICY)) throw new Error('Unknown authorization policy.')
  if (cleanPortfolioStorageEnabled(env) && env.PORTFOLIO_AUTHORIZATION_POLICY !== 'solo-operator-v1') throw new DeletionConfigurationError()
  if (env.PORTFOLIO_AUTHORIZATION_POLICY !== 'solo-operator-v1') return
  const trust = await inventoryTrustFromEnvironment(env)
  await requireCurrentAuthorization(env.bitreca_db, trust)
  if (cleanPortfolioStorageEnabled(env)) {
    portfolioStorageBinding(env)
    const epoch = await env.bitreca_db.prepare(`SELECT id FROM portfolio_storage_authorized_epochs
      WHERE storage_scope=? AND signer_sha256=? ORDER BY verified_at DESC,id DESC LIMIT 1`)
      .bind(trust.storageScope, trust.fingerprint).first()
    if (!epoch) throw new DeletionConfigurationError()
    // Once at issuance, never a hidden call per uploaded object.
    if (verifyStorageIdentity) await verifiedCleanupBinding(env, trust)
  }
  return trust
}

export async function getDeletionAuthorization(env, expectedRevision) {
  if (env.PORTFOLIO_CLEANUP_ENABLED !== 'true' || portfolioMutationsFrozen(env)) return null
  const trust = await inventoryTrustFromEnvironment(env)
  try { await requireCurrentAuthorization(env.bitreca_db, trust) } catch { return null }
  // Production requires an additional explicit approval, never inherited by a
  // local/staging profile. The D1 policy and bucket identity must also agree.
  if (trust.environment === 'production' && env.PORTFOLIO_PRODUCTION_CLEANUP_APPROVED !== 'true') return null
  const policy = await env.bitreca_db.prepare(`SELECT * FROM portfolio_deletion_runtime_policy
    WHERE id=1 AND cleanup_enabled=1`).first()
  if (!policy || (expectedRevision !== undefined && policy.revision !== expectedRevision) ||
      policy.environment !== trust.environment || policy.storage_scope !== trust.storageScope ||
      policy.bucket_name !== trust.bucket || policy.database_id !== trust.database || policy.signer_sha256 !== trust.fingerprint) return null
  return { trust, revision: policy.revision,
    finalizationEnabled: env.PORTFOLIO_FINALIZATION_ENABLED === 'true' && policy.finalization_enabled === 1 }
}

export async function deletionCapabilities(env) {
  let authorization = null, configurationError = false
  try { authorization = await getDeletionAuthorization(env) } catch { configurationError = true }
  const legacyOnly = legacyDeletionEnabled(env)
  return { environment: env.PORTFOLIO_ENVIRONMENT || 'production', stagingPreview: stagingPortfolioPreview(env),
    requestsEnabled: deletionRequestsEnabled(env) || legacyOnly, legacyOnly,
    cleanupEnabled: Boolean(authorization) || legacyOnly,
    finalizationEnabled: authorization?.finalizationEnabled === true,
    scheduleEnabled: Boolean(authorization) && env.PORTFOLIO_SCHEDULE_ENABLED === 'true',
    configurationError, message: legacyOnly ? 'Only the three explicitly reviewed legacy portfolios are eligible; their R2 objects are restricted to a fixed allowlist.'
      : authorization ? 'Execution requires verified ownership and settled writers.'
      : 'Automatic cleanup is disabled or awaiting approved configuration. No storage will be deleted.' }
}

async function verifiedCleanupBinding(env, trust) {
  const binding = portfolioStorageBinding(env)
  const metadata = (await binding.head(PORTFOLIO_STORAGE_SENTINEL))?.customMetadata
  if (!metadata || metadata.environment !== trust.environment || metadata.storage_scope !== trust.storageScope ||
      metadata.bucket_name !== trust.bucket || metadata.database_id !== trust.database) {
    throw new DeletionConfigurationError()
  }
  return binding
}

export async function guardedCleanupStorage(env, authorization) {
  const binding = await verifiedCleanupBinding(env, authorization.trust)
  async function authorized() {
    if (!await getDeletionAuthorization(env, authorization.revision)) throw new DeletionConfigurationError()
  }
  return {
    async list(options) { await authorized(); return binding.list(options) },
    async head(key) { await authorized(); return binding.head(key) },
    async delete(keys) { await authorized(); return binding.delete(keys) },
  }
}
