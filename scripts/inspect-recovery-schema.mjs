// Exact sandbox read-only diagnostic; never executes caller-provided SQL.
import assert from 'node:assert/strict'
import { readFile, writeFile, access } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { sandboxReadCredential } from './verify-sandbox-deployment.mjs'
import { recoveryTarget } from './generation3-recovery.mjs'
const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
const candidate = review + '/solo-owner-pinned-20261027/candidate'
const output = review + '/generation3-schema-reconciliation.json'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
if (!process.argv.includes('--read-only-approved')) { console.log('PLAN ONLY: one exact-sandbox SELECT of sqlite_schema; save public diagnostic outside Git.'); process.exit(0) }
await assert.rejects(access(output), error => error.code === 'ENOENT')
const credential = await sandboxReadCredential(candidate + '/main.wrangler.jsonc')
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${recoveryTarget.account}/d1/database/${recoveryTarget.databaseId}/query`, {
  method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql: 'SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name' }), signal: AbortSignal.timeout(30000) })
assert.ok(response.ok, `Read-only HTTP ${response.status}; stop without retry`)
const result = await response.json()
assert.ok(result.success && result.result.length === 1 && result.result[0].meta.rows_written === 0)
const actual = result.result[0].results, db = new DatabaseSync(':memory:')
const manifest = JSON.parse(await readFile(candidate + '/deployment-artifact.json', 'utf8'))
for (const file of manifest.files.filter(row => row.path.startsWith('migrations/')).sort((a, b) => a.path.localeCompare(b.path))) {
  const bytes = await readFile(candidate + '/' + file.path, 'utf8'); assert.equal(sha(bytes), file.sha256); db.exec(bytes)
}
const differences = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all().flatMap(expected => {
  const found = actual.find(row => row.name === expected.name)
  return JSON.stringify(found) === JSON.stringify(expected) ? [] : [{ name: expected.name, expected, actual: found || null }]
})
db.close()
await writeFile(output, JSON.stringify({ target: recoveryTarget, readOnly: true, differences, actual }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ output, differences: differences.map(row => ({ name: row.name, expected: row.expected.sql, actual: row.actual?.sql })) }, null, 2))
