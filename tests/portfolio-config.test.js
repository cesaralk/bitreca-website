import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateKeyPairSync } from 'node:crypto'
import { validateStaging, validateStagingPair } from '../scripts/check-portfolio-config.mjs'

const template = () => JSON.parse(readFileSync(new URL('./fixtures/retired-environments/wrangler.portfolio-staging.example.jsonc', import.meta.url), 'utf8'))
function isolated() {
  const config = template(), id = '22222222-2222-4222-8222-222222222222', bucket = 'portfolioforest-isolated-fixture'
  config.name = 'portfolioforest-isolated-fixture'
  Object.assign(config.d1_databases[0], { database_id: id, database_name: 'isolated-fixture' })
  Object.assign(config.r2_buckets[0], { bucket_name: bucket, preview_bucket_name: bucket })
  Object.assign(config.vars, { PORTFOLIO_DATABASE_ID: id, PORTFOLIO_BUCKET_NAME: bucket,
    PORTFOLIO_STORAGE_SCOPE: `portfolioforest/staging/${bucket}/${id}`,
    PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64') })
  return config
}
test('staging templates remain unprovisioned and cannot accidentally pass an actual staging readiness check', () => {
  assert.doesNotThrow(() => validateStaging(template(), { allowPlaceholders: true }))
  assert.throws(() => validateStaging(template()))
  assert.doesNotThrow(() => validateStaging(isolated()))
})
test('static staging guard rejects production aliases, mismatched scopes, enabled execution and attached routes', () => {
  for (const mutate of [
    config => { config.d1_databases[0].database_id = '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a' },
    config => { config.r2_buckets[0].bucket_name = 'bitreca-media' },
    config => { config.r2_buckets[0].preview_bucket_name = 'bitreca-media' },
    config => { config.vars.PORTFOLIO_STORAGE_SCOPE = 'foreign' },
    config => { config.vars.PORTFOLIO_CLEANUP_ENABLED = 'true' },
    config => { config.r2_buckets[0].remote = true },
    config => { config.triggers.crons = ['* * * * *'] },
    config => { config.routes = ['*.bitreca.com/*'] },
    config => { config.route = 'bitreca.com/*' },
    config => { config.workers_dev = true },
    config => { config.vars.ADMIN_PASSWORD = 'fixture-only' },
    config => { config.r2_buckets.push({ bucket_name: 'bitreca-media' }) },
    config => { config.env = { hidden: { r2_buckets: [{ bucket_name: 'bitreca-media' }] } } },
  ]) { const config = isolated(); mutate(config); assert.throws(() => validateStaging(config)) }
})

test('prepared named staging pair has exact approved resources, disabled preview and unapplied authentication trust placeholders', () => {
  const main = JSON.parse(readFileSync(new URL('./fixtures/retired-environments/wrangler.portfolio-staging.jsonc', import.meta.url), 'utf8'))
  const hosting = JSON.parse(readFileSync(new URL('./fixtures/retired-environments/wrangler.portfolio-hosting-staging.jsonc', import.meta.url), 'utf8'))
  assert.doesNotThrow(() => validateStagingPair(main, hosting, { allowPlaceholders: true }))
  assert.doesNotThrow(() => validateStagingPair(main, hosting))
  for (const extra of [{ build: { command: 'npm run deploy' } }, { services: [{ binding: 'unreviewed', service: 'production' }] }]) {
    assert.throws(() => validateStagingPair({ ...main, ...extra }, hosting, { allowPlaceholders: true }))
  }
  hosting.d1_databases[0].preview_database_id = '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a'
  assert.throws(() => validateStagingPair(main, hosting, { allowPlaceholders: true }))
})
