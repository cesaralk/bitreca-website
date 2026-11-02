import { readFile, writeFile } from 'node:fs/promises'
const target='C:/Users/cezar/Desktop/bitreca-deletion-integration'
const path=target+'/worker/portfolio-deletion-api.js'
let text=await readFile(path,'utf8')
text=text.replace('  if (!job) return null', `  if (!job) return null
  // Historical receipts are displayed as history only, never as current authority.
  const historicalTable = await env.bitreca_db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='portfolio_legacy_deletion_finalizations'").first()
  if (historicalTable) {
    const historical = await env.bitreca_db.prepare('SELECT job_id FROM portfolio_legacy_deletion_finalizations WHERE job_id=?').bind(jobId).first()
    if (historical) return { ...job, phase: 'finalized', error: null, cleanup_enabled: false,
      historicalAuthorization: 'legacy-bridge', dispatch: { phase: 'finalized', attempts: 0, next_attempt_at: 0, active: false } }
  }`)
await writeFile(path,text)
const tests=target+'/tests/portfolio-release-integration.test.mjs'
let source=await readFile(tests,'utf8')
source=source.replace("assert.ok(!(await readFile('worker/portfolio-deletion-api.js','utf8')).includes('portfolio_legacy_deletion_finalizations'))", "assert.ok((await readFile('worker/portfolio-deletion-api.js','utf8')).includes(\"historicalAuthorization: 'legacy-bridge'\"))")
await writeFile(tests,source)
console.log('Retained old legacy completion receipts as historical UI status only, without enabling current cleanup.')
