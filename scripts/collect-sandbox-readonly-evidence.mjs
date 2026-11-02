import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { sandboxResources, validateSandboxPair } from './check-portfolio-config.mjs'
import { sandboxReadinessSQL, validateSandboxSnapshot, sandboxScope } from './check-portfolio-sandbox.mjs'
import { verifyStagingPackage } from './prepare-portfolio-staging.mjs'
import { latestSandboxDeployment, sandboxReadCredential } from './verify-sandbox-deployment.mjs'

// Explicit read-only collector. No arbitrary API path, SQL, method or Worker
// argument is accepted. Auth values stay in memory and are never logged/saved.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const account = '4ec868eac2a3b9127531ad39d2501f15'
const candidatePins = ['76cf9c64aa605bb0cfe685f917a79a8a4d4108969df43c1583439a34abaca52e',
  '9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const runFile = promisify(execFile)

// Complements the completed deployment review; does NOT fetch Worker versions,
// repeat the account Worker inventory, or execute a write-capable operation.
export async function collectPrecutoverEvidence({ candidate, output }) {
  candidate = resolve(candidate); output = resolve(output)
  assert.ok(output.toLowerCase() !== root.toLowerCase() && !output.toLowerCase().startsWith(root.toLowerCase() + '\\') && !output.toLowerCase().startsWith(root.toLowerCase() + '/'))
  const verified = await verifyStagingPackage(candidate)
  assert.equal(verified.artifactSha256, candidatePins[1])
  await mkdir(output, { recursive: false })
  const records = [], findings = []
  const save = async (file, data) => {
    const bytes = JSON.stringify(data, null, 2) + '\n'
    await writeFile(join(output, file), bytes, { flag: 'wx' })
    records.push({ file, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) })
  }
  const credential = await sandboxReadCredential(join(candidate, 'main.wrangler.jsonc'))
  const base = `/accounts/${account}`
  for (const [file, path, kind] of [
    ['account-token-metadata', `${base}/tokens?page=1&per_page=100`, 'tokens'],
    ['user-token-metadata', '/user/tokens?page=1&per_page=100', 'tokens'],
    ['account-member-roles', `${base}/members?status=accepted&page=1&per_page=100`, 'members'],
    ['sandbox-r2-lock', `${base}/r2/buckets/${sandboxResources.bucket}/lock`, 'bucket'],
    ['sandbox-r2-lifecycle', `${base}/r2/buckets/${sandboxResources.bucket}/lifecycle`, 'bucket'],
    ['sandbox-access-namespace', `${base}/workers/subdomain`, 'bucket'],
  ]) {
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4' + path, { method: 'GET', redirect: 'error',
        headers: { Authorization: `Bearer ${credential}` }, signal: AbortSignal.timeout(25000) })
      const data = await response.json()
      let result = null
      if (response.ok && data.success === true) {
        if (kind === 'tokens') result = data.result.map(item => ({ id: item.id, name: item.name, status: item.status,
          issued_on: item.issued_on, expires_on: item.expires_on, policies: item.policies }))
        else if (kind === 'members') result = data.result.map(item => ({ id: item.id, status: item.status, user_id: item.user?.id,
          roles: item.roles?.map(role => ({ id: role.id, name: role.name, permissions: role.permissions })) }))
        else result = data.result
      }
      const record = { collected_at: new Date().toISOString(), method: 'GET', path, http_status: response.status,
        success: response.ok && data.success === true, result, result_info: data.result_info,
        limitation: 'Metadata visible to this principal only. Not proof that all external/S3/CI writers or in-flight operations are excluded.' }
      await save(file + '.json', record)
      findings.push({ check: file, http_status: response.status, visible_records: Array.isArray(result) ? result.length : null,
        complete_endpoint_page: record.success && (kind === 'bucket' || (data.result_info?.total_count !== undefined && data.result_info.total_count <= result.length)) })
    } catch { findings.push({ check: file, error: 'Read unavailable; no permissions were requested or changed.' }) }
  }
  const sql = sandboxReadinessSQL.replace(/;\s*$/, '') + `,
    (SELECT count(*) FROM portfolio_storage_origins) AS origins,
    (SELECT count(*) FROM portfolio_storage_allocation_events) AS allocation_events,
    (SELECT count(*) FROM portfolio_storage_birth_seals) AS birth_seals,
    (SELECT count(*) FROM portfolio_deletion_finalizations) AS finalizations;`
  const { stdout } = await runFile(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute',
    sandboxResources.databaseName, '--remote', '--json', '--config', join(candidate, 'main.wrangler.jsonc'), '--command', sql],
  { windowsHide: true, timeout: 45000, maxBuffer: 1024 * 1024 })
  const state = JSON.parse(stdout)
  assert.ok(state.length === 1 && state[0].success && state[0].meta.rows_written === 0 && state[0].meta.changed_db === false)
  const manifest = JSON.parse(await readFile(join(candidate, 'deployment-artifact.json'), 'utf8'))
  validateSandboxSnapshot(state, manifest.files.filter(item => item.path.startsWith('migrations/')).map(item => item.path.slice(11)))
  for (const name of ['origins', 'allocation_events', 'birth_seals', 'finalizations']) assert.equal(state[0].results[0][name], 0)
  await save('sandbox-writer-state.json', { collected_at: new Date().toISOString(), sql, response: state })
  for (const file of ['docs/sandbox-deployment-verification.md', 'docs/sandbox-writer-audit-checklist.md',
    'docs/sandbox-deletion-e2e.md', 'docs/portfolio-writer-cutover.md', 'scripts/portfolio-evidence.mjs']) {
    const bytes = await readFile(join(root, file))
    await writeFile(join(output, file.replaceAll('/', '__')), bytes, { flag: 'wx' })
    records.push({ file: file.replaceAll('/', '__'), source: file, bytes: bytes.length, sha256: sha(bytes) })
  }
  const summary = { format: 1, collected_at: new Date().toISOString(), classification: 'UNSIGNED OBSERVATIONS; NOT INDEPENDENT ATTESTATION',
    account, resources: sandboxResources, scope: sandboxScope, candidate_manifest_sha256: verified.artifactSha256,
    completed_deployment: { main: '8cd0d626-b2f3-45e9-b813-5f6fecdc6701', hosting: 'c94bc0ed-f2b5-4734-bc08-68510bd7f7f1',
      source: 'Retained prior completed deployment verification; not re-investigated in this collection.' },
    registered_writer_state: 'No allocations, writer/birth events or finalization records in the current D1 baseline.', findings,
    external_writers_excluded: 'NOT PROVEN', legacy_writers_settled: 'NOT PROVEN', rollback_prevention: 'NOT PROVEN',
    recovery_restored: 'NOT PROVEN', remote_mutations: false, records }
  await save('precutover-evidence.json', summary)
  return { output, findings, files_hashed: records.length, evidence_sha256: records.at(-1).sha256,
    legacy_writers_settled: 'NOT PROVEN', deployment_reinvestigated: false }
}

export async function collectSandboxEvidence({ candidate, output }) {
  candidate = resolve(candidate); output = resolve(output)
  assert.ok(output !== root && !output.startsWith(root + '\\') && !output.startsWith(root + '/'))
  const verified = await verifyStagingPackage(candidate)
  assert.equal(verified.target, 'portfolioforest-delete-sandbox')
  assert.ok(candidatePins.includes(verified.artifactSha256))
  const candidateHash = verified.artifactSha256
  const main = JSON.parse(await readFile(join(root, 'wrangler.delete-sandbox.jsonc'), 'utf8'))
  const hosting = JSON.parse(await readFile(join(root, 'wrangler.delete-sandbox-hosting.jsonc'), 'utf8'))
  validateSandboxPair(main, hosting)
  await mkdir(output, { recursive: false }) // No overwrite or resume into an old collection.
  const records = []
  const save = async (name, bytes) => {
    await writeFile(join(output, name), bytes, { flag: 'wx' })
    records.push({ file: name, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) })
  }
  const credential = await sandboxReadCredential(join(candidate, 'main.wrangler.jsonc'))
  const started = new Date().toISOString()
  const observations = [], workers = []
  const request = async (path, method = 'GET') => {
    assert.ok(['GET', 'HEAD'].includes(method))
    assert.ok(path.startsWith(`/accounts/${account}/`))
    return fetch('https://api.cloudflare.com/client/v4' + path, { method, redirect: 'error',
      headers: { Authorization: `Bearer ${credential}` }, signal: AbortSignal.timeout(25000) })
  }
  const jsonRead = async (name, path) => {
    const response = await request(path)
    const data = await response.json()
    await save(name + '.json', JSON.stringify({ collected_at: new Date().toISOString(), http_status: response.status, data }, null, 2) + '\n')
    if (!response.ok || data.success !== true) throw new Error(`${name}: read unavailable (HTTP ${response.status})`)
    return data.result
  }
  for (const [worker, filename] of [[sandboxResources.mainName, 'main-worker.mjs'], [sandboxResources.hostingName, 'hosting-worker.mjs']]) {
    const base = `/accounts/${account}/workers/scripts/${worker}`
    try {
      const deployments = await jsonRead(worker + '-deployments', base + '/deployments')
      const versions = await jsonRead(worker + '-versions', base + '/versions')
      await jsonRead(worker + '-settings', base + '/settings')
      await jsonRead(worker + '-subdomain', base + '/subdomain')
      await jsonRead(worker + '-schedules', base + '/schedules')
      await jsonRead(worker + '-routes', `/accounts/${account}/workers/services/${worker}/environments/production/routes?show_zonename=true`)
      const active = latestSandboxDeployment(deployments.deployments).versions
      assert.ok(Array.isArray(active) && active.length > 0, 'Active version metadata unavailable')
      const details = []
      for (const version of active.filter(item => item.percentage > 0)) {
        assert.match(version.version_id, /^[0-9a-f-]{36}$/)
        details.push(await jsonRead(worker + '-version-' + version.version_id, base + '/versions/' + version.version_id))
      }
      const before = JSON.stringify(active)
      const response = await request(base + '/content/v2')
      const bytes = Buffer.from(await response.arrayBuffer())
      const comparison = { http_status: response.status, content_type: response.headers.get('content-type'),
        candidate_module_sha256: sha(await readFile(join(candidate, filename))), modules: [] }
      if (response.ok) {
        await save(worker + '-content.bin', bytes)
        if (comparison.content_type?.includes('multipart/form-data')) {
          const form = await new Response(bytes, { headers: { 'Content-Type': comparison.content_type } }).formData()
          let index = 0
          for (const [name, value] of form) {
            if (typeof value === 'string') continue
            const module = Buffer.from(await value.arrayBuffer())
            await save(worker + '-module-' + index++ + '.bin', module)
            comparison.modules.push({ name, bytes: module.length, sha256: sha(module), equals_candidate: sha(module) === comparison.candidate_module_sha256 })
          }
        } else comparison.modules.push({ name: 'raw-response', bytes: bytes.length, sha256: sha(bytes), equals_candidate: sha(bytes) === comparison.candidate_module_sha256 })
      }
      const after = await jsonRead(worker + '-deployments-after-content', base + '/deployments')
      comparison.stable_active_versions = JSON.stringify(latestSandboxDeployment(after.deployments).versions) === before
      comparison.limitation = 'Current-script API observation bracketed by deployment metadata; does not prove version-specific immutable content or asset-by-asset deployment identity.'
      workers.push({ worker, active, versions_returned: versions.items?.length ?? versions.length ?? null,
        bindings: details.map(item => item.resources?.bindings), comparison })
    } catch (error) { observations.push({ worker, error: error.message }) }
  }
  for (const [name, sql] of [['baseline', sandboxReadinessSQL], ['foreign-keys', 'PRAGMA foreign_key_check;'], ['quick-check', 'PRAGMA quick_check;']]) {
    try {
      assert.match(sql, /^(SELECT|PRAGMA)\b/)
      const { stdout } = await runFile(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'),
        'd1', 'execute', sandboxResources.databaseName, '--remote', '--json', '--config', join(root, 'wrangler.delete-sandbox.jsonc'), '--command', sql],
      { cwd: root, windowsHide: true, timeout: 45000, maxBuffer: 1024 * 1024 })
      const data = JSON.parse(stdout)
      assert.ok(data.every(item => item.success && item.meta?.rows_written === 0 && item.meta?.changed_db === false))
      await save('d1-' + name + '.json', JSON.stringify(data, null, 2) + '\n')
      if (name === 'baseline') {
        const manifest = JSON.parse(await readFile(join(candidate, 'deployment-artifact.json'), 'utf8'))
        observations.push({ check: name, ...validateSandboxSnapshot(data, manifest.files.filter(item => item.path.startsWith('migrations/')).map(item => item.path.slice(11))) })
      } else observations.push({ check: name, results: data.map(item => item.results) })
    } catch { observations.push({ check: name, error: 'Read unavailable or validation failed; no write was issued. See retained successful raw responses.' }) }
  }
  // Only the known sentinel object is addressed. No customer-object enumeration.
  const sentinel = `/accounts/${account}/r2/buckets/${sandboxResources.bucket}/objects/__portfolioforest_control__/storage-identity`
  try {
    const listed = await jsonRead('r2-sentinel-list', `/accounts/${account}/r2/buckets/${sandboxResources.bucket}/objects?prefix=__portfolioforest_control__%2Fstorage-identity&limit=1&include=customMetadata`)
    assert.ok(Array.isArray(listed) && listed.length === 1 && listed[0].key === '__portfolioforest_control__/storage-identity')
    const metadata = listed[0].custom_metadata
    assert.ok(metadata && metadata.environment === 'staging' && metadata.storage_scope === sandboxScope &&
      metadata.bucket_name === sandboxResources.bucket && metadata.database_id === sandboxResources.databaseId)
    observations.push({ check: 'r2-identity-metadata', matches: true, etag: listed[0].etag, size: listed[0].size })
  } catch { observations.push({ check: 'r2-identity-metadata', matches: false, error: 'Exact sentinel metadata could not be verified.' }) }
  for (const method of ['GET']) {
    try {
      const response = await request(sentinel, method)
      const headers = Object.fromEntries([...response.headers].filter(([key]) => /metadata|etag|content-type|content-length/i.test(key)))
      const item = { method, http_status: response.status, headers }
      if (method === 'GET') {
        const bytes = Buffer.from(await response.arrayBuffer())
        await save('r2-sentinel-get.bin', bytes)
        item.body_sha256 = sha(bytes)
      }
      observations.push({ check: 'r2-sentinel', ...item })
    } catch { observations.push({ check: 'r2-sentinel', method, error: 'Read unavailable; identity not freshly established.' }) }
  }
  const summary = { started_at: started, completed_at: new Date().toISOString(), account, resources: sandboxResources,
    storage_scope: sandboxScope, candidate_manifest_sha256: candidateHash, remote_mutations: false,
    workers, observations, legacy_writers_settled: 'NOT PROVEN', records }
  await writeFile(join(output, 'collection-summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
  return { output, workers: workers.map(({ worker, active, comparison }) => ({ worker, active, comparison })), observations, files_hashed: records.length }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const precutover = process.argv[2] === '--precutover'
    assert.equal(process.argv.length, precutover ? 5 : 4, 'Usage: collect-sandbox-readonly-evidence.mjs [--precutover] CANDIDATE NEW_OUTSIDE_REPO_DIRECTORY')
    const options = { candidate: process.argv[precutover ? 3 : 2], output: process.argv[precutover ? 4 : 3] }
    console.log(JSON.stringify(await (precutover ? collectPrecutoverEvidence(options) : collectSandboxEvidence(options)), null, 2))
  } catch { console.error('Read-only sandbox collection stopped; no remote mutation was issued. Existing evidence was preserved.'); process.exitCode = 1 }
}
