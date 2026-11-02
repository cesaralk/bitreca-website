import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, realpath } from 'node:fs/promises'
import { createHash, createPublicKey } from 'node:crypto'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { verifyStagingPackage } from './prepare-portfolio-staging.mjs'
import { sandboxResources } from './check-portfolio-config.mjs'
import { prepareSoloEnrollment } from './portfolio-evidence.mjs'
import { sandboxReadCredential, verifySandboxDeployment } from './verify-sandbox-deployment.mjs'

// No operations on import. CLI defaults to local preparation/plan; every remote
// stage has its own explicit approval flag and a SHA-256-pinned execution plan.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const account = '4ec868eac2a3b9127531ad39d2501f15'
const scope = `portfolioforest/staging/${sandboxResources.bucket}/${sandboxResources.databaseId}`
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const jsonBytes = value => JSON.stringify(value, null, 2) + '\n'
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
const executeFile = promisify(execFile)
const baselineCandidate = 'C:/Users/cezar/Desktop/bitreca-deletion-review/candidate-module-discovery-off-20261027'
const baselinePin = '9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199'
const workers = [
  { name: sandboxResources.mainName, config: 'main.wrangler.jsonc', baselineVersion: '8cd0d626-b2f3-45e9-b813-5f6fecdc6701' },
  { name: sandboxResources.hostingName, config: 'hosting.wrangler.jsonc', baselineVersion: 'c94bc0ed-f2b5-4734-bc08-68510bd7f7f1' },
]
const tools = ['solo-sandbox-release.mjs', 'verify-sandbox-deployment.mjs', 'prepare-portfolio-staging.mjs',
  'check-portfolio-config.mjs', 'portfolio-evidence.mjs', '../worker/portfolio-inventory.js', '../worker/portfolio-authorization.js']
const save = (path, value) => writeFile(path, jsonBytes(value), { flag: 'wx' })
async function externalNewDirectory(path) {
  path = resolve(path)
  // Resolve the existing parent, so a junction cannot redirect storage into Git.
  const parent = await realpath(dirname(path)), destination = join(parent, path.slice(dirname(path).length + 1))
  const child = relative(await realpath(root), destination)
  assert.ok(isAbsolute(child) || child === '..' || child.startsWith('..\\') || child.startsWith('../'), 'Release storage must be outside the repository')
  await mkdir(destination, { recursive: false })
  return destination
}
async function candidateDetails(directory) {
  const verified = await verifyStagingPackage(directory)
  assert.equal(verified.target, 'portfolioforest-delete-sandbox')
  const manifest = await readJSON(join(directory, 'deployment-artifact.json'))
  const migrations = manifest.files.filter(item => item.path.startsWith('migrations/')).map(item => item.path.slice(11)).sort()
  assert.equal(migrations.length, 14)
  migrations.forEach((name, index) => assert.equal(Number(name.slice(0, 4)), index + 1))
  for (const worker of workers) assert.equal((await readJSON(join(directory, worker.config))).find_additional_modules, false)
  const code = { format: 1, scope, workers: await Promise.all(workers.map(async worker => ({ name: worker.name,
    javascript_sha256: hash(await readFile(join(directory, worker.config === 'main.wrangler.jsonc' ? 'main-worker.mjs' : 'hosting-worker.mjs'))) }))) }
  return { verified, manifest, migrations, code }
}
export async function sealCandidate(source, output) {
  const details = await candidateDetails(source)
  const directory = await externalNewDirectory(output)
  await cp(resolve(source), directory, { recursive: true, force: false, errorOnExist: true })
  if (!details.manifest.files.some(item => item.path === 'code-artifacts.json')) {
    const bytes = jsonBytes(details.code)
    await writeFile(join(directory, 'code-artifacts.json'), bytes, { flag: 'wx' })
    details.manifest.files.push({ path: 'code-artifacts.json', bytes: Buffer.byteLength(bytes), sha256: hash(bytes) })
    details.manifest.files.sort((a, b) => a.path.localeCompare(b.path))
    await writeFile(join(directory, 'deployment-artifact.json'), jsonBytes(details.manifest))
  }
  const result = await candidateDetails(directory)
  assert.deepEqual(await readJSON(join(directory, 'code-artifacts.json')), result.code)
  return { directory, ...result.verified, migrations: 14, codeManifestSha256: hash(await readFile(join(directory, 'code-artifacts.json'))),
    ownerPinned: Boolean((await readJSON(join(directory, 'main.wrangler.jsonc'))).vars.PORTFOLIO_OPERATOR_KEY_ID) }
}
export async function prepareOwnerCandidate({ source, output, publicKey, operatorId, policyId, enrolledAt }) {
  const details = await candidateDetails(source)
  const deployment = await readFile(join(source, 'code-artifacts.json'))
  assert.deepEqual(JSON.parse(deployment), details.code)
  const enrollment = prepareSoloEnrollment({ publicKey: await readFile(publicKey), scope, deployment,
    operatorId, policyId, generation: 1, enrolledAt })
  const directory = await externalNewDirectory(output), candidate = join(directory, 'candidate')
  await cp(resolve(source), candidate, { recursive: true, force: false, errorOnExist: true })
  for (const worker of workers) {
    const config = await readJSON(join(candidate, worker.config))
    Object.assign(config.vars, enrollment.environment)
    const bytes = jsonBytes(config)
    await writeFile(join(candidate, worker.config), bytes)
    Object.assign(details.manifest.files.find(item => item.path === worker.config), { bytes: Buffer.byteLength(bytes), sha256: hash(bytes) })
  }
  await writeFile(join(candidate, 'deployment-artifact.json'), jsonBytes(details.manifest))
  await save(join(directory, 'enrollment.json'), enrollment)
  await save(join(directory, 'owner-authorization.json'), enrollment.authorization)
  await writeFile(join(directory, 'enrollment.sql'), enrollment.enrollmentSQL + '\n', { flag: 'wx' })
  return { directory, candidate, ...(await verifyStagingPackage(candidate)), warning: 'PUBLIC inputs only; no key generated and no enrollment executed.' }
}
export async function prepareReleasePlan({ candidate, expectedPin, output, enrollmentFile }) {
  candidate = await realpath(candidate)
  const details = await candidateDetails(candidate)
  assert.equal(details.verified.artifactSha256, expectedPin)
  assert.deepEqual(await readJSON(join(candidate, 'code-artifacts.json')), details.code)
  let enrollment = null
  if (enrollmentFile) {
    enrollment = await readJSON(enrollmentFile)
    const key = createPublicKey({ key: Buffer.from(enrollment.publicKeyPin.public_key_spki_base64, 'base64'), format: 'der', type: 'spki' })
    const rebuilt = prepareSoloEnrollment({ publicKey: key.export({ type: 'spki', format: 'pem' }), scope,
      deployment: await readFile(join(candidate, 'code-artifacts.json')), policyId: enrollment.authorization.policyId,
      operatorId: enrollment.authorization.operatorId, generation: 1, enrolledAt: enrollment.authorization.enrolledAt })
    assert.deepEqual(enrollment, rebuilt, 'Enrollment is not the canonical sandbox-only proposal')
    for (const worker of workers) {
      const config = await readJSON(join(candidate, worker.config))
      for (const [name, value] of Object.entries(enrollment.environment)) assert.equal(config.vars[name], value)
    }
  } else {
    for (const worker of workers) assert.ok(!(await readJSON(join(candidate, worker.config))).vars.PORTFOLIO_AUTHORIZATION_POLICY,
      'A solo-pinned candidate needs its reviewed enrollment proposal')
  }
  const directory = await externalNewDirectory(output)
  const toolHashes = await Promise.all(tools.map(async file => ({ file, sha256: hash(await readFile(join(root, 'scripts', file))) })))
  const plan = { format: 1, account, scope, resources: sandboxResources, candidate, manifestSha256: expectedPin,
    migrations: details.migrations, baselineCandidate, baselinePin, workers, enrollment, toolHashes,
    warning: 'Historical baseline IDs are fail-closed expectations, not fresh live observations. Drift stops execution. No settlement or independent oversight is claimed.' }
  await save(join(directory, 'release-plan.json'), plan)
  const planPin = hash(await readFile(join(directory, 'release-plan.json')))
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  for (const stage of ['migration', 'enrollment', 'deployment']) {
    const command = `& ${quote(process.execPath)} ${quote(join(root, 'scripts/solo-sandbox-release.mjs'))} run ${quote(join(directory, 'release-plan.json'))} ${quote(planPin)} ${stage} --approved-${stage}`
    await writeFile(join(directory, `${stage}.ps1`), `param([switch]$Approved)\n$ErrorActionPreference='Stop'\nif (-not $Approved) { Write-Output ${quote('PLAN ONLY: ' + command)}; return }\n# This flag requires separate, explicit operator approval of THIS stage.\n${command}\nif ($LASTEXITCODE -ne 0) { throw 'Stage failed or outcome unresolved. Stop; do not retry blindly.' }\n`, { flag: 'wx' })
  }
  return { directory, planSha256: planPin, candidateSha256: expectedPin,
    stagesReady: enrollment ? ['migration', 'enrollment', 'deployment'] : ['migration'],
    blocked: enrollment ? [] : ['Owner public key/identity and public-pin successor candidate required before enrollment/deployment.'] }
}

export function validateDatabaseState(row, plan, stage, after = false) {
  const names = JSON.parse(row.migrations)
  const expected = stage === 'migration' && !after ? plan.migrations.slice(0, 13) : plan.migrations
  assert.ok(Array.isArray(names) && new Set(names).size === names.length)
  assert.deepEqual([...names].sort(), expected)
  for (const field of ['portfolios', 'allocations', 'origins', 'events', 'seals', 'epochs', 'jobs', 'finalizations', 'unsettled', 'protocol', 'cleanup', 'finalization']) {
    assert.equal(row[field], 0, `Unexpected sandbox state: ${field}`)
  }
  if (stage === 'migration' && !after) { assert.equal(row.revision, 0); return }
  const solo = stage === 'deployment' || (stage === 'enrollment' && after)
  assert.equal(row.policy, solo ? 'solo-operator-v1' : 'independent-v1')
  assert.equal(row.generation, solo ? 1 : 0)
  assert.equal(row.revision, solo ? 1 : 0)
  assert.equal(row.policies, solo ? 1 : 0)
  assert.equal(row.revocations, 0)
  if (solo) {
    const auth = plan.enrollment.authorization
    for (const [field, expectedValue] of Object.entries({ policy_id: auth.policyId, operator_id: auth.operatorId,
      operator_key_id: auth.operatorKeyId, storage_scope: scope, deployment_sha256: auth.deploymentSha256, enrolled_at: auth.enrolledAt })) {
      assert.equal(row[field], expectedValue)
    }
  }
}
const stateSQL = soloSchema => `SELECT
 (SELECT json_group_array(name) FROM (SELECT name FROM d1_migrations ORDER BY name)) migrations,
 (SELECT count(*) FROM portfolios) portfolios,(SELECT count(*) FROM portfolio_storage_allocations) allocations,
 (SELECT count(*) FROM portfolio_storage_origins) origins,(SELECT count(*) FROM portfolio_storage_allocation_events) events,
 (SELECT count(*) FROM portfolio_storage_birth_seals) seals,(SELECT count(*) FROM portfolio_storage_protocol_verifications) epochs,
 (SELECT count(*) FROM portfolio_deletion_jobs) jobs,(SELECT count(*) FROM portfolio_deletion_finalizations) finalizations,
 (SELECT count(*) FROM portfolio_storage_allocations WHERE writer_protocol_version<>1 OR writer_state IS NOT 'closed') unsettled,
 (SELECT minimum_protocol_version FROM portfolio_storage_writer_policy WHERE id=1) protocol,
 (SELECT revision FROM portfolio_deletion_runtime_policy WHERE id=1) revision,
 (SELECT cleanup_enabled FROM portfolio_deletion_runtime_policy WHERE id=1) cleanup,
 (SELECT finalization_enabled FROM portfolio_deletion_runtime_policy WHERE id=1) finalization
 ${soloSchema ? `,(SELECT policy FROM portfolio_storage_authorization_state WHERE id=1) policy,
 (SELECT generation FROM portfolio_storage_authorization_state WHERE id=1) generation,
 (SELECT policy_id FROM portfolio_storage_authorization_state WHERE id=1) policy_id,
 (SELECT count(*) FROM portfolio_storage_authorization_policies) policies,(SELECT count(*) FROM portfolio_storage_key_revocations) revocations,
 (SELECT operator_id FROM portfolio_storage_current_solo_policy) operator_id,
 (SELECT operator_key_id FROM portfolio_storage_current_solo_policy) operator_key_id,
 (SELECT storage_scope FROM portfolio_storage_current_solo_policy) storage_scope,
 (SELECT deployment_sha256 FROM portfolio_storage_current_solo_policy) deployment_sha256,
 (SELECT enrolled_at FROM portfolio_storage_current_solo_policy) enrolled_at` : ''};`

export async function deployBoth(plan, deploy, verify) {
  const confirmed = []
  assert.deepEqual(plan.workers.map(worker => worker.name), workers.map(worker => worker.name))
  for (const worker of plan.workers) {
    const version = await deploy(worker)
    assert.match(version, /^[0-9a-f-]{36}$/)
    const result = await verify(worker, version)
    assert.ok(result.Verified && result.Name === worker.name && result.Version === version)
    confirmed.push(result)
  }
  assert.equal(confirmed.length, 2)
  return confirmed
}

export async function saveStageCompletion(directory, stage, state) {
  assert.ok(['migration', 'enrollment', 'deployment'].includes(stage))
  // deployment-result.json already holds the two individually verified Worker
  // receipts. Keep it immutable; the final D1/control summary needs its own file.
  const filename = stage === 'deployment' ? 'deployment-completion.json' : `${stage}-result.json`
  await save(join(directory, filename), { stage, at: new Date().toISOString(), state,
    warning: 'No protocol, deletion or writer-settlement authorization is granted.' })
}

async function runStage(planFile, planPin, stage, approval) {
  assert.ok(['migration', 'enrollment', 'deployment'].includes(stage))
  assert.equal(approval, `--approved-${stage}`, 'Separate stage approval required')
  assert.match(planPin, /^[0-9a-f]{64}$/)
  assert.equal(hash(await readFile(planFile)), planPin)
  const plan = await readJSON(planFile)
  assert.equal(plan.account, account); assert.equal(plan.scope, scope); assert.deepEqual(plan.resources, sandboxResources)
  assert.deepEqual(plan.workers, workers); assert.equal(plan.baselineCandidate, baselineCandidate); assert.equal(plan.baselinePin, baselinePin)
  if (stage !== 'migration') assert.ok(plan.enrollment, 'Owner public-key proposal is missing')
  for (const tool of plan.toolHashes) assert.equal(hash(await readFile(join(root, 'scripts', tool.file))), tool.sha256, 'Reviewed tooling changed')
  const details = await candidateDetails(plan.candidate)
  assert.equal(details.verified.artifactSha256, plan.manifestSha256); assert.deepEqual(details.migrations, plan.migrations)
  assert.equal((await verifyStagingPackage(baselineCandidate)).artifactSha256, baselinePin)
  const config = join(plan.candidate, 'main.wrangler.jsonc'), credential = await sandboxReadCredential(config)
  const get = async path => {
    const response = await fetch('https://api.cloudflare.com/client/v4' + path, { method: 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${credential}` }, signal: AbortSignal.timeout(25000) })
    assert.ok(response.ok, `Identity GET failed (HTTP ${response.status}); stop, no retry`)
    const result = await response.json(); assert.equal(result.success, true); return result.result
  }
  const identity = async () => {
    assert.equal((await get(`/accounts/${account}`)).id, account)
    const db = await get(`/accounts/${account}/d1/database/${sandboxResources.databaseId}`)
    assert.equal(db.uuid, sandboxResources.databaseId); assert.equal(db.name, sandboxResources.databaseName)
    assert.equal((await get(`/accounts/${account}/r2/buckets/${sandboxResources.bucket}`)).name, sandboxResources.bucket)
  }
  const cli = async args => {
    const { stdout } = await executeFile(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--config', config],
      { windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account, WRANGLER_SEND_METRICS: 'false' } })
    return stdout
  }
  const readState = async schema => {
    const data = JSON.parse(await cli(['d1', 'execute', sandboxResources.databaseName, '--remote', '--json', '--command', stateSQL(schema)]))
    assert.ok(data.length === 1 && data[0].success && data[0].meta.rows_written === 0 && !data[0].meta.changed_db)
    assert.equal(data[0].results.length, 1); return data[0].results[0]
  }
  await identity()
  for (const worker of workers) await verifySandboxDeployment(baselineCandidate, worker.name, worker.baselineVersion)
  validateDatabaseState(await readState(stage !== 'migration'), plan, stage)
  // Every approved write is preceded by exact resource and state checks above.
  // Failed/ambiguous responses stop without automatic retry or rollback.
  if (stage === 'migration') {
    await identity()
    await cli(['d1', 'migrations', 'apply', sandboxResources.databaseName, '--remote'])
  } else if (stage === 'enrollment') {
    await identity()
    const response = JSON.parse(await cli(['d1', 'execute', sandboxResources.databaseName, '--remote', '--json', '--command', plan.enrollment.enrollmentSQL]))
    assert.ok(response.length > 0 && response.every(item => item.success))
  } else {
    const result = await deployBoth(plan, async worker => {
      await identity()
      validateDatabaseState(await readState(true), plan, stage)
      await verifySandboxDeployment(baselineCandidate, worker.name, worker.baselineVersion)
      assert.equal((await verifyStagingPackage(plan.candidate)).artifactSha256, plan.manifestSha256)
      const { stdout } = await executeFile(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy',
        '--no-bundle', '--no-autoconfig', '--strict', '--config', join(plan.candidate, worker.config)],
      { windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account, WRANGLER_SEND_METRICS: 'false' } })
      const matches = [...stdout.matchAll(/Current Version ID:\s*([0-9a-f-]{36})/g)]
      assert.equal(matches.length, 1, 'Uploaded version is unresolved'); return matches[0][1]
    }, async (worker, version) => {
      const verified = await verifySandboxDeployment(plan.candidate, worker.name, version, plan.manifestSha256)
      // Persist each confirmed Worker before starting the next. A partial result
      // is evidence for recovery, never permission to retry/rebase automatically.
      await save(join(dirname(planFile), `deployment-${worker.name}-result.json`), verified)
      return verified
    })
    await save(join(dirname(planFile), 'deployment-result.json'), result)
  }
  const state = await readState(true)
  validateDatabaseState(state, plan, stage, true)
  await saveStageCompletion(dirname(planFile), stage, state)
  return { completed: stage, protocol: 0, cleanup: false, finalization: false }
}
async function main(args) {
  if (args[0] === 'seal') return sealCandidate(args[1], args[2])
  if (args[0] === 'owner') return prepareOwnerCandidate(await readJSON(args[1]))
  if (args[0] === 'plan') return prepareReleasePlan(await readJSON(args[1]))
  if (args[0] === 'run') return runStage(...args.slice(1))
  throw new Error('Local: seal SOURCE NEW_OUTSIDE_DIRECTORY | owner PUBLIC_INPUTS_JSON | plan INPUTS_JSON. Remote: run PLAN PLAN_SHA256 migration|enrollment|deployment --approved-STAGE (separate explicit approval required).')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(result => console.log(jsonBytes(result))).catch(error => {
    // Never print native subprocess errors or authentication handoff contents.
    console.error(error.code === 'EEXIST' ? 'Local evidence destination already exists. Remote steps may have completed; preserve receipts and perform read-only reconciliation. Do not retry or overwrite evidence.' :
      error instanceof assert.AssertionError ? `Sandbox preparation/stage refused: ${error.message}` :
      'Sandbox preparation/stage stopped. Outcome may be unresolved; inspect retained state without retrying or exposing credentials.')
    process.exitCode = 1
  })
}
