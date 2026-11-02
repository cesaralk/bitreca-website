// Offline release artifact preparation only. Never imports the Cloudflare Vite plugin.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, readdir, copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { build as viteBuild } from 'vite'
import react from '@vitejs/plugin-react'
import { build as workerBuild } from 'esbuild'
const root = resolve('C:/Users/cezar/Desktop/bitreca-deletion-integration')
assert.equal(resolve(process.cwd()), root)
const output = 'C:/Users/cezar/Desktop/bitreca-deletion-review/deletion-production-reconciliation-candidate-20261030-v3'
await mkdir(output, { recursive: false })
const temporary = await mkdtemp(join(tmpdir(), 'bitreca-offline-env-'))
await viteBuild({ root, configFile: false, envDir: temporary, cacheDir: join(temporary, 'cache'), plugins: [react()],
  logLevel: 'warn', build: { outDir: join(output, 'client'), emptyOutDir: false } })
for (const [entry, destination] of [['worker/index.js', 'main-worker.mjs'], ['portfolio-hosting/index.js', 'hosting-worker.mjs']]) {
  await workerBuild({ absWorkingDir: root, entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', outfile: join(output, destination), logLevel: 'silent' })
}
for (const [file, destination, main] of [['wrangler.jsonc', 'main.wrangler.jsonc', true], ['wrangler.portfolio-hosting.jsonc', 'hosting.wrangler.jsonc', false]]) {
  const config = JSON.parse(await readFile(join(root, file), 'utf8'))
  config.main = main ? 'main-worker.mjs' : 'hosting-worker.mjs'
  assert.equal(config.d1_databases.length,1); assert.equal(config.r2_buckets.length,1)
  assert.equal(config.d1_databases[0].database_id,'8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a')
  assert.equal(config.r2_buckets[0].bucket_name,'bitreca-media')
  assert.equal(config.name,main?'bitreca-website':'bitreca-portfolio-hosting')
  if (main) {
    config.assets = { ...config.assets, directory: './client' }
    for (const flag of ['DELETE_REQUESTS', 'CLEANUP', 'FINALIZATION', 'EVIDENCE_IMPORT', 'SCHEDULE', 'LEGACY_DELETE', 'LEGACY_RECONCILIATION_IMPORT']) assert.equal(config.vars['PORTFOLIO_' + flag + '_ENABLED'], 'false')
    assert.deepEqual(config.triggers.crons, [])
  }
  await writeFile(join(output, destination), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' })
}
await mkdir(join(output, 'migrations'))
for (const file of (await readdir(join(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) {
  await copyFile(join(root, 'migrations', file), join(output, 'migrations', file))
}
assert.ok((await readFile(join(output, 'migrations/0016_disable_legacy_finalization_bridge.sql'), 'utf8')).includes('portfolio_legacy_finalization_disabled'))
assert.ok((await readFile(join(output, 'migrations/0017_add_legacy_reconciliation_authority.sql'), 'utf8')).includes('portfolio_legacy_inventory_bindings'))
assert.equal((await readdir(join(output, 'migrations'))).filter(name => name.endsWith('.sql')).length,17)
const diff = execFileSync('git', ['-C', root, 'diff', '--binary'], { maxBuffer: 16 * 1024 * 1024 })
await writeFile(join(output, 'proposed-tracked-changes.patch'), diff)
const sourcePaths = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
for (const path of sourcePaths) {
  assert.ok(!/\.(pem|key|pfx|pk8|env)$/.test(path), 'Private material forbidden')
  await mkdir(join(output, 'new-source', path, '..'), { recursive: true })
  await copyFile(join(root, path), join(output, 'new-source', path))
}
await writeFile(join(output, 'release-status.json'), JSON.stringify({ baseline: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  branch: 'deletion/protected-release-20261029', deploymentAuthorized: false, deletionEnabled: false, testedAgainstRealProductionData: false,
  blockers: ['Production-scoped policy enrollment, key pinning, protocol1 cutover, conditional storage sentinel and writer fencing/settlement need separate approval',
    'Six legacy portfolios still need genuine exclusive ownership, complete historical namespaces and external-writer settlement evidence, followed by separate signing/import',
    'Only migration0017 is proposed next;0016 is already applied. No enablement or customer deletion is authorized'] }, null, 2) + '\n')
const files = []
async function walk(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name
    if (entry.isDirectory()) await walk(join(directory, entry.name), path + '/')
    else { const bytes = await readFile(join(directory, entry.name)); files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }) }
  }
}
await walk(output)
files.sort((a, b) => a.path.localeCompare(b.path))
const manifest = JSON.stringify({ format: 1, classification: 'DISABLED OFFLINE CANDIDATE — NOT APPROVED FOR DEPLOYMENT', files }, null, 2) + '\n'
await writeFile(join(output, 'deployment-artifact.json'), manifest, { flag: 'wx' })
for (const file of files) assert.equal(createHash('sha256').update(await readFile(join(output, file.path))).digest('hex'), file.sha256)
console.log(JSON.stringify({ output, files: files.length, manifestSha256: createHash('sha256').update(manifest).digest('hex'), deploymentAuthorized: false, allDigestsVerified: true }, null, 2))
