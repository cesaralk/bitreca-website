import { test } from 'node:test'
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
