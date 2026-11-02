import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { latestSandboxDeployment, verifySandboxDeployment } from '../scripts/verify-sandbox-deployment.mjs'
import { sandboxResources } from '../scripts/check-portfolio-config.mjs'

const candidate = 'C:/Users/cezar/Desktop/bitreca-deletion-review/candidate-module-discovery-off-20261027'
const version = '8cd0d626-b2f3-45e9-b813-5f6fecdc6701'
const oldVersion = '10047b0a-9778-4df5-a6be-45392b3e241a'
const history = [
  { id: 'old', created_on: '2026-10-25T22:00:00Z', versions: [{ version_id: oldVersion, percentage: 100 }] },
  { id: 'new', created_on: '2026-10-27T16:42:00Z', versions: [{ version_id: version, percentage: 100 }] },
]
test('deployment chronology uses timestamps in either order and rejects ambiguous or split traffic', () => {
  assert.equal(latestSandboxDeployment(history).id, 'new')
  assert.equal(latestSandboxDeployment([...history].reverse()).id, 'new')
  assert.throws(() => latestSandboxDeployment([]))
  assert.throws(() => latestSandboxDeployment([{ ...history[1], created_on: 'invalid' }]))
  assert.throws(() => latestSandboxDeployment([history[1], history[1]]))
  assert.throws(() => latestSandboxDeployment([{ ...history[1], versions: [{ version_id: version, percentage: 50 }] }]))
})
for (const scenario of ['valid main', 'valid hosting', 'not active', 'wrong bytes', 'unfrozen', 'public access']) {
  test('GET-only post-deployment verifier: ' + scenario, async t => {
    const previousToken = process.env.CLOUDFLARE_API_TOKEN
    process.env.CLOUDFLARE_API_TOKEN = 'local-test-token-never-transmitted'
    t.after(() => { if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = previousToken })
    const main = scenario !== 'valid hosting'
    const worker = main ? sandboxResources.mainName : sandboxResources.hostingName
    const config = JSON.parse(await readFile(join(candidate, main ? 'main.wrangler.jsonc' : 'hosting.wrangler.jsonc'), 'utf8'))
    const bindings = Object.entries(config.vars).map(([name, text]) => ({ name, text, type: 'plain_text' }))
    bindings.push({ name: main ? 'bitreca_db' : 'PORTFOLIO_DB', type: 'd1', database_id: sandboxResources.databaseId },
      { name: main ? 'bitreca_media' : 'PORTFOLIO_FILES', type: 'r2_bucket', bucket_name: sandboxResources.bucket })
    if (scenario === 'unfrozen') bindings.find(item => item.name === 'PORTFOLIO_STAGING_MUTATIONS_FROZEN').text = 'false'
    let calls = 0
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      calls++
      assert.equal(options.method, 'GET')
      assert.equal(options.redirect, 'error')
      assert.ok(url.includes('/' + worker + '/'))
      let result
      if (url.endsWith('/deployments')) result = { deployments: scenario === 'not active' ? [history[0]] : history }
      else if (url.endsWith('/versions/' + version)) result = { resources: { bindings } }
      else if (url.endsWith('/settings')) result = { bindings }
      else if (url.endsWith('/subdomain')) result = { enabled: scenario === 'public access', previews_enabled: false }
      else if (url.endsWith('/schedules')) result = { schedules: [] }
      else if (url.includes('/routes?')) result = []
      else if (url.endsWith('/content/v2')) {
        const bytes = scenario === 'wrong bytes' ? 'WRONG' : await readFile(join(candidate, main ? 'main-worker.mjs' : 'hosting-worker.mjs'))
        const form = new FormData(); form.append('worker.mjs', new Blob([bytes], { type: 'application/javascript' }), 'worker.mjs')
        return new Response(form)
      } else assert.fail('Unexpected mocked endpoint')
      return Response.json({ success: true, result })
    })
    if (scenario.startsWith('valid')) {
      const result = await verifySandboxDeployment(candidate, worker, version,
        scenario === 'valid main' ? '9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199' : undefined)
      assert.equal(result.Verified, true); assert.equal(result.Name, worker); assert.equal(result.Version, version)
    } else await assert.rejects(verifySandboxDeployment(candidate, worker, version))
    assert.ok(calls > 0)
  })
}

test('explicit candidate pin cannot bypass package integrity before any authentication or GET', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Pin mismatch must fail before remote access'))
  await assert.rejects(verifySandboxDeployment(candidate, sandboxResources.mainName, version, '0'.repeat(64)))
})
