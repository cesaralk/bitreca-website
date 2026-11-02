import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {migration17Guards} from '../scripts/production-migration17-guards.mjs'

const folder=new URL('../migrations/',import.meta.url)
const names=readdirSync(folder).filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort()
const migration=readFileSync(new URL(names.at(-1),folder),'utf8')
const snapshotSQL=`SELECT json_object('migrationNames',json((SELECT json_group_array(name) FROM (SELECT name FROM d1_migrations ORDER BY name))),
 'schema',json((SELECT json_group_array(json(row)) FROM (SELECT json_object('type',type,'name',name,'tbl_name',tbl_name,'sql',sql) AS row FROM sqlite_schema ORDER BY type,name))),
 'tables',json_object('portfolios',json((SELECT json_group_array(json(row)) FROM (SELECT json_array(id,status,storage_prefix,deletion_requested_at) AS row FROM portfolios ORDER BY id))))) AS snapshot`
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close())
 for(const name of names.slice(0,-1))db.exec(readFileSync(new URL(name,folder),'utf8'))
 db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)')
 for(const name of names.slice(0,-1))db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(name)
 for(let id=5;id<=10;id++)db.prepare("INSERT INTO portfolios(id,name,slug,storage_prefix,status) VALUES(?,?,?,?, 'published')").run(id,'Synthetic','fixture-'+id,'test/'+id+'/')
 const beforeText=db.prepare(snapshotSQL).get().snapshot
 db.exec('SAVEPOINT expected');db.exec(migration)
 const afterSchema=JSON.parse(db.prepare(snapshotSQL).get().snapshot).schema
 db.exec('ROLLBACK TO expected;RELEASE expected')
 return {db,beforeText,...migration17Guards(snapshotSQL,beforeText,names,afterSchema)}
}
function batch(f,alter=()=>{}){
 f.db.exec('BEGIN')
 try{
  assert.equal(f.db.prepare(f.beforeGuard.sql).get(...f.beforeGuard.params).verified,'preflight-matched')
  f.db.exec(migration)
  f.db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(names.at(-1))
  alter(f.db)
  assert.equal(f.db.prepare(f.afterGuard.sql).get(...f.afterGuard.params).verified,'postconditions-matched')
  f.db.exec('COMMIT')
 }catch(error){f.db.exec('ROLLBACK');throw error}
}
test('0017 reviewed release batch preserves six published records and writes only new schema plus tracking',t=>{
 const f=fixture(t);batch(f)
 assert.equal(f.db.prepare("SELECT count(*) AS n FROM portfolios WHERE status='published'").get().n,6)
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM d1_migrations').get().n,17)
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM portfolio_legacy_reconciliations').get().n,0)
})
test('stale state stops before DDL and rollback restores schema/tracking after a failed postcondition',t=>{
 const stale=fixture(t);stale.db.exec('UPDATE portfolios SET publication_revision=publication_revision+1 WHERE id=5')
 // The runner's full snapshot includes every column; use a changed snapshotted field here.
 stale.db.exec("UPDATE portfolios SET name='Updated',status='draft' WHERE id=5")
 assert.throws(()=>batch(stale),/malformed JSON/)
 assert.equal(stale.db.prepare('SELECT count(*) AS n FROM d1_migrations').get().n,16)
 const f=fixture(t)
 assert.throws(()=>batch(f,db=>db.exec("UPDATE portfolios SET status='draft' WHERE id=5")),/malformed JSON/)
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM d1_migrations').get().n,16)
 assert.equal(f.db.prepare("SELECT name FROM sqlite_schema WHERE name='portfolio_legacy_reconciliations'").get(),undefined)
 assert.equal(f.db.prepare("SELECT status FROM portfolios WHERE id=5").get().status,'published')
})
test('committed but unacknowledged batch cannot be replayed with obsolete preflight',t=>{
 const f=fixture(t);batch(f)
 assert.throws(()=>batch(f),/malformed JSON/)
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM d1_migrations').get().n,17)
})
test('deployment/migration runner default is offline plan only; obsolete approval flags are refused',()=>{
 const script=new URL('../scripts/apply-production-migration17.mjs',import.meta.url)
 const result=execFileSync(process.execPath,[script.pathname.replace(/^\/([A-Za-z]:)/,'$1')],{encoding:'utf8'})
 assert.match(result,/PLAN ONLY/)
 assert.match(result,/No credentials read or network used/)
 assert.throws(()=>execFileSync(process.execPath,[script.pathname.replace(/^\/([A-Za-z]:)/,'$1'),'--approved-migration16'],{stdio:'pipe'}))
})
