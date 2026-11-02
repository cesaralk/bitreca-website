import { readFile, writeFile, copyFile } from 'node:fs/promises'
const target = 'C:/Users/cezar/Desktop/bitreca-deletion-integration'
await copyFile('migrations/0015_legacy_portfolio_finalization.sql', target + '/migrations/0015_legacy_portfolio_finalization.sql')
const migration11 = await readFile('migrations/0011_add_portfolio_deletion_finalization.sql', 'utf8')
const guard = migration11.slice(migration11.indexOf('CREATE TRIGGER portfolios_finalization_delete_guard'), migration11.indexOf('CREATE TRIGGER portfolio_finalization_apply')).trim()
await writeFile(target + '/migrations/0016_disable_legacy_finalization_bridge.sql', `-- Forward-only security fence. Retain migration 0015 and all historical receipts.\n-- Never adopt old births, authorize storage deletion, or enable any runtime control.\nCREATE TRIGGER portfolio_legacy_finalization_disabled BEFORE INSERT ON portfolio_legacy_deletion_finalizations\nBEGIN SELECT RAISE(ABORT,'Legacy reconciliation requires protected provenance and separate authorization.'); END;\nDROP TRIGGER portfolios_finalization_delete_guard;\n${guard}\n`, { flag: 'wx' })
let checker = await readFile(target + '/scripts/check-portfolio-migrations.mjs', 'utf8')
checker = checker.replace('assert.equal(files.length, 14)', 'assert.equal(files.length, 16)').replace('migrations 0001-0014 in fresh', 'migrations 0001-0016 in fresh')
await writeFile(target + '/scripts/check-portfolio-migrations.mjs', checker)
let tests = await readFile(target + '/tests/portfolio-release-integration.test.mjs', 'utf8')
tests = tests.replace("await assert.rejects(readFile('migrations/0015_legacy_portfolio_finalization.sql'))", "assert.ok((await readFile('migrations/0016_disable_legacy_finalization_bridge.sql','utf8')).includes('portfolio_legacy_finalization_disabled'))")
await writeFile(target + '/tests/portfolio-release-integration.test.mjs', tests)
await writeFile(target + '/tests/portfolio-legacy-fence.test.mjs', `import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFile, readdir } from 'node:fs/promises'
test('forward fence preserves old receipts and rejects both legacy insertion and unauthorized finalization', async t => {
  const db=new DatabaseSync(':memory:'); t.after(()=>db.close())
  const files=(await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort()
  for(const file of files.filter(name=>!name.startsWith('0016'))) db.exec(await readFile('migrations/'+file,'utf8'))
  const create = (id,slug) => {
    db.prepare('INSERT INTO portfolios(id,name,slug,storage_prefix) VALUES(?,?,?,?)').run(id,'Fake',slug,'portfolios/'+slug+'/')
    db.prepare('UPDATE portfolios SET deletion_requested_at=unixepoch() WHERE id=?').run(id)
    const job=String(id).padStart(8,'0')+'-0000-4000-8000-000000000000'
    db.prepare('INSERT INTO portfolio_deletion_jobs(id,portfolio_id,requested_by) VALUES(?,?,?)').run(job,id,'primary-admin')
    return job
  }
  const job1=create(1,'forest-demo')
  db.prepare('INSERT INTO portfolio_legacy_deletion_finalizations(job_id,portfolio_id,storage_prefix,manifest_sha256) VALUES(?,?,?,?)').run(job1,1,'portfolios/forest-demo/','a'.repeat(64))
  assert.equal(db.prepare('SELECT count(*) AS n FROM portfolios').get().n,0)
  db.exec(await readFile('migrations/0016_disable_legacy_finalization_bridge.sql','utf8'))
  assert.equal(db.prepare('SELECT count(*) AS n FROM portfolio_legacy_deletion_finalizations').get().n,1)
  const job2=create(2,'portfolioforest-test')
  assert.throws(()=>db.prepare('INSERT INTO portfolio_legacy_deletion_finalizations(job_id,portfolio_id,storage_prefix,manifest_sha256) VALUES(?,?,?,?)').run(job2,2,'portfolios/portfolioforest-test/','b'.repeat(64)),/Legacy reconciliation/)
  assert.throws(()=>db.exec('DELETE FROM portfolios WHERE id=2'),/finalization is not authorized/)
  assert.throws(()=>db.exec('DELETE FROM portfolio_legacy_deletion_finalizations'),/retained/)
  assert.equal(db.prepare('SELECT count(*) AS n FROM portfolios').get().n,1)
  assert.equal(db.prepare('SELECT cleanup_enabled+finalization_enabled AS n FROM portfolio_deletion_runtime_policy').get().n,0)
})
`, { flag: 'wx' })
console.log('Prepared forward-only migration 0016; immutable migration 0015 and historical receipts retained. No remote operations.')
