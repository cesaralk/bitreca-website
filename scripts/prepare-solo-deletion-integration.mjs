import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { build } from 'esbuild'
import { stagingFixtureFiles } from './prepare-portfolio-fixture.mjs'
import { quotePowerShell } from './portfolio-staging-plan.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const account = '4ec868eac2a3b9127531ad39d2501f15'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export function validateSoloConfig(config, { template = false } = {}) {
  const vars = config.vars, id = vars?.SOLO_RUN_ID
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const nonce = id.replaceAll('-', '').slice(0, 12), prefix = `bitreca-solo-delete-it-${nonce}`
  assert.equal(config.account_id, account); assert.equal(config.name, prefix + '-local')
  assert.equal(config.main, './harness.mjs'); assert.equal(config.find_additional_modules, false)
  assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false)
  assert.deepEqual(config.dev, { ip: '127.0.0.1', port: 8793, local_protocol: 'http' })
  assert.deepEqual(Object.keys(config).sort(), ['account_id','compatibility_date','d1_databases','dev','find_additional_modules','main','name','preview_urls','r2_buckets','vars','workers_dev'].sort())
  assert.equal(vars.SOLO_IT_MODE, 'isolated-integration-only')
  assert.deepEqual(Object.keys(vars).sort(), ['SOLO_IT_MODE','SOLO_RUN_ID','SOLO_DATABASE_NAME','SOLO_DATABASE_ID','SOLO_BUCKET_NAME','SOLO_FIXTURES'].sort())
  assert.equal(config.d1_databases.length, 1); assert.equal(config.r2_buckets.length, 1)
  const db = config.d1_databases[0], r2 = config.r2_buckets[0]
  assert.deepEqual(Object.keys(db).sort(), ['binding','database_name','database_id','remote'].sort())
  assert.deepEqual(Object.keys(r2).sort(), ['binding','bucket_name','remote'].sort())
  assert.equal(db.binding, 'SOLO_DB'); assert.equal(r2.binding, 'SOLO_R2')
  assert.equal(db.remote, true); assert.equal(r2.remote, true)
  assert.equal(db.database_name, prefix + '-db'); assert.equal(vars.SOLO_DATABASE_NAME, db.database_name)
  assert.equal(r2.bucket_name, prefix + '-r2'); assert.equal(vars.SOLO_BUCKET_NAME, r2.bucket_name)
  assert.equal(vars.SOLO_DATABASE_ID, db.database_id)
  if (template && db.database_id === 'REPLACE_WITH_FRESH_D1_UUID') return
  assert.match(db.database_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.ok(!['8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a','c9f87f2a-12fd-45bf-bf94-02e0f1f24d07','9c236935-b942-4cd7-9360-fed24db999fa'].includes(db.database_id))
}
export async function verifySoloPackage(directory, { template = false } = {}) {
  directory = resolve(directory)
  const manifest = JSON.parse(await readFile(join(directory, 'solo-package.json'), 'utf8'))
  assert.equal(manifest.classification, 'separate-provider-integration-not-protected-deletion-acceptance')
  const files = ['harness.mjs','schema.sql','wrangler.solo.jsonc','provision.wrangler.jsonc','.dev.vars']
  assert.deepEqual(manifest.files.map(item => item.path).sort(), files.sort())
  for (const item of manifest.files) {
    const bytes = await readFile(join(directory, item.path))
    assert.equal(bytes.length, item.bytes); assert.equal(digest(bytes), item.sha256)
  }
  const config = JSON.parse(await readFile(join(directory, 'wrangler.solo.jsonc'), 'utf8'))
  validateSoloConfig(config, { template })
  return { config, manifestSha256: digest(await readFile(join(directory, 'solo-package.json'))) }
}
export async function prepareSoloIntegration(directory) {
  directory = resolve(directory)
  assert.ok(!directory.toLowerCase().startsWith(root.toLowerCase() + '\\') && !directory.toLowerCase().startsWith(root.toLowerCase() + '/') && directory.toLowerCase() !== root.toLowerCase())
  await mkdir(directory, { recursive: false }) // Never overwrite any earlier evidence.
  const runId = randomUUID(), nonce = runId.replaceAll('-', '').slice(0, 12), name = `bitreca-solo-delete-it-${nonce}`
  const config = { account_id: account, name: name + '-local', main: './harness.mjs', compatibility_date: '2026-09-30',
    workers_dev: false, preview_urls: false, find_additional_modules: false,
    dev: { ip: '127.0.0.1', port: 8793, local_protocol: 'http' },
    d1_databases: [{ binding: 'SOLO_DB', database_name: name + '-db', database_id: 'REPLACE_WITH_FRESH_D1_UUID', remote: true }],
    r2_buckets: [{ binding: 'SOLO_R2', bucket_name: name + '-r2', remote: true }],
    vars: { SOLO_IT_MODE: 'isolated-integration-only', SOLO_RUN_ID: runId, SOLO_DATABASE_NAME: name + '-db',
      SOLO_DATABASE_ID: 'REPLACE_WITH_FRESH_D1_UUID', SOLO_BUCKET_NAME: name + '-r2', SOLO_FIXTURES: JSON.stringify(stagingFixtureFiles()) } }
  validateSoloConfig(config, { template: true })
  const bundled = await build({ absWorkingDir: root, entryPoints: ['integration/solo-deletion/worker.js'], bundle: true,
    write: false, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent' })
  const contents = { 'harness.mjs': bundled.outputFiles[0].contents, 'schema.sql': await readFile(join(root, 'integration/solo-deletion/schema.sql')),
    'wrangler.solo.jsonc': JSON.stringify(config, null, 2) + '\n',
    'provision.wrangler.jsonc': JSON.stringify({ account_id: account, name: name + '-local', compatibility_date: '2026-09-30', workers_dev: false, preview_urls: false }, null, 2) + '\n',
    '.dev.vars': `SOLO_RUN_TOKEN=${randomBytes(32).toString('hex')}\n` }
  const files = []
  for (const [path, bytes] of Object.entries(contents)) {
    await writeFile(join(directory, path), bytes, { flag: 'wx', mode: 0o600 })
    files.push({ path, bytes: (await readFile(join(directory, path))).length, sha256: digest(bytes) })
  }
  await writeFile(join(directory, 'solo-package.json'), JSON.stringify({ classification: 'separate-provider-integration-not-protected-deletion-acceptance', created_at: new Date().toISOString(), runId, files }, null, 2) + '\n', { flag: 'wx' })
  const verified = await verifySoloPackage(directory, { template: true })
  const cli = join(root, 'node_modules/wrangler/bin/wrangler.js')
  const command = (args, configFile = 'provision.wrangler.jsonc') => '& ' + [process.execPath, cli, ...args, '--cwd', directory, '--config', join(directory, configFile)].map(quotePowerShell).join(' ')
  return { directory, runId, manifestSha256: verified.manifestSha256, remote_operations_executed: false,
    approval1: 'Create ONLY these fresh D1/R2 resources, confirm returned D1 ID/name and an empty schema before applying harness schema, then start a loopback remote-binding session. No application Worker deployment.',
    provisionCommands: [command(['d1','create',name + '-db']), command(['r2','bucket','create',name + '-r2'])],
    bindingStep: 'Save the provider GET database metadata (uuid/name/created_at), then use this script --bind PACKAGE PROVIDER_METADATA_JSON. It verifies the generated database name and creation time before locally binding/resealing. Independently read an empty sqlite_master before applying schema. Never use an existing database ID.',
    schemaCommand: command(['d1','execute',name + '-db','--remote','--file',join(directory, 'schema.sql')], 'wrangler.solo.jsonc'),
    sessionCommand: command(['dev','--ip','127.0.0.1','--port','8793'], 'wrangler.solo.jsonc'),
    approval2: 'Create only two fake fixture portfolios and 13 fixture objects; no deletion. Run driver prepare with explicit --approve-fixture-writes.',
    approval3: 'Mark/delete/finalize fixture A only; at most nine known keys, one per cleanup call. Retain B, manifest/receipt records and resources. Run driver delete with --approve-fixture-deletion.',
    limitation: 'Exercises real remote D1/R2 through local workerd using a separate test schema/implementation. Does not execute or certify the protected application deletion pipeline, auth, signed inventory, cutover or production authorization.' }
}
export async function bindSoloIntegration(directory, proofPath) {
  const { config } = await verifySoloPackage(directory, { template: true })
  assert.equal(config.d1_databases[0].database_id, 'REPLACE_WITH_FRESH_D1_UUID', 'Already bound; refusing silent retarget')
  const manifestPath = join(directory, 'solo-package.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const proof = JSON.parse(await readFile(proofPath, 'utf8')), resource = proof.data?.result || proof.result || proof
  assert.equal(resource.name, config.vars.SOLO_DATABASE_NAME)
  assert.ok(Number.isFinite(Date.parse(resource.created_at)) && Date.parse(resource.created_at) >= Date.parse(manifest.created_at) - 60000, 'Database must be newly created for this prepared run')
  config.d1_databases[0].database_id = resource.uuid
  config.vars.SOLO_DATABASE_ID = resource.uuid
  validateSoloConfig(config)
  const bytes = JSON.stringify(config, null, 2) + '\n'
  const entry = manifest.files.find(item => item.path === 'wrangler.solo.jsonc')
  entry.bytes = new TextEncoder().encode(bytes).length; entry.sha256 = digest(bytes)
  // Only the separate, not-yet-run harness package changes. Application artifacts
  // are never accepted here or rewritten by this preparation helper.
  await writeFile(join(directory, 'wrangler.solo.jsonc'), bytes)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return { directory, ...(await verifySoloPackage(directory)), note: 'Local fresh-resource binding only. No schema or remote data was changed.' }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--bind') {
      assert.equal(process.argv.length, 5, 'Usage: --bind PACKAGE PROVIDER_DATABASE_METADATA_JSON')
      const bound = await bindSoloIntegration(process.argv[3], process.argv[4])
      console.log(JSON.stringify({ directory: bound.directory, manifestSha256: bound.manifestSha256, note: bound.note }, null, 2))
    } else {
      assert.equal(process.argv.length, 3, 'Usage: prepare-solo-deletion-integration.mjs NEW_OUTSIDE_REPOSITORY_DIRECTORY')
      console.log(JSON.stringify(await prepareSoloIntegration(process.argv[2]), null, 2))
    }
  } catch (error) { console.error(`Local solo integration preparation refused: ${error.message}. No remote operation executed.`); process.exitCode = 1 }
}
