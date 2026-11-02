import assert from 'node:assert/strict'
import test from 'node:test'
import { handlePublicPortfolioDirectory, publicPortfolioUrl } from '../worker/portfolio-public-directory.js'

const preview = {
  PORTFOLIO_ENVIRONMENT: 'staging',
  PORTFOLIO_STAGING_PREVIEW_ENABLED: 'true',
  PORTFOLIO_STAGING_PREVIEW_SLUG: 'demo',
  PORTFOLIO_STAGING_HOSTNAME: 'bitreca-portfolio-hosting-staging.ceasar-elkhatib.workers.dev',
}
const request = new Request('https://bitreca-main-staging.ceasar-elkhatib.workers.dev/api/portfolios')

function envWithRows(rows, vars = preview) {
  let query = ''
  const env = {
    ...vars,
    bitreca_db: { prepare(sql) { query = sql; return { async all() { return { results: rows } } } } },
  }
  return { env, query: () => query }
}

test('staging lists only the one authorized published slug', async () => {
  const rows = [
    { name: 'Demo', slug: 'demo', profession: 'Developer', description: 'test', featured: 1 },
    { name: 'Another', slug: 'another', featured: 0 },
  ]
  const fixture = envWithRows(rows)
  const response = await handlePublicPortfolioDirectory(request, fixture.env, new URL(request.url))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const data = await response.json()
  assert.equal(data.portfolios.length, 1)
  assert.deepEqual(data.portfolios[0], {
    name: 'Demo', slug: 'demo', profession: 'Developer', description: 'test', featured: true,
    website_url: 'https://bitreca-portfolio-hosting-staging.ceasar-elkhatib.workers.dev',
  })
  assert.match(fixture.query(), /status = 'published'/)
  assert.match(fixture.query(), /deletion_requested_at IS NULL/)
  assert.doesNotMatch(fixture.query(), /storage_prefix/)
})

test('disabled staging preview emits no customer links or cards', async () => {
  const fixture = envWithRows([{ name: 'Demo', slug: 'demo' }], { ...preview, PORTFOLIO_STAGING_PREVIEW_ENABLED: 'false' })
  const response = await handlePublicPortfolioDirectory(request, fixture.env, new URL(request.url))
  assert.deepEqual((await response.json()).portfolios, [])
})

test('invalid hostnames and production do not invent public URLs', () => {
  assert.equal(publicPortfolioUrl({ ...preview, PORTFOLIO_STAGING_HOSTNAME: 'bitreca.com' }, 'demo'), null)
  assert.equal(publicPortfolioUrl(preview, 'other'), null)
  assert.equal(publicPortfolioUrl({ PORTFOLIO_ENVIRONMENT: 'production' }, 'demo'), null)
  assert.equal(publicPortfolioUrl(preview, 'x<script>'), null)
})

test('other paths and methods fall through', async () => {
  const fixture = envWithRows([])
  assert.equal(await handlePublicPortfolioDirectory(new Request(request.url, { method: 'POST' }), fixture.env, new URL(request.url)), null)
  assert.equal(await handlePublicPortfolioDirectory(request, fixture.env, new URL('https://example.com/api/projects')), null)
})

test('database errors fail closed with no leaked details', async () => {
  const env = { ...preview, bitreca_db: { prepare() { throw new Error('SECRET INTERNAL') } } }
  const orig = console.error
  console.error = () => {}
  try {
    const response = await handlePublicPortfolioDirectory(request, env, new URL(request.url))
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /SECRET INTERNAL/)
  } finally { console.error = orig }
})
