// Local-only selective transfer. Existing workspaces/artifacts are never overwritten.
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
const source = resolve('C:/Users/cezar/Desktop/bitreca-website')
const target = resolve('C:/Users/cezar/Desktop/bitreca-deletion-integration')
const baseline = '4e161cb'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.ok(execFileSync('git', ['-C', target, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).startsWith(baseline))
assert.equal(execFileSync('git', ['-C', target, 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Integration destination must be clean')
const files = ['eslint.config.js', 'package.json', 'src/pages/AdminPortfolios.jsx', 'src/pages/AdminPortfolios.css',
  'src/utils/adminApi.js', 'src/utils/portfolioAdmin.js', 'worker/index.js', 'portfolio-hosting/index.js']
for (const directory of ['scripts', 'tests', 'docs', 'shared', 'integration', 'migrations', 'worker']) {
  async function walk(folder) {
    for (const entry of await readdir(join(source, folder), { withFileTypes: true })) {
      const path = folder + '/' + entry.name
      if (entry.isDirectory()) await walk(path)
      else if (/\.(mjs|js|sql|md|ps1|json|txt)$/.test(path) &&
        !path.endsWith('0015_legacy_portfolio_finalization.sql') && !path.endsWith('portfolio-legacy-deletion.js') && !files.includes(path)) files.push(path)
    }
  }
  await walk(directory)
}
const transferred = []
for (const path of files) {
  const bytes = await readFile(join(source, path))
  await mkdir(join(target, path, '..'), { recursive: true })
  // Track source byte hashes before any deliberate integration edits.
  await copyFile(join(source, path), join(target, path))
  assert.equal(hash(await readFile(join(target, path))), hash(bytes))
  transferred.push({ path, sourceSha256: hash(bytes) })
}
// Quarantine the old synchronous legacy path. It is never included in this release.
await writeFile(join(target, 'worker/portfolio-legacy-deletion.js'), `// Compatibility gate: historical direct-delete bridge excluded from protected release.\nexport const legacyDeletionEnabled = () => false\nexport const supportsLegacyIdentity = () => false\nexport const handleLegacyDelete = async () => null\nexport const retryLegacyDelete = async () => null\n`, { flag: 'wx' })
let api = await readFile(join(target, 'worker/portfolio-deletion-api.js'), 'utf8')
api = api.replace(/ {2}const legacy = await env\.bitreca_db\.prepare\(`SELECT job_id FROM portfolio_legacy_deletion_finalizations WHERE job_id=\?`\)\.bind\(jobId\)\.first\(\)\r?\n {2}if \(legacy\) return \{[\s\S]*?dispatch: \{ phase: 'finalized', attempts: 1, next_attempt_at: 0, active: false \} \}\r?\n/, '')
assert.ok(!api.includes('portfolio_legacy_deletion_finalizations'))
await writeFile(join(target, 'worker/portfolio-deletion-api.js'), api)
// Preserve production routing/assets and exact resource bindings from origin/main.
const config = JSON.parse(await readFile(join(target, 'wrangler.jsonc'), 'utf8'))
config.vars = { ...config.vars, PORTFOLIO_ENVIRONMENT: 'production', PORTFOLIO_BUCKET_NAME: 'bitreca-media',
  PORTFOLIO_DATABASE_ID: '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a',
  PORTFOLIO_STORAGE_SCOPE: 'portfolioforest/production/bitreca-media/8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a',
  ...Object.fromEntries(['DELETE_REQUESTS', 'CLEANUP', 'FINALIZATION', 'SCHEDULE', 'EVIDENCE_IMPORT', 'LEGACY_DELETE'].map(name => ['PORTFOLIO_' + name + '_ENABLED', 'false'])) }
config.triggers = { crons: [] }
for (const binding of [...config.d1_databases, ...config.r2_buckets]) binding.remote = false
config.r2_buckets[0].preview_bucket_name = 'bitreca-media-preview-isolated'
await writeFile(join(target, 'wrangler.jsonc'), JSON.stringify(config, null, 2) + '\n')
const hosting = JSON.parse(await readFile(join(target, 'wrangler.portfolio-hosting.jsonc'), 'utf8'))
for (const binding of [...hosting.d1_databases, ...hosting.r2_buckets]) binding.remote = false
hosting.r2_buckets[0].preview_bucket_name = 'bitreca-media-preview-isolated'
await writeFile(join(target, 'wrangler.portfolio-hosting.jsonc'), JSON.stringify(hosting, null, 2) + '\n')
await writeFile(join(target, 'docs/deletion-integration-transfer.json'), JSON.stringify({ baseline,
  excluded: ['migration 0015 direct legacy finalization', 'original legacy-delete implementation', 'PortfolioForest/App/Navbar design changes', 'local logs/backups/private material', 'sandbox-only configs'],
  transferred }, null, 2) + '\n', { flag: 'wx' })
// Ensure deployment baseline public frontend remains byte-for-byte unchanged.
for (const path of ['src/pages/PortfolioForest.jsx', 'src/pages/PortfolioForest.css', 'src/App.jsx', 'src/components/Navbar.jsx']) {
  assert.equal((await readFile(join(target, path), 'utf8')).replaceAll('\r\n', '\n'), execFileSync('git', ['-C', target, 'show', 'HEAD:' + path], { encoding: 'utf8' }).replaceAll('\r\n', '\n'))
}
console.log(JSON.stringify({ target, baseline, transferredFiles: transferred.length, remoteOperations: false, originalsUntouched: true }, null, 2))
