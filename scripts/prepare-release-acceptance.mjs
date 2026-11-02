import { writeFile, copyFile } from 'node:fs/promises'
const target = 'C:/Users/cezar/Desktop/bitreca-deletion-integration'
for (const path of ['scripts/execute-generation3-recovery.mjs', 'scripts/portfolio-schema-identity.mjs', 'tests/portfolio-schema-identity.test.mjs']) await copyFile(path, target + '/' + path)
await writeFile(target + '/tests/portfolio-release-integration.test.mjs', `import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { deletionEligibility } from '../worker/portfolio-deletion-eligibility.js'
import { legacyDeletionEnabled, supportsLegacyIdentity } from '../worker/portfolio-legacy-deletion.js'
import { handlePublicPortfolioDirectory } from '../worker/portfolio-public-directory.js'
test('unknown, historical, wrong-policy and uncertain-writer records never claim cleanup eligibility', () => {
  for (const row of [null, {}, { tracked_birth: 0 }, { tracked_birth: 1, authorized_origin: 0 }, { tracked_birth: 1, authorized_origin: 1, uncertain_writers: 1 }]) assert.equal(deletionEligibility(row).canRequest, false)
  assert.equal(deletionEligibility({ tracked_birth: 1, authorized_origin: 1, uncertain_writers: 0 }).canRequest, true)
  assert.equal(deletionEligibility({ deletion_requested_at: 1 }).code, 'ALREADY_REQUESTED')
  assert.equal(legacyDeletionEnabled({ PORTFOLIO_LEGACY_DELETE_ENABLED: 'true' }), false)
  assert.equal(supportsLegacyIdentity(1, 'forest-demo', 'portfolios/forest-demo/'), false)
})
test('six public production links survive integration without touching any real customer record', async () => {
  const slugs = ['cezar','rona','taline','hadeel','rahaf','roua']
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'))
  const env = { ...config.vars, bitreca_db: { prepare: () => ({ all: async () => ({ results: slugs.map(slug => ({ name: slug, slug, featured: 1 })) }) }) } }
  const request = new Request('https://bitreca.com/api/portfolios')
  const response = await handlePublicPortfolioDirectory(request, env, new URL(request.url))
  assert.deepEqual((await response.json()).portfolios.map(row => row.website_url), slugs.map(slug => 'https://' + slug + '.bitreca.com'))
})
test('release preserves live frontend, disabled controls and original finalization guard', async () => {
  for (const path of ['src/pages/PortfolioForest.jsx','src/pages/PortfolioForest.css','src/App.jsx','src/components/Navbar.jsx']) {
    assert.equal((await readFile(path,'utf8')).replaceAll('\\r\\n','\\n'), execFileSync('git',['show','HEAD:'+path],{encoding:'utf8'}).replaceAll('\\r\\n','\\n'))
  }
  const config = JSON.parse(await readFile('wrangler.jsonc','utf8'))
  for (const flag of ['DELETE_REQUESTS','CLEANUP','FINALIZATION','SCHEDULE','EVIDENCE_IMPORT','LEGACY_DELETE']) assert.equal(config.vars['PORTFOLIO_'+flag+'_ENABLED'],'false')
  assert.deepEqual(config.triggers.crons,[])
  await assert.rejects(readFile('migrations/0015_legacy_portfolio_finalization.sql'))
  assert.ok(!(await readFile('worker/portfolio-deletion-api.js','utf8')).includes('portfolio_legacy_deletion_finalizations'))
})
`, { flag: 'wx' })
console.log('Prepared focused eligibility, public-link and disabled-release regression tests.')
