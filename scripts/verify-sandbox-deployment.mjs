import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sandboxResources } from './check-portfolio-config.mjs'
import { verifyStagingPackage } from './prepare-portfolio-staging.mjs'

const account = '4ec868eac2a3b9127531ad39d2501f15'
const pin = '9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export function latestSandboxDeployment(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0, 'No deployment history')
  const sorted = [...rows].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))
  assert.ok(sorted.every(row => Number.isFinite(Date.parse(row.created_on))), 'Invalid deployment chronology')
  assert.ok(sorted.length === 1 || Date.parse(sorted[0].created_on) > Date.parse(sorted[1].created_on), 'Ambiguous latest deployment')
  assert.ok(sorted[0].versions?.length === 1 && sorted[0].versions[0].percentage === 100, 'Expected single-version 100% deployment')
  return sorted[0]
}
export async function sandboxReadCredential(configPath) {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN
  // Capture existing CLI authentication in memory, never in evidence/stdout.
  const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [wrangler, 'auth', 'token', '--json', '--config', configPath],
    { windowsHide: true, timeout: 30000 })
  const auth = JSON.parse(stdout)
  assert.ok(['oauth', 'api_token'].includes(auth.type) && typeof auth.token === 'string', 'Supported existing authentication required')
  return auth.token
}
export async function verifySandboxDeployment(candidate, worker, expectedVersion, expectedManifestSha256 = pin) {
  assert.ok([sandboxResources.mainName, sandboxResources.hostingName].includes(worker), 'Sandbox Worker required')
  assert.match(expectedVersion, /^[0-9a-f-]{36}$/)
  assert.match(expectedManifestSha256, /^[0-9a-f]{64}$/)
  const verifiedPackage = await verifyStagingPackage(candidate)
  assert.equal(verifiedPackage.target, 'portfolioforest-delete-sandbox')
  assert.equal(verifiedPackage.artifactSha256, expectedManifestSha256)
  const main = worker === sandboxResources.mainName
  const config = JSON.parse(await readFile(join(candidate, main ? 'main.wrangler.jsonc' : 'hosting.wrangler.jsonc'), 'utf8'))
  const credential = await sandboxReadCredential(join(candidate, main ? 'main.wrangler.jsonc' : 'hosting.wrangler.jsonc'))
  assert.ok(credential, 'Existing authentication required')
  const base = `/accounts/${account}/workers/scripts/${worker}`
  const get = path => fetch('https://api.cloudflare.com/client/v4' + path, { method: 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${credential}` }, signal: AbortSignal.timeout(25000) })
  const json = async path => {
    const response = await get(path), data = await response.json()
    assert.ok(response.ok && data.success === true, `Sandbox metadata read failed: ${path} (HTTP ${response.status})`)
    return data.result
  }
  const before = latestSandboxDeployment((await json(base + '/deployments')).deployments)
  assert.equal(before.versions[0].version_id, expectedVersion, 'Expected uploaded version is not active')
  const version = await json(base + '/versions/' + expectedVersion)
  const settings = await json(base + '/settings')
  const checkBindings = bindings => {
    assert.ok(Array.isArray(bindings))
    const databases = bindings.filter(item => item.type === 'd1'), buckets = bindings.filter(item => item.type === 'r2_bucket')
    assert.ok(databases.length === 1 && databases[0].name === (main ? 'bitreca_db' : 'PORTFOLIO_DB') &&
      (databases[0].database_id || databases[0].id) === sandboxResources.databaseId, 'D1 binding differs')
    assert.ok(buckets.length === 1 && buckets[0].name === (main ? 'bitreca_media' : 'PORTFOLIO_FILES') && buckets[0].bucket_name === sandboxResources.bucket, 'R2 binding differs')
    const vars = Object.fromEntries(bindings.filter(item => item.type === 'plain_text').map(item => [item.name, item.text]))
    for (const [name, value] of Object.entries(config.vars)) assert.equal(vars[name], value, `Live config differs: ${name}`)
    for (const [name, value] of Object.entries(vars)) if (name.endsWith('_ENABLED') || name.endsWith('_APPROVED')) {
      assert.equal(value, name === 'PORTFOLIO_LOGIN_RATE_LIMIT_ENABLED' && main ? 'true' : 'false', `Unexpected enabled control: ${name}`)
    }
    assert.equal(vars.PORTFOLIO_STAGING_MUTATIONS_FROZEN, 'true')
  }
  checkBindings(version.resources?.bindings)
  checkBindings(settings.bindings)
  const exposure = await json(base + '/subdomain'), schedules = await json(base + '/schedules')
  const routes = await json(`/accounts/${account}/workers/services/${worker}/environments/production/routes?show_zonename=true`)
  assert.ok(exposure.enabled === false && exposure.previews_enabled === false && schedules.schedules?.length === 0 && Array.isArray(routes) && routes.length === 0, 'Unexpected public access, schedule or route')
  const response = await get(base + '/content/v2')
  assert.ok(response.ok && response.headers.get('content-type')?.includes('multipart/form-data'), 'Module source unavailable')
  const form = await response.formData(), modules = []
  for (const [name, file] of form) if (typeof file !== 'string') modules.push({ name, bytes: Buffer.from(await file.arrayBuffer()) })
  const expectedHash = hash(await readFile(join(candidate, main ? 'main-worker.mjs' : 'hosting-worker.mjs')))
  assert.ok(modules.length === 1 && hash(modules[0].bytes) === expectedHash, 'Live JavaScript differs from pinned candidate')
  const after = latestSandboxDeployment((await json(base + '/deployments')).deployments)
  assert.equal(after.id, before.id, 'Deployment changed during verification')
  return { Name: worker, Version: expectedVersion, Verified: true, Percentage: 100, Deployment: before.id,
    JavaScriptSha256: expectedHash, Frozen: true, Private: true, Schedules: 0, CandidateManifestSha256: expectedManifestSha256,
    Limitation: 'Current-script byte identity bracketed by stable deployment records; static asset inventory and external writer settlement are separate evidence.' }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 5, 'Usage: verify-sandbox-deployment.mjs CANDIDATE WORKER EXPECTED_VERSION')
    console.log(JSON.stringify(await verifySandboxDeployment(...process.argv.slice(2)), null, 2))
  } catch (error) { console.error(`Sandbox verification refused: ${error.message}`); process.exitCode = 1 }
}
