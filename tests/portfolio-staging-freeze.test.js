import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'

const origin = 'https://fixture.invalid'
const frozen = {
  PORTFOLIO_ENVIRONMENT: 'staging',
  PORTFOLIO_STAGING_MUTATIONS_FROZEN: 'true',
}

const mutationRoutes = [
  ['POST', '/api/admin/portfolios'],
  ['PUT', '/api/admin/portfolios/1'],
  ['POST', '/api/admin/portfolios/1/upload'],
  ['POST', '/api/admin/portfolios/1/upload-folder'],
  ['PATCH', '/api/admin/portfolios/1/status'],
  ['DELETE', '/api/admin/portfolios/1'],
  ['POST', '/api/admin/portfolio-deletion-jobs/00000000-0000-4000-8000-000000000001/retry'],
  ['POST', '/api/admin/portfolio-protocol-evidence'],
]

function request(method, path) {
  return new Request(origin + path, {
    method,
    headers: { Origin: origin },
  })
}

test('staging freeze blocks all identified portfolio mutations', async () => {
  for (const [method, path] of mutationRoutes) {
    const response = await worker.fetch(request(method, path), frozen)
    assert.equal(response.status, 503, `${method} ${path}`)
    assert.equal(
      (await response.json()).message,
      'Portfolio mutations are temporarily unavailable.'
    )
  }
})

test('staging freeze leaves health checks available', async () => {
  const response = await worker.fetch(request('GET', '/api/health'), frozen)
  assert.equal(response.status, 200)
})

test('production ignores the staging freeze flag', async () => {
  const env = {
    PORTFOLIO_ENVIRONMENT: 'production',
    PORTFOLIO_STAGING_MUTATIONS_FROZEN: 'true',
  }
  const response = await worker.fetch(
    request('POST', '/api/admin/portfolios'),
    env
  )
  const result = await response.json()
  assert.notEqual(
    result.message,
    'Portfolio mutations are temporarily unavailable.'
  )
})
