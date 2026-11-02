// A separate provider-integration harness, NOT the protected application deletion
// workflow. No audit evidence, protocol epoch, application policy or signature is
// created, imported or bypassed here. Bind ONLY fresh disposable D1/R2 resources.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
const bytes = text => new TextEncoder().encode(text)
function check(value, message) { if (!value) throw new Error(message) }
function confirmed(result) { check(result?.success, 'D1 checkpoint unconfirmed'); return result }
async function rows(db, sql, ...args) { return confirmed(await db.prepare(sql).bind(...args).all()).results }
async function write(db, sql, ...args) { return confirmed(await db.prepare(sql).bind(...args).run()) }
const answer = (body, status = 200) => Response.json({ classification: 'solo-technical-integration-only', protected_workflow_exercised: false, ...body }, { status, headers: { 'Cache-Control': 'no-store' } })

export function validateSoloEnvironment(env) {
  check(env.SOLO_IT_MODE === 'isolated-integration-only' && uuid.test(env.SOLO_RUN_ID), 'Invalid isolated test identity')
  const nonce = env.SOLO_RUN_ID.replaceAll('-', '').slice(0, 12)
  check(env.SOLO_DATABASE_NAME === `bitreca-solo-delete-it-${nonce}-db` && env.SOLO_BUCKET_NAME === `bitreca-solo-delete-it-${nonce}-r2`, 'Only fresh solo integration names allowed')
  check(/^[0-9a-f-]{36}$/.test(env.SOLO_DATABASE_ID) && !['8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a','c9f87f2a-12fd-45bf-bf94-02e0f1f24d07','9c236935-b942-4cd7-9360-fed24db999fa'].includes(env.SOLO_DATABASE_ID), 'Application database forbidden')
  check(typeof env.SOLO_RUN_TOKEN === 'string' && /^[0-9a-f]{64}$/.test(env.SOLO_RUN_TOKEN), 'Local run capability missing')
  return `solo-deletion-it/${env.SOLO_RUN_ID}/`
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // Even if mistakenly uploaded, this harness refuses all non-loopback Hosts.
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || request.headers.get('Authorization') !== `Bearer ${env.SOLO_RUN_TOKEN}`) return answer({ error: 'Forbidden' }, 403)
    if (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) return answer({ error: 'Origin refused' }, 403)
    try {
      const prefix = validateSoloEnvironment(env), db = env.SOLO_DB, bucket = env.SOLO_R2, runId = env.SOLO_RUN_ID
      const tables = await rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND substr(name,1,7)<>'sqlite_' AND substr(name,1,4)<>'_cf_' AND name<>'d1_migrations'")
      check(tables.length === 3 && tables.every(row => ['solo_it_runs','solo_it_portfolios','solo_it_objects'].includes(row.name)), 'Refusing non-harness schema')
      let run = await db.prepare('SELECT * FROM solo_it_runs WHERE id=?').bind(runId).first()
      const manifest = async role => rows(db, 'SELECT * FROM solo_it_objects WHERE run_id=? AND role=? ORDER BY key', runId, role)
      const validKey = item => check(item.run_id === runId && item.key.startsWith(`${prefix}${item.role}/`) && ['a','b'].includes(item.role) && !item.key.includes('..'), 'Key outside owned fixture namespace')
      const verifyObject = (item, object) => {
        validKey(item)
        check(item.writer_state === 'closed' && object && object.etag === item.etag && object.size === item.size &&
          object.customMetadata?.solo_run === runId && object.customMetadata?.sha256 === item.sha256, 'Object identity changed; stop without deletion')
      }
      const verifyB = async () => {
        const objects = await manifest('b')
        check(objects.length === 4, 'Foreign fixture inventory incomplete')
        for (const item of objects) {
          const object = await bucket.get(item.key)
          verifyObject(item, object)
          check(await hash(await object.arrayBuffer()) === item.sha256, 'Foreign fixture bytes changed')
        }
      }
      const fixtures = JSON.parse(env.SOLO_FIXTURES)
      check(Object.keys(fixtures).length === 9 && Object.values(fixtures).every(text => typeof text === 'string' && bytes(text).length < 5000), 'Unexpected fixture input')
      async function put(role, version, path, content) {
        check(/^(index\.html|assets\/(style\.css|app\.js|mark\.svg))$/.test(path), 'Unexpected fixture path')
        const data = typeof content === 'string' ? bytes(content) : content
        const key = `${prefix}${role}/${version}/${path}`, digest = await hash(data)
        await write(db, "INSERT INTO solo_it_objects(key,run_id,role,sha256,size,writer_state) VALUES(?,?,?,?,?,'open')", key, runId, role, digest, data.length)
        let result
        try { result = await bucket.put(key, data, { customMetadata: { solo_run: runId, sha256: digest } }) }
        catch { await write(db, "UPDATE solo_it_objects SET writer_state='uncertain' WHERE key=?", key); throw new Error('PUT outcome uncertain; no cleanup authorized') }
        check(typeof result?.etag === 'string', 'PUT response unconfirmed; writer remains open')
        await write(db, "UPDATE solo_it_objects SET etag=?,writer_state='closed' WHERE key=? AND writer_state='open'", result.etag, key)
      }
      if (url.pathname === '/status' && request.method === 'GET') return answer({ run, objects: await rows(db, 'SELECT role,writer_state,deleted,count(*) AS count FROM solo_it_objects WHERE run_id=? GROUP BY role,writer_state,deleted', runId) })
      if (request.method !== 'POST') return answer({ error: 'Not found' }, 404)
      if (request.headers.get('X-Solo-Confirm') !== runId) return answer({ error: 'Exact run-ID confirmation required' }, 400)
      if (url.pathname === '/prepare') {
        if (run) return answer({ error: 'Run already exists; inspect status, never rewrite unresolved writer history' }, 409)
        check((await rows(db, 'SELECT id FROM solo_it_runs')).length === 0, 'Only one fresh run per integration database')
        const page = await bucket.list({ prefix, limit: 1 })
        check(page.truncated === false && page.objects?.length === 0, 'Fixture namespace is not empty')
        await write(db, "INSERT INTO solo_it_runs(id,phase) VALUES(?,'uploading')", runId)
        for (const role of ['a','b']) await write(db, 'INSERT INTO solo_it_portfolios(id,run_id,role,active_prefix) VALUES(?,?,?,?)', `${runId}-${role}`, runId, role, `${prefix}${role}/folder-v1/`)
        try {
          await put('a', 'html-v1', 'index.html', fixtures['portfolio-a/index.html'])
          await write(db, "UPDATE solo_it_runs SET phase='created' WHERE id=?", runId)
        } catch (error) { await write(db, "UPDATE solo_it_runs SET phase='blocked' WHERE id=?", runId); throw error }
        return answer({ phase: 'created', portfolios_created: 2, cleanup_started: false })
      }
      check(run, 'Run missing')
      if (url.pathname === '/upload-folder') {
        check(run.phase === 'created', 'Folder upload is not authorized in this phase')
        try {
          for (const role of ['a','b']) for (const [name, content] of Object.entries(fixtures)) {
            if (name.startsWith(`portfolio-${role}/`)) await put(role, 'folder-v1', name.slice(12), content)
          }
          await write(db, "UPDATE solo_it_runs SET phase='folder_uploaded' WHERE id=?", runId)
        } catch (error) { await write(db, "UPDATE solo_it_runs SET phase='blocked' WHERE id=?", runId); throw error }
        return answer({ phase: 'folder_uploaded', fixture_keys: 9 })
      }
      if (url.pathname === '/replace-html') {
        check(run.phase === 'folder_uploaded', 'HTML replacement is not authorized in this phase')
        try {
          // HTML replacement reads/copies actual R2 assets, retaining old versions.
          for (const path of ['assets/style.css','assets/app.js','assets/mark.svg']) {
            const key = `${prefix}a/folder-v1/${path}`
            const item = await db.prepare('SELECT * FROM solo_it_objects WHERE key=?').bind(key).first()
            const source = await bucket.get(key); verifyObject(item, source)
            const data = new Uint8Array(await source.arrayBuffer())
            check(await hash(data) === item.sha256, 'Copy source changed')
            await put('a', 'html-v2', path, data)
          }
          await put('a', 'html-v2', 'index.html', fixtures['html-replacement/index.html'])
          await write(db, 'UPDATE solo_it_portfolios SET active_prefix=? WHERE id=?', `${prefix}a/html-v2/`, `${runId}-a`)
          await write(db, "UPDATE solo_it_runs SET phase='ready' WHERE id=?", runId)
        } catch (error) { await write(db, "UPDATE solo_it_runs SET phase='blocked' WHERE id=?", runId); throw error }
        return answer({ phase: 'ready', fixture_keys: 13, cleanup_started: false })
      }
      if (url.pathname === '/mark') {
        check(run.phase === 'ready', 'Run is not ready for marking')
        check((await manifest('a')).length === 9 && (await manifest('a')).every(item => item.writer_state === 'closed'), 'Unsettled fixture writer')
        const result = await db.batch([
          db.prepare('UPDATE solo_it_portfolios SET marked=1 WHERE id=?').bind(`${runId}-a`),
          db.prepare("UPDATE solo_it_runs SET phase='marked' WHERE id=? AND phase='ready'").bind(runId),
        ])
        result.forEach(confirmed)
        return answer({ phase: 'marked' })
      }
      if (url.pathname === '/cleanup') {
        check(run.phase === 'marked', 'Cleanup requires a marked fixture run')
        const objects = await manifest('a')
        check(objects.length === 9 && objects.every(item => item.writer_state === 'closed'), 'Incomplete or unsettled manifest')
        const item = objects.find(object => !object.deleted)
        if (item) {
          validKey(item)
          const current = await bucket.head(item.key)
          if (current) { verifyObject(item, current); await bucket.delete(item.key) }
          check(await bucket.head(item.key) === null, 'DELETE not confirmed empty')
          await write(db, 'UPDATE solo_it_objects SET deleted=1 WHERE key=?', item.key)
          return answer({ phase: 'marked', confirmed_deleted: objects.filter(object => object.deleted).length + 1 })
        }
        const remaining = await bucket.list({ prefix: `${prefix}a/`, limit: 1 })
        check(remaining.truncated === false && remaining.objects?.length === 0, 'Unknown fixture-prefix objects remain; never delete unregistered keys')
        await verifyB()
        await write(db, "UPDATE solo_it_runs SET phase='storage_verified' WHERE id=?", runId)
        return answer({ phase: 'storage_verified', foreign_fixture_preserved: true })
      }
      if (url.pathname === '/finalize') {
        check(run.phase === 'storage_verified', 'Finalization requires verified storage')
        const objects = await manifest('a')
        check(objects.length === 9 && objects.every(item => item.deleted && item.writer_state === 'closed'), 'Missing cleanup receipts')
        for (const item of objects) { validKey(item); check(await bucket.head(item.key) === null, 'Fixture object reappeared') }
        await verifyB()
        const results = await db.batch([
          db.prepare('DELETE FROM solo_it_portfolios WHERE id=? AND marked=1').bind(`${runId}-a`),
          db.prepare("UPDATE solo_it_runs SET phase='finalized',finalized_at=unixepoch() WHERE id=? AND phase='storage_verified'").bind(runId),
        ])
        results.forEach(confirmed)
        run = await db.prepare('SELECT * FROM solo_it_runs WHERE id=?').bind(runId).first()
        check(run.phase === 'finalized' && !await db.prepare('SELECT id FROM solo_it_portfolios WHERE id=?').bind(`${runId}-a`).first(), 'Finalization unconfirmed')
        return answer({ phase: 'finalized', receipt: run, foreign_fixture_preserved: true, manifest_retained: objects.length })
      }
      return answer({ error: 'Not found' }, 404)
    } catch (error) { return answer({ error: error.message, action: 'Stop and retain evidence; never close uncertain writers or reset history' }, 409) }
  },
}
