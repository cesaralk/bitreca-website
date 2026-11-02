// One necessary upgrade check on a private metadata COPY, exclusively in memory.
// Never connects to production, reads signing keys or deletes portfolio records.
import assert from 'node:assert/strict'
import { readFile, open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
const candidate = review + '/deletion-production-candidate-20261029'
const receipt = JSON.parse(await readFile(review + '/production-metadata-backup-20261030.json', 'utf8'))
assert.equal(receipt.databaseId, '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const sql = await readFile(receipt.path)
assert.equal(sql.length, receipt.bytes); assert.equal(sha(sql), receipt.sha256)
const migration = await readFile(candidate + '/migrations/0016_disable_legacy_finalization_bridge.sql', 'utf8')
const db = new DatabaseSync(':memory:')
let result
try {
  db.exec(sql.toString('utf8'))
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name)
  const tableDigests = () => tables.map(name => ({ name, sha256: sha(JSON.stringify(db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all())) }))
  const before = tableDigests()
  const sixBefore = db.prepare('SELECT id,slug,status,storage_prefix FROM portfolios WHERE id BETWEEN 5 AND 10 ORDER BY id').all()
  assert.equal(sixBefore.length, 6); assert.ok(sixBefore.every(row => row.status === 'published'))
  db.exec('BEGIN')
  try { db.exec(migration); assert.deepEqual(tableDigests(), before); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error }
  assert.deepEqual(db.prepare('SELECT id,slug,status,storage_prefix FROM portfolios WHERE id BETWEEN 5 AND 10 ORDER BY id').all(), sixBefore)
  const guard = db.prepare("SELECT sql FROM sqlite_schema WHERE name='portfolios_finalization_delete_guard'").get().sql
  assert.ok(!guard.includes('portfolio_legacy_deletion_finalizations'))
  assert.ok(db.prepare("SELECT name FROM sqlite_schema WHERE name='portfolio_legacy_finalization_disabled'").get())
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  result = { databaseId: receipt.databaseId, backupSha256: receipt.sha256, migration16Sha256: sha(migration),
    verifiedAt: Math.floor(Date.now() / 1000), actualMetadataRestoredInMemory: true, tablesPreserved: tables.length,
    allTableRowDigestsUnchanged: true, sixPublishedPortfoliosUnchanged: true, legacyExceptionClosedInMemory: true,
    sqlContentsPrinted: false, realPortfoliosDeleted: false, remoteOperations: false }
} finally { db.close() }
const file = await open(review + '/production-migration16-snapshot-validation.json', 'wx')
try { await file.writeFile(JSON.stringify(result, null, 2) + '\n'); await file.sync() } finally { await file.close() }
console.log(JSON.stringify(result, null, 2))
