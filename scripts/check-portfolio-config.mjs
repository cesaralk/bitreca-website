import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createPublicKey } from 'node:crypto'
import { Buffer } from 'node:buffer'

export const stagingResources = Object.freeze({ mainName: 'bitreca-main-staging', hostingName: 'bitreca-portfolio-hosting-staging',
  databaseName: 'bitreca-portfolio-staging-db', databaseId: 'c9f87f2a-12fd-45bf-bf94-02e0f1f24d07', bucket: 'bitreca-portfolio-staging' })
export const sandboxResources = Object.freeze({ mainName: 'bitreca-main-delete-sandbox-20261025', hostingName: 'bitreca-hosting-delete-sandbox-20261025',
  databaseName: 'bitreca-delete-sandbox-db-20261025', databaseId: '9c236935-b942-4cd7-9360-fed24db999fa', bucket: 'bitreca-delete-sandbox-r2-20261025' })

const flags = ['DELETE_REQUESTS', 'CLEANUP', 'FINALIZATION', 'SCHEDULE', 'EVIDENCE_IMPORT']
const productionBucket = 'bitreca-media', productionDatabase = '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
export function validateStaging(config, { allowPlaceholders = false } = {}) {
  const db = config.d1_databases?.find(binding => binding.binding === 'bitreca_db')
  const bucket = config.r2_buckets?.find(binding => binding.binding === 'bitreca_media')
  assert.ok(db && bucket, 'Both staging bindings are required.')
  assert.equal(config.d1_databases.length, 1); assert.equal(config.r2_buckets.length, 1)
  assert.equal(config.workers_dev, false)
  assert.ok(config.preview_urls !== true)
  assert.equal(config.vars?.PORTFOLIO_ENVIRONMENT, 'staging')
  for (const secret of ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET']) {
    assert.ok(!Object.hasOwn(config.vars, secret), 'Staging credentials belong in secret bindings, never public configuration.')
  }
  assert.notEqual(db.database_id, productionDatabase, 'Production D1 is forbidden in staging.')
  assert.notEqual(bucket.bucket_name, productionBucket, 'Production R2 is forbidden in staging.')
  assert.equal(db.remote, false); assert.equal(bucket.remote, false)
  assert.notEqual(bucket.preview_bucket_name, productionBucket)
  assert.equal(bucket.preview_bucket_name, bucket.bucket_name, 'Staging preview must use the explicitly reviewed staging bucket.')
  assert.equal(config.vars.PORTFOLIO_DATABASE_ID, db.database_id)
  assert.equal(config.vars.PORTFOLIO_BUCKET_NAME, bucket.bucket_name)
  assert.equal(config.vars.PORTFOLIO_STORAGE_SCOPE, `portfolioforest/staging/${bucket.bucket_name}/${db.database_id}`)
  // Permit a single staging-only login limiter without opening any public route.
  if (config.ratelimits !== undefined) {
    assert.equal(config.ratelimits.length, 1)
    const rate = config.ratelimits[0]
    assert.deepEqual(Object.keys(rate).sort(), ['name', 'namespace_id', 'simple'])
    assert.equal(rate.name, 'STAGING_ADMIN_LOGIN_LIMITER')
    assert.match(rate.namespace_id, /^[1-9][0-9]*$/)
    assert.deepEqual(rate.simple, { limit: 8, period: 60 })
    assert.equal(config.vars.PORTFOLIO_LOGIN_RATE_LIMIT_ENABLED, 'true')
  } else {
    assert.notEqual(config.vars.PORTFOLIO_LOGIN_RATE_LIMIT_ENABLED, 'true',
      'Enabled login protection requires a rate limiter binding.')
  }
  assert.ok(!config.route && !config.routes?.length && !config.triggers?.crons?.length, 'Staging template must not attach routes or Cron.')
  assert.ok(!config.env || Object.keys(config.env).length === 0, 'Unreviewed nested environment overrides are forbidden.')
  for (const flag of flags) assert.equal(config.vars[`PORTFOLIO_${flag}_ENABLED`], 'false', 'Execution remains disabled during readiness checks.')
  assert.equal(config.vars.PORTFOLIO_PRODUCTION_CLEANUP_APPROVED, 'false')
  if (!allowPlaceholders) {
    assert.match(db.database_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    assert.match(bucket.bucket_name, /^[a-z0-9][a-z0-9-]{2,62}$/)
    assert.match(config.vars.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI, /^[A-Za-z0-9+/]{40,700}={0,2}$/)
    const pin = createPublicKey({ key: Buffer.from(config.vars.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI, 'base64'), format: 'der', type: 'spki' })
    assert.equal(pin.asymmetricKeyType, 'ec'); assert.equal(pin.asymmetricKeyDetails.namedCurve, 'prime256v1')
    assert.match(config.vars.ADMIN_AUTH_VERSION, /^[1-9][0-9]*$/)
    assert.ok(Number.isSafeInteger(Number(config.vars.ADMIN_AUTH_VERSION)))
    assert.ok(!JSON.stringify(config).includes('REPLACE_'), 'Replace and independently review every placeholder.')
  }
}
export function validateStagingPair(main, hosting, options = {}) {
  const resources = options.resources || stagingResources
  validateStaging(main, options)
  assert.equal(main.name, resources.mainName); assert.equal(hosting.name, resources.hostingName)
  for (const [config, dbBinding, r2Binding, entry] of [
    [main, 'bitreca_db', 'bitreca_media', 'worker/index.js'], [hosting, 'PORTFOLIO_DB', 'PORTFOLIO_FILES', 'portfolio-hosting/index.js'],
  ]) {
    const fields = ['$schema', 'name', 'main', 'compatibility_date', 'workers_dev', 'preview_urls', 'assets', 'd1_databases', 'r2_buckets', 'vars', 'secrets', 'triggers', 'ratelimits', 'find_additional_modules']
    for (const field of Object.keys(config)) assert.ok(fields.includes(field), 'Unreviewed build hooks or additional resource bindings are forbidden.')
    if (config.find_additional_modules !== undefined) assert.equal(config.find_additional_modules, false)
    assert.equal(config.main, entry)
    assert.equal(config.d1_databases.length, 1); assert.equal(config.r2_buckets.length, 1)
    assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false)
    assert.ok(!config.route && !config.routes?.length && !config.triggers?.crons?.length)
    assert.ok(!config.env || Object.keys(config.env).length === 0)
    const db = config.d1_databases[0], bucket = config.r2_buckets[0]
    for (const field of Object.keys(db)) assert.ok(['binding', 'database_name', 'database_id', 'preview_database_id', 'migrations_dir', 'remote'].includes(field))
    for (const field of Object.keys(bucket)) assert.ok(['binding', 'bucket_name', 'preview_bucket_name', 'remote'].includes(field))
    assert.equal(db.binding, dbBinding); assert.equal(bucket.binding, r2Binding)
    assert.equal(db.database_name, resources.databaseName); assert.equal(db.database_id, resources.databaseId)
    assert.equal(db.preview_database_id, resources.databaseId)
    assert.equal(db.migrations_dir, './migrations')
    assert.equal(bucket.bucket_name, resources.bucket); assert.equal(bucket.preview_bucket_name, resources.bucket)
    assert.equal(db.remote, false); assert.equal(bucket.remote, false)
    assert.equal(config.vars.PORTFOLIO_ENVIRONMENT, 'staging')
    assert.equal(config.vars.PORTFOLIO_STAGING_PREVIEW_ENABLED, 'false')
    for (const name of ['PORTFOLIO_STAGING_HOSTNAME', 'PORTFOLIO_STAGING_PREVIEW_SLUG']) assert.equal(config.vars[name], main.vars[name])
    for (const [name, value] of Object.entries(config.vars)) {
      if (name === 'PORTFOLIO_LOGIN_RATE_LIMIT_ENABLED' && config === main && config.ratelimits?.length === 1) {
        assert.equal(value, 'true')
      } else if (name.endsWith('_ENABLED') || name.endsWith('_APPROVED')) {
        assert.equal(value, 'false')
      }
    }
    if (config === hosting) {
      assert.equal(config.ratelimits, undefined, 'The public content worker needs no admin login limiter.')
    }
  }
  assert.equal(main.vars.PORTFOLIO_UPLOAD_MAX_FILES, '10')
  assert.equal(main.vars.PORTFOLIO_CLEANUP_R2_OPERATION_LIMIT, '1')
  assert.deepEqual(main.secrets?.required, ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET'])
  assert.equal(main.assets?.not_found_handling, 'single-page-application')
  assert.deepEqual(main.assets?.run_worker_first, ['/api/*'])
}
export function validateSandboxPair(main, hosting) {
  validateStagingPair(main, hosting, { resources: sandboxResources, allowPlaceholders: true })
  for (const config of [main, hosting]) {
    assert.equal(config.vars.PORTFOLIO_DATABASE_ID, sandboxResources.databaseId)
    assert.equal(config.vars.PORTFOLIO_BUCKET_NAME, sandboxResources.bucket)
    assert.equal(config.vars.PORTFOLIO_STORAGE_SCOPE, `portfolioforest/staging/${sandboxResources.bucket}/${sandboxResources.databaseId}`)
    assert.equal(config.vars.PORTFOLIO_STAGING_MUTATIONS_FROZEN, 'true')
    for (const secret of ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET']) assert.ok(!Object.hasOwn(config.vars, secret))
  }
}
async function main(path) {
  if (path) {
    validateStaging(JSON.parse(await readFile(path, 'utf8')))
    console.log('PASS: staging configuration is structurally isolated and disabled. Actual resource ownership, permissions, hosting bindings, and bucket identity still require independent manual verification.')
    return
  }
  for (const file of ['wrangler.jsonc', 'wrangler.portfolio-hosting.jsonc']) {
    const config = JSON.parse(await readFile(file, 'utf8'))
    for (const binding of [...config.d1_databases, ...config.r2_buckets]) assert.equal(binding.remote, false)
    for (const bucket of config.r2_buckets) assert.notEqual(bucket.preview_bucket_name, bucket.bucket_name)
    assert.ok(!config.triggers?.crons?.length)
    if (config.vars) for (const flag of flags) assert.equal(config.vars[`PORTFOLIO_${flag}_ENABLED`], 'false')
  }
  const staging = JSON.parse(await readFile('tests/fixtures/retired-environments/wrangler.portfolio-staging.example.jsonc', 'utf8'))
  validateStaging(staging, { allowPlaceholders: true })
  const hosting = JSON.parse(await readFile('tests/fixtures/retired-environments/wrangler.portfolio-hosting-staging.example.jsonc', 'utf8'))
  assert.equal(hosting.d1_databases[0].database_id, staging.d1_databases[0].database_id)
  assert.equal(hosting.r2_buckets[0].bucket_name, staging.r2_buckets[0].bucket_name)
  assert.equal(hosting.workers_dev, false)
  assert.ok(!hosting.routes?.length && !hosting.triggers?.crons?.length)
  for (const binding of [...hosting.d1_databases, ...hosting.r2_buckets]) assert.equal(binding.remote, false)
  const preparedMain = JSON.parse(await readFile('tests/fixtures/retired-environments/wrangler.portfolio-staging.jsonc', 'utf8'))
  const preparedHosting = JSON.parse(await readFile('tests/fixtures/retired-environments/wrangler.portfolio-hosting-staging.jsonc', 'utf8'))
  validateStagingPair(preparedMain, preparedHosting, { allowPlaceholders: true })
  console.log('PASS: production defaults/templates preserved; both prepared staging configs use exactly the approved isolated resources, named Workers, disabled controls and no public routes. Public pin and verified auth version are still required; no provider isolation was checked.')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(() => { console.error('Configuration check refused: resource isolation, disabled controls, or required values do not meet the reviewed staging contract. No Cloudflare resources were accessed.'); process.exitCode = 1 })
}
