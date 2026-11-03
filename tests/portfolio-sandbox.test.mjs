import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateSandboxPair, sandboxResources } from '../scripts/check-portfolio-config.mjs'
import { checkSandbox, sandboxScope, validateSandboxSnapshot, prepareSandboxTrustPlan, sandboxProtocolCutoverSQL } from '../scripts/check-portfolio-sandbox.mjs'
import { DatabaseSync } from 'node:sqlite'
import { prepareStagingPackage, verifyStagingPackage } from '../scripts/prepare-portfolio-staging.mjs'
import { prepareStagingCommandPlan } from '../scripts/portfolio-staging-plan.mjs'
import { stagingPortfolioPreview } from '../shared/portfolio-staging.js'
import hosting from '../portfolio-hosting/index.js'

async function configs() {
  return Promise.all(['wrangler.delete-sandbox.jsonc', 'wrangler.delete-sandbox-hosting.jsonc']
    .map(async name => JSON.parse(await readFile(new URL('./fixtures/retired-environments/' + name, import.meta.url), 'utf8'))))
}

test('offline cutover and import preparation has separate gates and exact sandbox-only commands', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No network'))
  const plan = await prepareSandboxTrustPlan('C:/Users/cezar/Desktop/bitreca-deletion-review/precutover-20261027')
  assert.equal(plan.scope, sandboxScope)
  assert.equal(plan.origin, 'https://bitreca-main-delete-sandbox-20261025.ceasar-elkhatib.workers.dev')
  assert.ok(plan.protocolStage.command.includes('$ApprovedProtocol1 -ne $true'))
  assert.ok(plan.protocolStage.command.includes('$IndependentWriterAuditApproved -ne $true'))
  assert.ok(plan.protocolStage.command.includes('meta.changes -ne 1'))
  assert.ok(plan.protocolStage.command.includes('minimum_protocol_version -ne 1'))
  assert.ok(plan.importStage.command.includes('$ApprovedEvidenceImport -ne $true'))
  assert.ok(plan.importStage.command.includes('--expected-signer $IndependentSignerSHA256'))
  assert.ok(plan.importStage.command.includes('-MaximumRedirection 0'))
  assert.ok(!plan.protocolStage.command.includes(' deploy '))
  assert.ok(!plan.importStage.command.includes(' deploy '))
})

test('conditional protocol SQL cannot run twice or cut over a nonempty/authorized sandbox', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('CREATE TABLE portfolio_storage_writer_policy(id INTEGER PRIMARY KEY, minimum_protocol_version INTEGER); INSERT INTO portfolio_storage_writer_policy VALUES(1,0); CREATE TABLE portfolio_deletion_runtime_policy(id INTEGER PRIMARY KEY,revision INTEGER,cleanup_enabled INTEGER,finalization_enabled INTEGER); INSERT INTO portfolio_deletion_runtime_policy VALUES(1,0,0,0);')
    const blockers = ['portfolios','portfolio_storage_allocations','portfolio_storage_origins','portfolio_storage_birth_seals',
      'portfolio_storage_allocation_events','portfolio_deletion_jobs','portfolio_storage_protocol_verifications','portfolio_deletion_finalizations']
    for (const table of blockers) db.exec(`CREATE TABLE ${table}(id INTEGER)`)
    for (const table of blockers) {
      db.exec(`INSERT INTO ${table} VALUES(1)`)
      assert.equal(db.prepare(sandboxProtocolCutoverSQL).run().changes, 0)
      db.exec(`DELETE FROM ${table}`)
    }
    for (const assignment of ['revision=1','cleanup_enabled=1','finalization_enabled=1']) {
      db.exec(`UPDATE portfolio_deletion_runtime_policy SET ${assignment}`)
      assert.equal(db.prepare(sandboxProtocolCutoverSQL).run().changes, 0)
      db.exec('UPDATE portfolio_deletion_runtime_policy SET revision=0,cleanup_enabled=0,finalization_enabled=0')
    }
    assert.equal(db.prepare(sandboxProtocolCutoverSQL).run().changes, 1)
    assert.equal(db.prepare(sandboxProtocolCutoverSQL).run().changes, 0)
    assert.equal(db.prepare('SELECT minimum_protocol_version FROM portfolio_storage_writer_policy').get().minimum_protocol_version, 1)
  } finally { db.close() }
})
test('sandbox validation pins both identities and refuses cross-environment substitutions, open controls and credentials', async () => {
  const pair = await configs()
  validateSandboxPair(...pair)
  for (const index of [0, 1]) for (const change of [
    c => { c.d1_databases[0].database_id = 'c9f87f2a-12fd-45bf-bf94-02e0f1f24d07' },
    c => { c.r2_buckets[0].bucket_name = 'bitreca-media' },
    c => { c.vars.PORTFOLIO_STORAGE_SCOPE = 'portfolioforest/staging/wrong' },
    c => { c.vars.PORTFOLIO_DATABASE_ID = '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a' },
    c => { c.vars.PORTFOLIO_STAGING_MUTATIONS_FROZEN = 'false' },
    c => { c.vars.PORTFOLIO_EVIDENCE_IMPORT_ENABLED = 'true' },
    c => { c.vars.ADMIN_PASSWORD = 'test-only-invalid-public-value' },
    c => { c.triggers = { crons: ['* * * * *'] } },
    c => { c.routes = ['example.invalid/*'] },
    c => { c.env = { production: {} } },
    c => { c.find_additional_modules = true },
  ]) {
    const modified = structuredClone(pair); change(modified[index])
    assert.throws(() => validateSandboxPair(...modified))
  }
})
test('sandbox readiness plans contain only exact sandbox SELECT/PRAGMA commands and cannot execute them', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No network is allowed'))
  const plan = await checkSandbox()
  assert.equal(plan.scope, sandboxScope)
  assert.equal(plan.publicKeyConfigured, false)
  for (const item of plan.readOnlyChecks) {
    assert.ok(item.command.includes(sandboxResources.databaseName))
    assert.ok(item.command.includes('wrangler.delete-sandbox.jsonc'))
    assert.match(item.sql, /^(?:SELECT|PRAGMA)\b/)
    assert.ok(!/\b(?:UPDATE|INSERT|DELETE|ALTER|DROP)\b/i.test(item.sql))
  }
})
test('initial sandbox snapshots reject missing history, enabled gates and unresolved writers without claiming settlement', async () => {
  const names = (await readdir(new URL('../migrations/', import.meta.url))).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()
  const raw = [{ success: true, results: [{ migrations: JSON.stringify(names), portfolios: 0, allocations: 0,
    unsettled_or_untracked: 0, minimum_protocol: 0, epochs: 0, deletion_jobs: 0,
    policy_revision: 0, cleanup_enabled: 0, finalization_enabled: 0 }] }]
  assert.equal(validateSandboxSnapshot(raw, names).state, 'empty-disabled-pre-cutover')
  for (const name of ['portfolios', 'allocations', 'unsettled_or_untracked', 'minimum_protocol', 'epochs', 'deletion_jobs', 'cleanup_enabled', 'finalization_enabled']) {
    const modified = structuredClone(raw); modified[0].results[0][name] = 1
    assert.throws(() => validateSandboxSnapshot(modified, names))
  }
  assert.throws(() => validateSandboxSnapshot(raw, names.slice(1)))
  assert.throws(() => validateSandboxSnapshot([{ success: false }], names))
})

test('sandbox deployment package seals actual bundles and refuses tampering or the older staging command planner', async () => {
  const prepared = await prepareStagingPackage({ sandbox: true })
  const verified = await verifyStagingPackage(prepared.directory)
  assert.equal(verified.target, 'portfolioforest-delete-sandbox')
  assert.equal(verified.artifactSha256, prepared.artifactSha256)
  assert.deepEqual(verified.workers, [sandboxResources.mainName, sandboxResources.hostingName])
  for (const file of ['main.wrangler.jsonc', 'hosting.wrangler.jsonc']) {
    assert.equal(JSON.parse(await readFile(join(prepared.directory, file), 'utf8')).find_additional_modules, false)
  }
  await assert.rejects(prepareStagingCommandPlan(prepared.directory), /legacy staging command plan/)
  await appendFile(join(prepared.directory, 'main-worker.mjs'), '\n// test-only tamper\n')
  await assert.rejects(verifyStagingPackage(prepared.directory))
})

test('sandbox hosting preview accepts only its configured hostname and fixed slug and fences deletion after R2 GET', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No network'))
  const vars = { PORTFOLIO_ENVIRONMENT: 'staging', PORTFOLIO_STAGING_PREVIEW_ENABLED: 'true',
    PORTFOLIO_STAGING_HOSTNAME: `${sandboxResources.hostingName}.fixture.workers.dev`,
    PORTFOLIO_STAGING_PREVIEW_SLUG: 'delete-test-fixture' }
  assert.equal(stagingPortfolioPreview(vars).slug, 'delete-test-fixture')
  assert.equal(stagingPortfolioPreview({ ...vars, PORTFOLIO_STAGING_PREVIEW_ENABLED: 'false' }), null)
  for (const hostname of ['customer.bitreca.com', 'bitreca-hosting-delete-sandbox-20261024.fixture.workers.dev',
    `${sandboxResources.mainName}.fixture.workers.dev`, `${vars.PORTFOLIO_STAGING_HOSTNAME}.evil.invalid`]) {
    assert.equal(stagingPortfolioPreview({ ...vars, PORTFOLIO_STAGING_HOSTNAME: hostname }), null)
  }
  let pending = false, markDuringGet = false, cancelled = false, reads = 0
  const env = { ...vars, PORTFOLIO_DB: { prepare() { return { bind(value) {
    assert.ok(value === 'delete-test-fixture' || value === 1)
    return { async first() { return pending ? null : { id: 1, storage_prefix: 'fixture-owned/' } } }
  } } } }, PORTFOLIO_FILES: { async get(key) {
    reads++; assert.equal(key, 'fixture-owned/index.html')
    if (markDuringGet) pending = true
    return { body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('FIXTURE')) },
      cancel() { cancelled = true } }) }
  } } }
  const origin = `https://${vars.PORTFOLIO_STAGING_HOSTNAME}`
  const result = await hosting.fetch(new Request(origin + '/'), env)
  assert.equal(result.status, 200); await result.body.cancel()
  assert.equal(cancelled, true)
  for (const hostname of [`${sandboxResources.hostingName}.other.workers.dev`, 'customer.bitreca.com']) {
    assert.equal((await hosting.fetch(new Request(`https://${hostname}/`), env)).status, 404)
  }
  assert.equal(reads, 1)
  cancelled = false; markDuringGet = true
  assert.equal((await hosting.fetch(new Request(origin + '/?slug=another'), env)).status, 404)
  assert.equal(cancelled, true)
})
