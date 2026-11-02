import test from 'node:test'
import assert from 'node:assert/strict'
import { stagingLoginLimitResponse } from '../worker/portfolio-login-limiter.js'
import { validateStagingPair } from '../scripts/check-portfolio-config.mjs'
import { readFile } from 'node:fs/promises'

const request = new Request('https://bitreca-main-staging.example.workers.dev/api/admin/login', {
  method: 'POST', headers: { 'cf-connecting-ip': '192.0.2.4' }, body: '{}',
})
const env = (limit, extras = {}) => ({
  PORTFOLIO_ENVIRONMENT: 'staging', PORTFOLIO_LOGIN_RATE_LIMIT_ENABLED: 'true',
  STAGING_ADMIN_LOGIN_LIMITER: { limit }, ...extras,
})

test('blocks requests after the staging limiter denies them', async () => {
  let usedKey
  const response = await stagingLoginLimitResponse(request, env(async ({ key }) => { usedKey = key; return { success: false } }))
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '60')
  assert.equal(usedKey, 'bitreca-staging-admin-login:192.0.2.4')
})
test('allows requests within limit', async () => {
  assert.equal(await stagingLoginLimitResponse(request, env(async () => ({ success: true }))), null)
})
test('fails closed when configured limiter is absent', async () => {
  const response = await stagingLoginLimitResponse(request, env(undefined, { STAGING_ADMIN_LOGIN_LIMITER: undefined }))
  assert.equal(response.status, 503)
})
test('fails closed when rate limiting service throws', async () => {
  const response = await stagingLoginLimitResponse(request, env(async () => { throw Error('unavailable') }))
  assert.equal(response.status, 503)
})
test('leaves production and local configurations unchanged', async () => {
  assert.equal(await stagingLoginLimitResponse(request, env(undefined, { PORTFOLIO_ENVIRONMENT: 'production' })), null)
  assert.equal(await stagingLoginLimitResponse(request, env(undefined, { PORTFOLIO_LOGIN_RATE_LIMIT_ENABLED: undefined })), null)
})
test('staging binding requires sealed pair and keeps hosting isolated', async () => {
  const main = JSON.parse(await readFile(new URL('../wrangler.portfolio-staging.jsonc', import.meta.url)))
  const hosting = JSON.parse(await readFile(new URL('../wrangler.portfolio-hosting-staging.jsonc', import.meta.url)))
  validateStagingPair(main, hosting, { allowPlaceholders: true })
  assert.equal(main.workers_dev, false)
  assert.equal(hosting.workers_dev, false)
  assert.equal(main.vars.PORTFOLIO_STAGING_PREVIEW_ENABLED, 'false')
  assert.equal(hosting.vars.PORTFOLIO_STAGING_PREVIEW_ENABLED, 'false')
})
