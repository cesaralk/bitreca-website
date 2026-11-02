import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import process from 'node:process'

// Only :memory: is accepted. This script never invokes Wrangler or opens a DB file.
export function validatePortfolioMigrations() {
  const folder = new URL('../migrations/', import.meta.url)
  const files = readdirSync(folder).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()
  assert.equal(files.length, 17)
  files.forEach((name, index) => assert.equal(Number(name.slice(0, 4)), index + 1, 'Migration sequence must be contiguous.'))
  let patterns = 0
  for (const seeded of [false, true]) {
    const db = new DatabaseSync(':memory:'), matcher = new DatabaseSync(':memory:')
    try {
      db.exec('PRAGMA foreign_keys=ON; PRAGMA temp_store=MEMORY; PRAGMA journal_mode=MEMORY;')
      assert.equal(db.prepare('PRAGMA database_list').get().file, '')
      const builtinGlob = matcher.prepare('SELECT ? GLOB ? AS valid')
      db.function('glob', { deterministic: true }, (pattern, value) => {
        assert.ok(new TextEncoder().encode(pattern).length <= 50, 'D1 permits at most 50 bytes per GLOB pattern.')
        patterns++
        return builtinGlob.get(value, pattern).valid
      })
      for (const [index, file] of files.entries()) {
        db.exec(readFileSync(new URL(file, folder), 'utf8'))
        if (seeded && index === 0) db.exec("INSERT INTO projects(title,slug,category,description) VALUES('Fixture','fixture-project','fixture','fixture')")
        if (seeded && index === 2) db.exec("INSERT INTO portfolios(name,slug,storage_prefix) VALUES('Fixture','fixture-legacy','portfolios/fixture-legacy/')")
        if (seeded && index === 5) db.exec(`INSERT INTO portfolio_storage_allocations(prefix,portfolio_id,allocation_kind,upload_state)
          VALUES('portfolio-initial/11111111-1111-4111-8111-111111111111/',1,'initial','completed')`)
      }
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
      assert.equal(db.prepare("SELECT auth_version FROM admin_auth_state WHERE admin_id='primary-admin'").get().auth_version, 1)
      assert.equal(db.prepare('SELECT minimum_protocol_version FROM portfolio_storage_writer_policy').get().minimum_protocol_version, 0)
      assert.equal(db.prepare('SELECT cleanup_enabled+finalization_enabled AS enabled FROM portfolio_deletion_runtime_policy').get().enabled, 0)
      assert.equal(db.prepare('SELECT count(*) AS n FROM portfolio_inventory_verifications').get().n, 0)
      assert.deepEqual({ ...db.prepare('SELECT * FROM portfolio_storage_authorization_state').get() },
        { id: 1, policy: 'independent-v1', generation: 0, policy_id: null })
      assert.equal(db.prepare('SELECT count(*) AS n FROM portfolio_storage_authorization_policies').get().n, 0)
      assert.equal(db.prepare('SELECT count(*) AS n FROM portfolio_storage_key_revocations').get().n, 0)
      if (seeded) {
        const row = db.prepare('SELECT * FROM portfolios WHERE id=1').get()
        assert.equal(row.storage_prefix, 'portfolios/fixture-legacy/')
        assert.equal(row.publication_revision, 0); assert.equal(row.storage_birth_token, null)
        assert.equal(db.prepare('SELECT count(*) AS n FROM projects').get().n, 1)
        assert.equal(db.prepare('SELECT writer_protocol_version FROM portfolio_storage_allocations').get().writer_protocol_version, 0)
        assert.throws(() => db.exec('UPDATE portfolios SET publication_revision=-1'), /CHECK/)
        assert.throws(() => db.exec('UPDATE portfolios SET publication_revision=1.5'), /CHECK/)
        assert.throws(() => db.exec('UPDATE admin_auth_state SET auth_version=0'), /CHECK|downgraded/)
      }
    } finally { db.close(); matcher.close() }
  }
  return { migrations: files.length, scenarios: 2, boundedGlobChecks: patterns }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validatePortfolioMigrations()
  console.log(`PASS: migrations 0001-0017 in fresh and seeded SQLite memory, preserved rows/relationships, disabled solo defaults, constraints/seeds, and ${result.boundedGlobChecks} D1-sized GLOB evaluations. No existing database or Cloudflare resource was accessed.`)
}
