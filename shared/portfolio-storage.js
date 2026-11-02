// Bucket selection is derived from immutable birth/epoch records, never from
// a URL, slug, prefix resemblance or an R2 miss. This module performs no R2 calls.
const productionDatabase = '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
const legacyScope = `portfolioforest/production/bitreca-media/${productionDatabase}`

function blocked() {
  const error = new Error('Portfolio storage identity is unavailable.')
  error.code = 'CONFIGURATION_BLOCKED'
  throw error
}

export function cleanPortfolioStorageEnabled(env) {
  const value = env?.PORTFOLIO_CLEAN_STORAGE_ENABLED
  if (value !== undefined && value !== 'false' && value !== 'true') blocked()
  return value === 'true'
}

function cleanConfiguration(env) {
  const bucket = env.PORTFOLIO_BUCKET_NAME
  if (env.PORTFOLIO_ENVIRONMENT !== 'production' || env.PORTFOLIO_DATABASE_ID !== productionDatabase ||
      typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket) || bucket === 'bitreca-media' ||
      env.PORTFOLIO_STORAGE_SCOPE !== `portfolioforest/production/${bucket}/${productionDatabase}` ||
      env.PORTFOLIO_LEGACY_STORAGE_SCOPE !== legacyScope) blocked()
}

export function portfolioStorageBinding(env, role = 'main') {
  if (!['main', 'hosting'].includes(role)) blocked()
  let binding
  if (cleanPortfolioStorageEnabled(env)) {
    cleanConfiguration(env)
    binding = env.PORTFOLIO_STORAGE
  } else {
    // A new production scope must never fall back to the legacy bucket when a
    // deployment omits or disables the explicit clean-routing flag.
    if (env.PORTFOLIO_ENVIRONMENT === 'production' && env.PORTFOLIO_BUCKET_NAME !== undefined &&
        env.PORTFOLIO_BUCKET_NAME !== 'bitreca-media') blocked()
    binding = role === 'hosting' ? env.PORTFOLIO_FILES : env.bitreca_media
  }
  if (!binding || typeof binding !== 'object') blocked()
  return binding
}

export function newPortfolioStorage(env) {
  return portfolioStorageBinding(env)
}

function readOnly(binding) {
  if (!binding || typeof binding !== 'object') blocked()
  const call = (method, args) => {
    if (typeof binding[method] !== 'function') blocked()
    return binding[method](...args)
  }
  return Object.freeze({
    get: (...args) => call('get', args),
    head: (...args) => call('head', args),
    list: (...args) => call('list', args),
  })
}

const validId = id => Number.isSafeInteger(id) && id > 0
const validBirth = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value)

export async function getPortfolioReadStorage(env, db, portfolioId, role = 'main') {
  if (!validId(portfolioId) || !['main', 'hosting'].includes(role)) blocked()
  if (!cleanPortfolioStorageEnabled(env)) return readOnly(portfolioStorageBinding(env, role))
  cleanConfiguration(env)
  const oldBinding = role === 'hosting' ? env.PORTFOLIO_FILES : env.bitreca_media
  const row = await db.prepare(`SELECT p.id,p.storage_birth_token,o.portfolio_id AS origin_portfolio_id,
    o.birth_token,o.minimum_at_birth,o.epoch_id,e.id AS retained_epoch_id,e.storage_scope
    FROM portfolios p LEFT JOIN portfolio_storage_origins o ON o.portfolio_id=p.id
    LEFT JOIN portfolio_storage_protocol_verifications e ON e.id=o.epoch_id
    WHERE p.id=?`).bind(portfolioId).first()
  if (!row || row.id !== portfolioId) blocked()
  if (row.origin_portfolio_id == null) {
    if (row.storage_birth_token !== null) blocked()
    return readOnly(oldBinding)
  }
  if (row.origin_portfolio_id !== portfolioId || !validBirth(row.birth_token) ||
      row.storage_birth_token !== row.birth_token || ![0, 1].includes(row.minimum_at_birth)) blocked()
  if (row.epoch_id === null) {
    if (row.minimum_at_birth !== 0 || row.retained_epoch_id !== null) blocked()
    return readOnly(oldBinding)
  }
  if (typeof row.epoch_id !== 'string' || row.retained_epoch_id !== row.epoch_id) blocked()
  if (row.storage_scope === legacyScope) return readOnly(oldBinding)
  if (row.minimum_at_birth !== 1 || row.storage_scope !== env.PORTFOLIO_STORAGE_SCOPE) blocked()
  return readOnly(portfolioStorageBinding(env, role))
}

export async function requirePortfolioWriteStorage(env, db, portfolioId, { sourcePrefix } = {}) {
  if (!validId(portfolioId)) blocked()
  if (!cleanPortfolioStorageEnabled(env)) return portfolioStorageBinding(env)
  cleanConfiguration(env)
  if (sourcePrefix !== undefined && (typeof sourcePrefix !== 'string' || !sourcePrefix.endsWith('/') ||
      !sourcePrefix.length || sourcePrefix.includes('\0') || new TextEncoder().encode(sourcePrefix).length > 1024)) blocked()
  const row = await db.prepare(`SELECT p.id,p.storage_prefix,p.storage_birth_token,p.deletion_requested_at,
    o.birth_token,o.minimum_at_birth,o.epoch_id,e.id AS authorized_epoch_id,e.storage_scope,
    CASE WHEN ? IS NULL THEN 1 ELSE EXISTS(SELECT 1 FROM portfolio_storage_allocations a
      WHERE a.portfolio_id=p.id AND a.prefix=? AND a.writer_protocol_version=1 AND a.writer_state='closed') END AS source_owned
    FROM portfolios p JOIN portfolio_storage_origins o ON o.portfolio_id=p.id
    JOIN portfolio_storage_authorized_epochs e ON e.id=o.epoch_id
    WHERE p.id=?`).bind(sourcePrefix ?? null, sourcePrefix ?? null, portfolioId).first()
  if (!row || row.id !== portfolioId || row.deletion_requested_at !== null || !validBirth(row.birth_token) ||
      row.storage_birth_token !== row.birth_token || row.minimum_at_birth !== 1 ||
      typeof row.epoch_id !== 'string' || row.authorized_epoch_id !== row.epoch_id ||
      row.storage_scope !== env.PORTFOLIO_STORAGE_SCOPE || row.source_owned !== 1 ||
      (sourcePrefix !== undefined && sourcePrefix !== row.storage_prefix)) blocked()
  return portfolioStorageBinding(env)
}

// Explicit opt-in is required to resume writes after a clean-scope cutover.
export function portfolioMutationsFrozen(env) {
  return cleanPortfolioStorageEnabled(env) && env.PORTFOLIO_MUTATIONS_FROZEN !== 'false'
}
