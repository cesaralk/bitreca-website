// Public-only successor preparation. Cloudflare GET/SELECT preflight is explicit;
// deploying both exact sandbox Workers requires its own plan digest and approval.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, realpath, open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import process from 'node:process'
import { prepareOwnerCandidate, deployBoth } from './solo-sandbox-release.mjs'
import { verifyStagingPackage } from './prepare-portfolio-staging.mjs'
import { sandboxReadCredential, verifySandboxDeployment } from './verify-sandbox-deployment.mjs'
import { generation3Public, generation3Fingerprint, readStateSQL } from './execute-generation3-recovery.mjs'
import { recoveryTarget } from './generation3-recovery.mjs'
import { publicKeyPin } from './portfolio-evidence.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
export const generation3Release = join(review, 'solo-generation3-pinned-20261029')
const source = join(review, 'solo-owner-pinned-20261027/candidate')
const sourcePin = '6ac0303aca92f5adf28e5512195d81ecffd5526759a3828cc26726e1af55520a'
const scope = `portfolioforest/staging/${recoveryTarget.bucket}/${recoveryTarget.databaseId}`
const activation = join(review, 'generation3-activate3-plan.json.completed.json')
const codePin = '97dee6f267be82e94ff094a96f39528eaa68e9afa6446284a01c71f36bfbb6d4'
const workers = [
  { name: 'bitreca-main-delete-sandbox-20261025', config: 'main.wrangler.jsonc', version: 'b8cec2ff-37df-4235-ae6e-858a63e9a8d3' },
  { name: 'bitreca-hosting-delete-sandbox-20261025', config: 'hosting.wrangler.jsonc', version: '116ccbb3-97f0-40de-a55b-54994f782d9a' },
]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'))
async function save(path, value) {
  const file = await open(path, 'wx')
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync() } finally { await file.close() }
}
export function authorizationFromActivation(receipt) {
  assert.equal(receipt.stage, 'activate3')
  const state = receipt.state
  assert.equal(state.state.length, 1); assert.equal(state.state[0].generation, 3)
  assert.equal(state.state[0].policy, 'solo-operator-v1')
  assert.equal(state.runtime.length, 1); assert.equal(state.runtime[0].revision, 3)
  assert.equal(state.runtime[0].cleanup_enabled, 0); assert.equal(state.runtime[0].finalization_enabled, 0)
  assert.equal(state.protocol, 1)
  for (const key of ['portfolios', 'allocations', 'epochs', 'jobs']) assert.equal(state[key], 0)
  assert.deepEqual(state.revocations, [])
  assert.equal(state.policies.length, 3)
  const policy = state.policies.find(row => row.id === state.state[0].policy_id)
  assert.equal(policy.generation, 3); assert.equal(policy.operator_id, 'bitreca-owner')
  assert.equal(policy.policy, 'solo-operator-v1')
  assert.equal(policy.operator_key_id, generation3Fingerprint)
  assert.equal(policy.storage_scope, scope); assert.equal(policy.deployment_sha256, codePin)
  return { authorizationPolicy: policy.policy, policyId: policy.id, policyGeneration: 3,
    operatorId: policy.operator_id, operatorKeyId: policy.operator_key_id, storageScope: scope,
    deploymentSha256: codePin, enrolledAt: policy.enrolled_at }
}
export function verifyPublicConfigDelta(before, after, auth) {
  const pinNames = ['PORTFOLIO_AUTHORIZATION_POLICY', 'PORTFOLIO_AUTHORIZATION_POLICY_ID', 'PORTFOLIO_AUTHORIZATION_GENERATION',
    'PORTFOLIO_OPERATOR_ID', 'PORTFOLIO_OPERATOR_KEY_ID', 'PORTFOLIO_DEPLOYMENT_SHA256', 'PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI']
  const trim = config => ({ ...config, vars: Object.fromEntries(Object.entries(config.vars).filter(([name]) => !pinNames.includes(name))) })
  assert.deepEqual(trim(after), trim(before), 'Only reviewed public authorization pins may change')
  assert.equal(after.vars.PORTFOLIO_AUTHORIZATION_POLICY, auth.authorizationPolicy)
  assert.equal(after.vars.PORTFOLIO_AUTHORIZATION_POLICY_ID, auth.policyId)
  assert.equal(after.vars.PORTFOLIO_AUTHORIZATION_GENERATION, '3')
  assert.equal(after.vars.PORTFOLIO_OPERATOR_ID, auth.operatorId)
  assert.equal(after.vars.PORTFOLIO_OPERATOR_KEY_ID, generation3Fingerprint)
  assert.equal(after.vars.PORTFOLIO_DEPLOYMENT_SHA256, codePin)
  assert.equal(after.vars.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI, publicKeyPin(generation3Public).public_key_spki_base64)
}
async function verifyLocal() {
  const receipt = await readJSON(activation), authorization = authorizationFromActivation(receipt)
  assert.equal((await verifyStagingPackage(source)).artifactSha256, sourcePin)
  const candidate = join(generation3Release, 'candidate'), checked = await verifyStagingPackage(candidate)
  const manifest = await readJSON(join(source, 'deployment-artifact.json'))
  for (const entry of manifest.files) {
    if (workers.some(worker => worker.config === entry.path)) continue
    assert.equal(hash(await readFile(join(candidate, entry.path))), entry.sha256, 'Reviewed code/client/migrations must remain byte-identical')
  }
  assert.deepEqual(await readJSON(join(generation3Release, 'owner-authorization.json')), authorization)
  for (const worker of workers) verifyPublicConfigDelta(await readJSON(join(source, worker.config)), await readJSON(join(candidate, worker.config)), authorization)
  return { candidate, authorization, checked, state: receipt.state }
}
async function prepare() {
  const receipt = await readJSON(activation), existingAuthorization = authorizationFromActivation(receipt)
  assert.equal((await verifyStagingPackage(source)).artifactSha256, sourcePin)
  // Source is preserved; an existing destination is a hard stop.
  const publicFile = join(review, 'generation3-deployment-public.pem')
  try { assert.equal(await readFile(publicFile, 'utf8'), generation3Public) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeFile(publicFile, generation3Public, { flag: 'wx' })
  }
  const result = await prepareOwnerCandidate({ source, output: generation3Release, publicKey: publicFile,
    operatorId: existingAuthorization.operatorId, policyId: existingAuthorization.policyId,
    enrolledAt: existingAuthorization.enrolledAt, generation: 3, existingAuthorization })
  await mkdir(join(generation3Release, 'evidence'))
  const verified = await verifyLocal()
  await save(join(generation3Release, 'preparation-result.json'), { candidate: result.candidate, candidateSha256: result.artifactSha256,
    authorization: existingAuthorization, sourcePin, unchangedCodeManifest: codePin, noNewEnrollment: true,
    controls: 'Frozen/private; requests, cleanup, finalization, import, schedules disabled', verifiedAt: Math.floor(Date.now() / 1000) })
  await save(join(generation3Release, 'restricted-import-plan.json'), { readyForExecution: false,
    target: recoveryTarget, candidateSha256: result.artifactSha256, operatorOnlyAccess: 'Not yet configured/approved',
    requiredAccess: 'One owner-authenticated Access hostname or an equivalently verified private transport to THIS sandbox main Worker; deny everyone else before opening import',
    endpoint: '/api/admin/portfolio-protocol-evidence', method: 'POST', authentication: 'Existing admin session and exact same-Origin checks, plus restricted operator access',
    controlsToOpenMainOnly: { PORTFOLIO_EVIDENCE_IMPORT_ENABLED: 'true', PORTFOLIO_STAGING_MUTATIONS_FROZEN: 'false' },
    controlsToRestoreMain: { PORTFOLIO_EVIDENCE_IMPORT_ENABLED: 'false', PORTFOLIO_STAGING_MUTATIONS_FROZEN: 'true' },
    alwaysDisabled: ['DELETE_REQUESTS', 'CLEANUP', 'FINALIZATION', 'SCHEDULE'],
    sequence: 'Verify closed -> restrict access -> open -> verify -> POST ONCE -> finally restore -> verify closed -> verify exact epoch',
    ambiguousResponse: 'Restore closed controls, reconcile read-only; no automatic import replay, no direct SQL bypass',
    warning: 'A proposal only. Each access/control change/import needs explicit target approval. Owner identity/access transport must be verified first.' })
  return { completed: 'public-only-preparation', candidate: verified.candidate, candidateSha256: result.artifactSha256, authorization: existingAuthorization }
}
const toolFiles = ['generation3-sandbox-release.mjs', 'solo-sandbox-release.mjs', 'verify-sandbox-deployment.mjs',
  'prepare-portfolio-staging.mjs', 'check-portfolio-config.mjs', 'portfolio-evidence.mjs', 'execute-generation3-recovery.mjs', 'generation3-recovery.mjs', 'portfolio-schema-identity.mjs']
const toolHashes = () => Promise.all(toolFiles.map(async path => ({ path, sha256: hash(await readFile(join(root, 'scripts', path))) })))
async function externalJSON(path) {
  assert.ok(path.endsWith('.json'))
  const parent = await realpath(dirname(resolve(path))), child = relative(await realpath(root), join(parent, resolve(path).slice(dirname(resolve(path)).length + 1)))
  assert.ok(isAbsolute(child) || child === '..' || child.startsWith('..\\') || child.startsWith('../'), 'Plan must stay outside Git')
}
async function connection(candidate) {
  const credential = await sandboxReadCredential(join(candidate, 'main.wrangler.jsonc'))
  const base = `/accounts/${recoveryTarget.account}`
  const request = async (path, sql) => {
    assert.ok(!sql || sql.startsWith('SELECT '), 'Only SELECT permitted')
    const response = await fetch('https://api.cloudflare.com/client/v4' + path, { method: sql ? 'POST' : 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, ...(sql ? { body: JSON.stringify({ sql }) } : {}), signal: AbortSignal.timeout(30000) })
    assert.ok(response.ok, `Read-only HTTP ${response.status}; no retry`)
    const data = await response.json(); assert.equal(data.success, true); return data.result
  }
  return {
    identity: async () => {
      assert.equal((await request(base)).id, recoveryTarget.account)
      const db = await request(`${base}/d1/database/${recoveryTarget.databaseId}`)
      assert.equal(db.uuid, recoveryTarget.databaseId); assert.equal(db.name, recoveryTarget.database)
      assert.equal((await request(`${base}/r2/buckets/${recoveryTarget.bucket}`)).name, recoveryTarget.bucket)
    },
    state: async () => {
      const result = await request(`${base}/d1/database/${recoveryTarget.databaseId}/query`, readStateSQL + ', (SELECT json_group_array(name) FROM (SELECT name FROM d1_migrations ORDER BY name)) AS migrations')
      assert.ok(result.length === 1 && result[0].success && result[0].meta.rows_written === 0 && result[0].results.length === 1)
      const row = result[0].results[0], migrations = JSON.parse(row.migrations)
      const expected = (await readJSON(join(candidate, 'deployment-artifact.json'))).files.filter(row => row.path.startsWith('migrations/')).map(row => row.path.slice(11)).sort()
      assert.equal(new Set(migrations).size, migrations.length); assert.deepEqual(migrations, expected)
      return JSON.parse(row.snapshot)
    },
  }
}
async function preflight(path) {
  await externalJSON(path)
  const local = await verifyLocal(), remote = await connection(local.candidate)
  await remote.identity()
  assert.deepEqual(await remote.state(), local.state, 'D1 changed since the retained activation receipt')
  const checks = []
  for (const worker of workers) checks.push(await verifySandboxDeployment(source, worker.name, worker.version, sourcePin))
  assert.deepEqual(await remote.state(), local.state)
  const plan = { format: 1, createdAt: Date.now(), target: recoveryTarget, candidate: local.candidate,
    candidateSha256: local.checked.artifactSha256, authorization: local.authorization, expectedState: local.state,
    workers, baselineChecks: checks, toolHashes: await toolHashes() }
  await save(path, plan)
  const result = { preflight: 'PASS', plan: path, planSha256: hash(await readFile(path)), candidateSha256: local.checked.artifactSha256, freshForMinutes: 30 }
  const firstPlan = join(generation3Release, 'deployment-plan.json')
  try {
    const retained = await readJSON(firstPlan)
    assert.equal(retained.candidateSha256, plan.candidateSha256, 'Retained candidate plan differs')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await save(firstPlan, { ...result, ...plan })
  }
  return result
}
export async function guardedGeneration3Deployment({ approved, plan, verifyBefore, deploy, verify, retain }) {
  assert.equal(approved, true, 'Separate frozen-deployment approval required')
  assert.deepEqual(plan.workers.map(row => row.name), workers.map(row => row.name))
  await verifyBefore()
  await retain('deployment-intent', { target: plan.target, candidateSha256: plan.candidateSha256, workers: plan.workers })
  const confirmed = []
  try {
    const results = await deployBoth(plan, async worker => {
      await verifyBefore(confirmed)
      await retain(`intent-${worker.name}`, { worker: worker.name, oldVersion: worker.version })
      const version = await deploy(worker)
      await retain(`uploaded-${worker.name}`, { worker: worker.name, version })
      return version
    }, async (worker, version) => {
      const result = await verify(worker, version)
      assert.ok(result.Verified === true && result.Name === worker.name && result.Version === version, 'Individual Worker verification differs')
      await retain(`verified-${worker.name}`, result); confirmed.push(result)
      return result
    })
    await verifyBefore(confirmed)
    return results
  } catch {
    await retain('deployment-unresolved', { confirmed, warning: 'Stop; read-only reconciliation, no retry/rollback. Both Workers may not have updated.' })
    throw new Error('Deployment unresolved; inspect retained receipts without retrying')
  }
}
async function run(planFile, pin, approval) {
  assert.equal(approval, '--approved-deployment')
  assert.equal(hash(await readFile(planFile)), pin)
  const plan = await readJSON(planFile), local = await verifyLocal()
  assert.deepEqual(plan.target, recoveryTarget); assert.deepEqual(plan.workers, workers)
  assert.equal(resolve(plan.candidate), resolve(local.candidate)); assert.equal(plan.candidateSha256, local.checked.artifactSha256)
  assert.deepEqual(plan.authorization, local.authorization); assert.deepEqual(plan.expectedState, local.state)
  assert.deepEqual(plan.toolHashes, await toolHashes(), 'Reviewed deployment tooling changed')
  assert.ok(Date.now() >= plan.createdAt && Date.now() - plan.createdAt < 30 * 60 * 1000, 'Preflight expired; new read-only plan required')
  const remote = await connection(local.candidate)
  const verifyBefore = async (confirmed = []) => {
    await remote.identity(); assert.deepEqual(await remote.state(), plan.expectedState)
    assert.equal((await verifyStagingPackage(plan.candidate)).artifactSha256, plan.candidateSha256)
    for (const worker of workers) {
      const updated = confirmed.find(row => row.Name === worker.name)
      await verifySandboxDeployment(updated ? plan.candidate : source, worker.name, updated?.Version || worker.version, updated ? plan.candidateSha256 : sourcePin)
    }
  }
  const confirmed = await guardedGeneration3Deployment({ approved: true, plan, verifyBefore,
    retain: (name, value) => save(join(generation3Release, name + '.json'), value),
    deploy: async worker => {
      const { stdout } = await promisify(execFile)(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy',
        '--no-bundle', '--no-autoconfig', '--strict', '--config', join(plan.candidate, worker.config)], {
        windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: recoveryTarget.account, WRANGLER_SEND_METRICS: 'false' } })
      const matches = [...stdout.matchAll(/Current Version ID:\s*([0-9a-f-]{36})/g)]
      assert.equal(matches.length, 1, 'Uploaded version unknown; stop for reconciliation')
      return matches[0][1]
    }, verify: (worker, version) => verifySandboxDeployment(plan.candidate, worker.name, version, plan.candidateSha256) })
  const state = await remote.state(); assert.deepEqual(state, plan.expectedState)
  await save(join(generation3Release, 'deployment-completion.json'), { verifiedAt: Math.floor(Date.now() / 1000), workers: confirmed, state })
  return { completed: 'generation3-frozen-deployment', workers: confirmed, protocol: 1, generation: 3, revision: 3, cleanup: false, finalization: false }
}
async function main(args) {
  if (args[0] === 'prepare' && args.length === 1) return prepare()
  if (args[0] === 'preflight' && args.length === 2) return preflight(args[1])
  if (args[0] === 'run' && args.length === 4) return run(...args.slice(1))
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === 'plan'), 'Use prepare | plan | preflight NEW_EXTERNAL_JSON | run PLAN SHA256 --approved-deployment')
  const local = await verifyLocal()
  return { planOnly: true, candidate: local.candidate, candidateSha256: local.checked.artifactSha256, authorization: local.authorization, privateMaterialAccessed: false, network: false }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(value => console.log(JSON.stringify(value, null, 2))).catch(error => {
    console.error(error instanceof assert.AssertionError ? `Generation3 release refused: ${error.message}` : 'Generation3 release stopped. Preserve files/receipts; no retry or rollback. Credential diagnostics suppressed.'); process.exitCode = 1
  })
}
