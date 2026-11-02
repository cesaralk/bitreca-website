import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stagingPortfolioPreview } from '../shared/portfolio-staging.js'
import hosting from '../portfolio-hosting/index.js'
import { portfolioAddress } from '../src/utils/portfolioAdmin.js'
import { validatePortfolioMigrations } from '../scripts/check-portfolio-migrations.mjs'
import { packagePath } from '../scripts/prepare-portfolio-staging.mjs'
import { quotePowerShell } from '../scripts/portfolio-staging-plan.mjs'
import { stagingFixtureFiles } from '../scripts/prepare-portfolio-fixture.mjs'

const previewEnv = { PORTFOLIO_ENVIRONMENT: 'staging', PORTFOLIO_STAGING_PREVIEW_ENABLED: 'true',
  PORTFOLIO_STAGING_HOSTNAME: 'bitreca-portfolio-hosting-staging.fixture.workers.dev', PORTFOLIO_STAGING_PREVIEW_SLUG: 'fixture-one' }

test('all migration paths preserve data and enforce D1-compatible GLOB constraints in disposable memory', () => {
  assert.equal(validatePortfolioMigrations().migrations, 14)
})
test('staging preview requires explicit opt-in, exact dedicated hostname and fixed server-selected slug', () => {
  assert.equal(stagingPortfolioPreview({ ...previewEnv, PORTFOLIO_STAGING_PREVIEW_ENABLED: 'false' }), null)
  assert.equal(stagingPortfolioPreview({ ...previewEnv, PORTFOLIO_ENVIRONMENT: 'production' }), null)
  assert.equal(stagingPortfolioPreview({ ...previewEnv, PORTFOLIO_STAGING_HOSTNAME: 'customer.bitreca.com' }), null)
  assert.equal(stagingPortfolioPreview({ ...previewEnv, PORTFOLIO_STAGING_HOSTNAME: previewEnv.PORTFOLIO_STAGING_HOSTNAME + '.evil.invalid' }), null)
  assert.equal(stagingPortfolioPreview({ ...previewEnv, PORTFOLIO_STAGING_PREVIEW_SLUG: '../another' }), null)
  assert.equal(stagingPortfolioPreview(previewEnv).slug, 'fixture-one')
})
test('staging hosting serves relative/root-relative files of only its fixed portfolio, then fences unpublish/deletion', async () => {
  let pending = false, published = true, queries = 0
  const keys = [], cancelled = []
  const env = { ...previewEnv, PORTFOLIO_DB: { prepare(sql) { return { bind(value) { return { async first() {
    queries++
    if (sql.includes('WHERE slug')) assert.equal(value, 'fixture-one')
    else assert.equal(value, 1)
    return pending || !published ? null : { id: 1, storage_prefix: 'fixture-owned/' }
  } } } } } }, PORTFOLIO_FILES: { async get(key) {
    keys.push(key)
    return { body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(key)); controller.close() }, cancel() { cancelled.push(key) } }) }
  } } }
  for (const path of ['/', '/assets/style.css', '/assets/app.js', '/index.html?slug=another-customer']) {
    const result = await hosting.fetch(new Request('https://' + previewEnv.PORTFOLIO_STAGING_HOSTNAME + path), env)
    assert.equal(result.status, 200); assert.equal(result.headers.get('Cache-Control'), 'no-store')
    assert.ok((await result.text()).startsWith('fixture-owned/'))
  }
  const reads = keys.length, before = queries
  for (const host of ['customer.bitreca.com', 'bitreca.com', 'bitreca-portfolio-hosting-staging.other.workers.dev']) {
    assert.equal((await hosting.fetch(new Request('https://' + host + '/'), env)).status, 404)
  }
  assert.equal(queries, before)
  published = false
  assert.equal((await hosting.fetch(new Request('https://' + previewEnv.PORTFOLIO_STAGING_HOSTNAME + '/'), env)).status, 404)
  published = true; pending = true
  assert.equal((await hosting.fetch(new Request('https://' + previewEnv.PORTFOLIO_STAGING_HOSTNAME + '/'), env)).status, 404)
  assert.equal(keys.length, reads)
  assert.deepEqual(cancelled, [])
})
test('staging or unknown admin environments cannot emit production customer links', () => {
  const portfolio = { slug: 'fixture-one' }
  assert.equal(portfolioAddress(portfolio, { environment: 'staging' }), null)
  assert.equal(portfolioAddress(portfolio, { environment: 'unknown' }), null)
  assert.equal(portfolioAddress(portfolio, { environment: 'production' }), 'https://fixture-one.bitreca.com')
  const deployment = { environment: 'staging', stagingPreview: stagingPortfolioPreview(previewEnv) }
  assert.equal(portfolioAddress(portfolio, deployment), 'https://' + previewEnv.PORTFOLIO_STAGING_HOSTNAME)
  assert.equal(portfolioAddress({ slug: 'another' }, deployment), null)
  deployment.stagingPreview.hostname = 'customer.bitreca.com'
  assert.equal(portfolioAddress(portfolio, deployment), null)
})
test('package manifests cannot escape their directory or reference secret files; command quoting preserves literals', () => {
  for (const name of ['../.dev.vars', '.env', 'client/../../secret', 'client\\..\\private.pem', 'client//index.html', 'operator.private.pem']) {
    assert.throws(() => packagePath('C:/fixture-package', name))
  }
  assert.ok(packagePath('C:/fixture-package', 'client/assets/index.js').endsWith('index.js'))
  assert.equal(quotePowerShell("path' $(do-not-execute)"), "'path'' $(do-not-execute)'")
})
test('staging fixtures remain under five kilobytes with independent customers and relative/root-relative asset paths', () => {
  const files = stagingFixtureFiles()
  assert.ok(Object.values(files).join('').length < 5000)
  assert.ok(files['portfolio-a/index.html'].includes('href="/assets/style.css"'))
  assert.ok(files['portfolio-a/index.html'].includes('src="./assets/app.js"'))
  assert.notEqual(files['portfolio-a/assets/style.css'], files['portfolio-b/assets/style.css'])
})
