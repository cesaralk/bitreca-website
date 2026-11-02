// Default is OFFLINE PLAN. This module never reads private key material.
import assert from 'node:assert/strict'
import { readFile, open, realpath } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve, relative, isAbsolute, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { recoveryTarget, generation2Key, prepareRecoverySQL } from './generation3-recovery.mjs'
import { publicKeyPin } from './portfolio-evidence.mjs'
import { sandboxReadCredential, verifySandboxDeployment } from './verify-sandbox-deployment.mjs'
import { normalizeSchemaLineEndings } from './portfolio-schema-identity.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scope = `portfolioforest/staging/${recoveryTarget.bucket}/${recoveryTarget.databaseId}`
const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
export const generation3Public = '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEjK1/qWfJ8rrrJb5Gkw2AHDHrebjEDvs818xaORTykhwdD9Ogx6fvW2XKarDGcG4C3DTO0rZEiJL4AwTeawQfUg==\n-----END PUBLIC KEY-----\n'
export const generation3Fingerprint = '7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e'
const deployment = '97dee6f267be82e94ff094a96f39528eaa68e9afa6446284a01c71f36bfbb6d4'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => JSON.stringify(value)
let checkpoint = 'offline validation'
async function saveExclusive(path, bytes) {
  const file = await open(path, 'wx')
  try { await file.writeFile(bytes); await file.sync() } finally { await file.close() }
}
const policy1 = { id: 'b156f918-7352-481e-8812-224b53dbe6a5', generation: 1, policy: 'solo-operator-v1', operator_id: 'bitreca-owner', operator_key_id: '3fb65d834cb5138bd49adeb5ee866268216183df7a0964eda5fe088a25c3d373', storage_scope: scope, deployment_sha256: deployment, enrolled_at: 1793137853 }
const policy2 = { ...policy1, id: 'fb0f169e-73c0-4d42-b232-dab26efece45', generation: 2, operator_key_id: generation2Key, enrolled_at: 1793147875 }
// Full rows, schema and histories are compared inside the transaction, not just counts.
const object = (table, fields, order) => `(SELECT json_group_array(json(row)) FROM (SELECT json_object(${fields.split(',').map(f => `'${f}',${f}`).join(',')}) AS row FROM ${table} ORDER BY ${order}))`
export const stateExpression = `json_object(
 'state',json(${object('portfolio_storage_authorization_state', 'id,policy,generation,policy_id', 'id')}),
 'runtime',json(${object('portfolio_deletion_runtime_policy', 'id,revision,environment,storage_scope,bucket_name,database_id,signer_sha256,cleanup_enabled,finalization_enabled', 'id')}),
 'policies',json(${object('portfolio_storage_authorization_policies', 'id,generation,policy,operator_id,operator_key_id,storage_scope,deployment_sha256,enrolled_at', 'generation')}),
 'revocations',json(${object('portfolio_storage_key_revocations', 'operator_key_id,revoked_at', 'operator_key_id')}),
 'protocol',(SELECT minimum_protocol_version FROM portfolio_storage_writer_policy WHERE id=1),
 'portfolios',(SELECT count(*) FROM portfolios),'allocations',(SELECT count(*) FROM portfolio_storage_allocations),
 'jobs',(SELECT count(*) FROM portfolio_deletion_jobs),'epochs',(SELECT count(*) FROM portfolio_storage_protocol_verifications),
 'schema',json(${object('sqlite_schema', 'type,name,tbl_name,sql', 'type,name')}))`
export const readStateSQL = `SELECT ${stateExpression} AS snapshot`
const assertion = expected => ({ sql: `SELECT CASE WHEN ${stateExpression}=? THEN 1 ELSE json('RECOVERY_PRECONDITION_FAILED') END AS verified`, params: [json(expected)] })

export function buildAtomicTransition(before, stage, inputs) {
  assert.ok(['activate2', 'enroll3', 'activate3'].includes(stage))
  const generation = stage === 'activate2' ? 1 : 2
  assert.deepEqual(before.state, [{ id: 1, policy: 'solo-operator-v1', generation, policy_id: generation === 1 ? policy1.id : policy2.id }])
  assert.deepEqual(before.policies.slice(0, 2), [policy1, policy2], 'Immutable enrollment differs')
  assert.equal(before.policies.length, stage === 'activate3' ? 3 : 2)
  assert.deepEqual(before.revocations, [])
  assert.equal(before.runtime.length, 1)
  const runtime = before.runtime[0]
  assert.equal(runtime.id, 1); assert.equal(runtime.revision, generation)
  assert.equal(runtime.cleanup_enabled, 0); assert.equal(runtime.finalization_enabled, 0)
  for (const [field, value] of Object.entries({ environment: 'staging', storage_scope: scope, database_id: recoveryTarget.databaseId, bucket_name: recoveryTarget.bucket })) {
    assert.ok(runtime[field] === null || runtime[field] === value, `Runtime identity differs: ${field}`)
  }
  if (runtime.signer_sha256 !== null) assert.ok([policy1.operator_key_id, generation2Key, generation3Fingerprint].includes(runtime.signer_sha256))
  assert.equal(before.protocol, 1)
  for (const key of ['portfolios', 'allocations', 'jobs', 'epochs']) assert.equal(before[key], 0)
  assert.ok(Array.isArray(before.schema) && before.schema.some(row => row.name === 'portfolio_authorization_state_advance'))
  const snapshot = { target: recoveryTarget, generation, revision: generation, protocol: 1, cleanup: false, finalization: false,
    deletion: false, import: false, schedules: false, publicAccess: false, frozen: true, portfolios: 0, allocations: 0,
    jobs: 0, epochs: 0, unsettledWriters: 0, generation2Key, revoked: false, historyIntact: true, existingOutputs: false,
    generation2PolicyId: policy2.id, reviewedGeneration3Fingerprint: generation3Fingerprint }
  if (stage !== 'activate2') assert.equal(publicKeyPin(inputs.publicKey).signer_sha256, generation3Fingerprint)
  const prepared = prepareRecoverySQL(snapshot, stage, inputs)
  const after = structuredClone(before)
  let mutation
  if (stage === 'enroll3') {
    const a = prepared.enrollment.authorization
    const row = { id: a.policyId, generation: 3, policy: a.authorizationPolicy, operator_id: a.operatorId, operator_key_id: a.operatorKeyId, storage_scope: a.storageScope, deployment_sha256: a.deploymentSha256, enrolled_at: a.enrolledAt }
    assert.equal(row.deployment_sha256, deployment)
    after.policies.push(row)
    mutation = { sql: `INSERT INTO portfolio_storage_authorization_policies(id,generation,policy,operator_id,operator_key_id,storage_scope,deployment_sha256,enrolled_at) VALUES(?,?,?,?,?,?,?,?)`, params: Object.values(row).map(String) }
  } else {
    const target = stage === 'activate2' ? policy2 : before.policies[2]
    if (stage === 'activate3') {
      const a = prepared.enrollment.authorization
      assert.deepEqual(target, { id: a.policyId, generation: 3, policy: a.authorizationPolicy, operator_id: a.operatorId, operator_key_id: a.operatorKeyId, storage_scope: a.storageScope, deployment_sha256: a.deploymentSha256, enrolled_at: a.enrolledAt })
    }
    after.state[0].generation++; after.state[0].policy_id = target.id
    after.runtime[0].revision++
    mutation = { sql: 'UPDATE portfolio_storage_authorization_state SET generation=?,policy_id=? WHERE id=1', params: [String(target.generation), target.id] }
  }
  return { before, after, batch: [assertion(before), mutation, assertion(after)] }
}

export async function executeTransition({ approvedStage, stage, transition, transport, verifyControls, save, backupVerified = false }) {
  assert.equal(approvedStage, stage, 'Separate exact-stage approval required')
  if (stage === 'enroll3') assert.equal(backupVerified, true, 'Verified offline backup required')
  await verifyControls()
  assert.deepEqual(await transport.read(), transition.before, 'Fresh state differs; no write attempted')
  await save('intent', { stage, transition }) // Durable exclusive intent BEFORE any write.
  try {
    const result = await transport.batch(transition.batch)
    assert.ok(result.length === 3 && result.every(row => row.success === true), 'Atomic batch failed')
    assert.equal(result[0].results?.[0]?.verified, 1)
    assert.equal(result[2].results?.[0]?.verified, 1)
    assert.deepEqual(await transport.read(), transition.after)
    await verifyControls()
    await save('completed', { stage, state: transition.after })
    return { completed: stage }
  } catch {
    await save('unresolved', { stage, message: 'Stop; read-only reconciliation required. No automatic retry or rollback.' })
    throw new Error('Outcome unresolved; inspect intent and reconcile read-only. Never retry blindly.')
  }
}

async function outsideFile(path) {
  assert.ok(path.endsWith('.json') && !resolve(path).toLowerCase().includes('bitrecaownerkeys'), 'Only external public JSON evidence paths allowed')
  const parent = await realpath(dirname(resolve(path)))
  const child = relative(await realpath(root), join(parent, resolve(path).slice(dirname(resolve(path)).length + 1)))
  assert.ok(isAbsolute(child) || child === '..' || child.startsWith('..\\') || child.startsWith('../'), 'Evidence must stay outside repository')
}
async function verifySchema(before) {
  // Local, in-memory comparison only; never applies migrations remotely.
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(':memory:')
  try {
    const manifest = JSON.parse(await readFile(join(review, 'solo-owner-pinned-20261027/candidate/deployment-artifact.json'), 'utf8'))
    for (const file of manifest.files.filter(row => row.path.startsWith('migrations/')).sort((a, b) => a.path.localeCompare(b.path))) {
      const bytes = await readFile(join(review, 'solo-owner-pinned-20261027/candidate', file.path), 'utf8')
      assert.equal(hash(bytes), file.sha256)
      db.exec(bytes)
    }
    const expected = JSON.parse(db.prepare(readStateSQL.replace(stateExpression, object('sqlite_schema', 'type,name,tbl_name,sql', 'type,name'))).get().snapshot)
    for (const row of expected) {
      const actual = before.schema.find(actual => actual.name === row.name)
      assert.ok(actual, 'Required schema object missing')
      assert.deepEqual({ ...actual, sql: normalizeSchemaLineEndings(actual.sql) }, { ...row, sql: normalizeSchemaLineEndings(row.sql) }, 'Required immutable schema differs')
    }
    for (const row of before.schema) if (!expected.some(item => item.name === row.name)) {
      assert.ok(row.name === 'd1_migrations' || row.tbl_name === 'd1_migrations' || row.name.startsWith('_cf_') || row.name.startsWith('sqlite_'), 'Unexpected schema change')
    }
  } finally { db.close() }
}
export async function runRecoveryCLI(args) {
  const options = {}
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(['--stage', '--preflight', '--execute', '--sha256', '--approved-stage', '--backup-receipt'].includes(args[i]) && args[i + 1] && !options[args[i]], 'Unknown/duplicate option')
    options[args[i]] = args[i + 1]
  }
  const stage = options['--stage'] || 'activate2'
  assert.ok(['activate2', 'enroll3', 'activate3'].includes(stage))
  assert.equal(publicKeyPin(generation3Public).signer_sha256, generation3Fingerprint)
  if (!options['--preflight'] && !options['--execute']) return { planOnly: true, stage, target: recoveryTarget, generation3Fingerprint, next: 'Separate read-only preflight approval creates an external pinned plan; each execution needs its own exact-stage approval and plan digest.' }
  assert.ok(!(options['--preflight'] && options['--execute']))
  const path = resolve(options['--execute'] || options['--preflight'])
  await outsideFile(path)
  let plan
  if (options['--execute']) {
    assert.equal(options['--approved-stage'], stage)
    const bytes = await readFile(path)
    assert.equal(hash(bytes), options['--sha256'], 'Reviewed plan digest differs')
    plan = JSON.parse(bytes)
    assert.equal(plan.stage, stage); assert.deepEqual(plan.target, recoveryTarget)
    assert.ok(Date.now() - plan.createdAt >= 0 && Date.now() - plan.createdAt < 30 * 60 * 1000, 'Plan expired; perform fresh read-only preflight')
  }
  const candidate = join(review, 'solo-owner-pinned-20261027/candidate')
  const credential = await sandboxReadCredential(join(candidate, 'main.wrangler.jsonc'))
  checkpoint = 'authenticated identity/configuration checks'
  const accountPath = `/accounts/${recoveryTarget.account}`
  const request = async (path, body) => {
    const response = await fetch('https://api.cloudflare.com/client/v4' + path, { method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, ...(body ? { body: json(body) } : {}), signal: AbortSignal.timeout(30000) })
    assert.ok(response.ok, `Cloudflare HTTP ${response.status}; stop without retry`)
    const data = await response.json(); assert.equal(data.success, true, 'Cloudflare operation failed'); return data.result
  }
  const query = body => request(`${accountPath}/d1/database/${recoveryTarget.databaseId}/query`, body)
  const transport = { read: async () => {
    const result = await query({ sql: readStateSQL })
    assert.ok(result.length === 1 && result[0].success && result[0].meta.rows_written === 0)
    assert.equal(result[0].results.length, 1)
    return JSON.parse(result[0].results[0].snapshot)
  }, batch: async batch => query({ batch }) }
  const verifyControls = async () => {
    assert.equal((await request(accountPath)).id, recoveryTarget.account)
    const db = await request(`${accountPath}/d1/database/${recoveryTarget.databaseId}`)
    assert.equal(db.uuid, recoveryTarget.databaseId); assert.equal(db.name, recoveryTarget.database)
    assert.equal((await request(`${accountPath}/r2/buckets/${recoveryTarget.bucket}`)).name, recoveryTarget.bucket)
    for (const [worker, version] of [['bitreca-main-delete-sandbox-20261025', 'b8cec2ff-37df-4235-ae6e-858a63e9a8d3'], ['bitreca-hosting-delete-sandbox-20261025', '116ccbb3-97f0-40de-a55b-54994f782d9a']]) {
      await verifySandboxDeployment(candidate, worker, version, '6ac0303aca92f5adf28e5512195d81ecffd5526759a3828cc26726e1af55520a')
    }
  }
  if (!options['--execute']) {
    await verifyControls()
    checkpoint = 'read-only database snapshot'
    const before = await transport.read()
    checkpoint = 'local immutable schema comparison'
    await verifySchema(before)
    checkpoint = 'local generation/enrollment comparison'
    let inputs = null
    if (stage !== 'activate2') {
      const code = await readFile(join(candidate, 'code-artifacts.json'), 'utf8')
      assert.equal(hash(code), deployment)
      const enrolled = stage === 'activate3' ? before.policies.find(row => row.generation === 3) : null
      if (stage === 'activate3') assert.ok(enrolled, 'Generation 3 is not enrolled')
      inputs = { publicKey: generation3Public, scope, deployment: code, policyId: enrolled?.id || randomUUID(), generation: 3,
        operatorId: 'bitreca-owner', enrolledAt: enrolled?.enrolled_at || Math.floor(Date.now() / 1000) }
    }
    const transition = buildAtomicTransition(before, stage, inputs)
    const value = { format: 1, stage, target: recoveryTarget, createdAt: Date.now(), inputs, transition }
    const bytes = JSON.stringify(value, null, 2) + '\n'
    await saveExclusive(path, bytes)
    return { planOnly: true, readOnlyPreflight: true, path, sha256: hash(bytes) }
  }
  const transition = buildAtomicTransition(plan.transition.before, stage, plan.inputs)
  await verifySchema(transition.before)
  assert.deepEqual(transition, plan.transition, 'Plan is not reproducible')
  let backupVerified = false
  if (stage === 'enroll3') {
    assert.ok(options['--backup-receipt'], 'Public owner confirmation of tested offline backup required')
    await outsideFile(options['--backup-receipt'])
    const receipt = JSON.parse(await readFile(options['--backup-receipt'], 'utf8'))
    assert.equal(receipt.operator, 'bitreca-owner'); assert.equal(receipt.fingerprint, generation3Fingerprint)
    assert.equal(receipt.encryptedOfflineBackupVerified, true); assert.equal(receipt.passphraseRecoveryTested, true)
    assert.ok(Number.isSafeInteger(receipt.verifiedAt) && receipt.verifiedAt > 0 && receipt.verifiedAt <= Math.floor(Date.now() / 1000))
    backupVerified = true // Explicit human assertion, not tool-certified backup verification.
  }
  const save = (suffix, value) => saveExclusive(path + '.' + suffix + '.json', JSON.stringify(value, null, 2) + '\n')
  return executeTransition({ approvedStage: options['--approved-stage'], stage, transition, transport, verifyControls, save, backupVerified })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRecoveryCLI(process.argv.slice(2)).then(value => console.log(JSON.stringify(value, null, 2))).catch(error => {
    // Never print authentication subprocess output, request objects or credentials.
    const publicFailure = checkpoint.startsWith('local ') ? String(error.message).split('\n')[0].slice(0, 160) : 'See retained public state; credential diagnostics suppressed.'
    console.error(`Recovery stopped at ${checkpoint}: ${publicFailure}. No automatic retry.`); process.exitCode = 1
  })
}
