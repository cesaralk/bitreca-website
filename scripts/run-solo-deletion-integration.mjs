import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { verifySoloPackage } from './prepare-solo-deletion-integration.mjs'

// Never provisions/deploys. Talks ONLY to a separately approved loopback session.
const [directory, mode, approval] = process.argv.slice(2)
try {
  assert.ok(directory && ['prepare','delete'].includes(mode))
  const required = mode === 'prepare' ? '--approve-fixture-writes' : '--approve-fixture-deletion'
  if (approval !== required) {
    console.log(`PLAN ONLY: ${mode} requires separate explicit approval and ${required}. No requests made.`)
  } else {
    const { config, manifestSha256 } = await verifySoloPackage(directory)
    const token = (await readFile(join(directory, '.dev.vars'), 'utf8')).match(/^SOLO_RUN_TOKEN=([0-9a-f]{64})$/m)?.[1]
    assert.ok(token, 'Run capability missing')
    const receipts = []
    const call = async (path, method = 'POST') => {
      const response = await fetch('http://127.0.0.1:8793' + path, { method, redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'X-Solo-Confirm': config.vars.SOLO_RUN_ID }, signal: AbortSignal.timeout(60000) })
      const data = await response.json()
      receipts.push({ path, status: response.status, data })
      assert.ok(response.ok && !data.error, `Stopped at ${path}: ${data.error || response.status}`)
      assert.equal(data.classification, 'solo-technical-integration-only'); assert.equal(data.protected_workflow_exercised, false)
      return data
    }
    let failure
    try {
      const before = await call('/status', 'GET')
      if (mode === 'prepare') {
        assert.equal(before.run, null, 'Run already exists; do not repeat uploads')
        assert.equal((await call('/prepare')).phase, 'created')
        assert.equal((await call('/upload-folder')).phase, 'folder_uploaded')
        assert.equal((await call('/replace-html')).phase, 'ready')
      } else {
        if (before.run?.phase === 'ready') await call('/mark')
        else assert.ok(['marked','storage_verified'].includes(before.run?.phase), 'Only a known prepared/marked fixture may resume')
        let phase = before.run?.phase
        for (let tick = 0; tick < 11 && phase !== 'storage_verified'; tick++) phase = (await call('/cleanup')).phase
        assert.equal(phase, 'storage_verified')
        assert.equal((await call('/finalize')).phase, 'finalized')
      }
    } catch (error) { failure = error.message }
    const file = join(directory, `integration-${mode}-${randomUUID()}.json`)
    await writeFile(file, JSON.stringify({ classification: 'provider-integration-only-not-protected-workflow-acceptance', runId: config.vars.SOLO_RUN_ID,
      manifestSha256, success: !failure, failure, receipts }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    if (failure) throw new Error(`${failure}. Evidence retained: ${file}`)
    console.log(`PASS: ${mode}; evidence: ${file}. Protected workflow and all existing resources unchanged.`)
  }
} catch (error) { console.error(error.message); process.exitCode = 1 }
