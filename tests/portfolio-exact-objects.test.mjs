import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createExactObjectGuard } from '../worker/portfolio-exact-objects.js'
import { executeCleanupStep } from '../worker/portfolio-cleanup-executor.js'

const prefix = 'portfolio-versions/5/exact/'
const object = { prefix, key: prefix + 'index.html', size: 12, etag: 'abc123' }
const jobId = '11111111-1111-4111-8111-111111111111'
const token = 'a'.repeat(32)
const configBlocked = error => error?.code === 'CONFIGURATION_BLOCKED'

// SQL is not the authority under test here: this mock supplies an eligible,
// fenced job and retains real executor intents/receipts across invocations.
function eligibleJob({ keys, receipted = false, native = false, bound = true, current = true, schema = true, manifestHash } = {}) {
  const report = { id: jobId, report_type: 'legacy-portfolio-reconciliation', prefixes: [prefix], objects: [object],
    manifest_sha256: manifestHash || createHash('sha256').update(JSON.stringify({ prefixes: [prefix], objects: [object] })).digest('hex') }
  const state = { mutations: 0, batch: keys ? { id: jobId, prefix, keys_json: JSON.stringify(keys) } : null, receipt: receipted, empty: false }
  const db = {
    prepare(sql) {
      return {
        bind(...args) { this.args = args; return this },
        async run() {
          state.mutations++
          if (sql.includes('INSERT INTO portfolio_deletion_batches')) {
            state.batch = { id: this.args[0], prefix: this.args[1], keys_json: this.args[2] }
          }
          if (sql.includes('INSERT INTO portfolio_deletion_batch_receipts')) state.receipt = true
          if (sql.includes('INSERT INTO portfolio_deletion_prefix_receipts')) state.empty = true
          return { success: true, meta: { changes: 1 } }
        },
        async first() {
          if (sql.includes('sqlite_schema')) return schema ? { name: 'portfolio_legacy_inventory_bindings' } : null
          if (sql.includes('SELECT o.minimum_at_birth,b.reconciliation_id')) return {
            minimum_at_birth: native ? 1 : 0, reconciliation_id: native || !bound ? null : jobId,
            manifest_sha256: current ? report.manifest_sha256 : null, evidence_json: current ? JSON.stringify(report) : null,
          }
          if (sql.includes('SELECT generation, lease_expires_at')) return { generation: 1, lease_expires_at: 9999999999 }
          if (sql.includes('SELECT b.id, b.prefix, b.keys_json')) return state.receipt ? null : state.batch
          if (sql.includes('SELECT b.job_id, b.prefix, b.keys_json')) return state.batch && { job_id: jobId, ...state.batch }
          if (sql.includes('SELECT r.batch_id')) return state.receipt ? { batch_id: state.batch.id } : null
          if (sql.includes('SELECT a.prefix')) return state.empty ? null : { prefix }
          assert.fail('Unexpected mock query: ' + sql)
        },
        async all() {
          assert.ok(sql.includes('json_each(b.keys_json)'))
          return { success: true, results: state.receipt ? JSON.parse(state.batch.keys_json).map(key => ({ key })) : [] }
        },
      }
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())) },
  }
  return { db, state }
}
const invoke = (db, r2, extra = {}) => executeCleanupStep({ db, r2, jobId, token, maxOperations: 2, exactInventory: [object], ...extra })
function storage({ head = object, page = [object], lostDelete = false } = {}) {
  const calls = []
  return {
    calls,
    async list(options) { calls.push(['list', options]); return { objects: page, truncated: false } },
    async head(key) { calls.push(['head', key]); return head },
    async delete(keys) { calls.push(['delete', keys]); if (lostDelete) throw new Error('Lost DELETE response') },
  }
}

test('exact guard rejects malformed, duplicate and foreign inventory membership', () => {
  for (const inventory of [null, [object, object], [{ ...object, key: 'foreign/index.html' }], [{ ...object, size: -1 }], [{ ...object, etag: '"quoted"' }]]) {
    assert.throws(() => createExactObjectGuard(inventory), configBlocked)
  }
  const guard = createExactObjectGuard([object])
  assert.throws(() => guard.assertBatch([object.key], 'foreign/'), configBlocked)
  assert.throws(() => guard.assertBatch([object.key, object.key], prefix), configBlocked)
})

test('exact guard rejects every unknown, changed-size or changed-ETag listing object', () => {
  const guard = createExactObjectGuard([object])
  for (const actual of [{ ...object, key: prefix + 'unknown' }, { ...object, size: 13 }, { ...object, etag: 'changed' }]) {
    assert.throws(() => guard.assertPage({ objects: [object, actual] }, prefix), configBlocked)
  }
})

test('exact executor progresses singleton intent with separately budgeted list and HEAD/delete', async () => {
  const { db, state } = eligibleJob()
  const r2 = storage()
  assert.equal((await invoke(db, r2)).state, 'pending')
  assert.deepEqual(r2.calls.map(call => call[0]), ['list'])
  assert.deepEqual(JSON.parse(state.batch.keys_json), [object.key])
  r2.calls.length = 0
  assert.equal((await invoke(db, r2)).state, 'pending')
  assert.deepEqual(r2.calls.map(call => call[0]), ['head', 'delete'])
  assert.equal(state.receipt, true)
})

test('one-operation exact configuration blocks before any storage or database operation', async () => {
  const r2 = storage()
  const result = await invoke({ prepare() { assert.fail('No database mutation permitted') } }, r2, { maxOperations: 1 })
  assert.equal(result.error.code, 'CONFIGURATION_BLOCKED')
  assert.deepEqual(r2.calls, [])
})

test('persisted unknown or multi-key batches cannot bypass signed exact inventory', async () => {
  for (const keys of [[prefix + 'unknown'], [object.key, prefix + 'second']]) {
    const { db, state } = eligibleJob({ keys })
    const r2 = storage()
    assert.equal((await invoke(db, r2)).state, 'blocked')
    assert.deepEqual(r2.calls, [])
    assert.equal(state.receipt, false)
  }
})

test('a changed object between listing and persisted intent cannot be deleted', async () => {
  const { db, state } = eligibleJob({ keys: [object.key] })
  const r2 = storage({ head: { ...object, etag: 'changed' } })
  assert.equal((await invoke(db, r2)).error.code, 'CONFIGURATION_BLOCKED')
  assert.deepEqual(r2.calls.map(call => call[0]), ['head'])
  assert.equal(state.receipt, false)
})

test('lost DELETE response preserves intent and rechecks identity before idempotent replay', async () => {
  const { db, state } = eligibleJob({ keys: [object.key] })
  const failed = storage({ lostDelete: true })
  assert.equal((await invoke(db, failed)).state, 'retry_wait')
  assert.equal(state.receipt, false)
  assert.deepEqual(failed.calls.map(call => call[0]), ['head', 'delete'])
  const replay = storage({ head: null })
  assert.equal((await invoke(db, replay)).state, 'pending')
  assert.equal(state.receipt, true)
  assert.deepEqual(replay.calls.map(call => call[0]), ['head', 'delete'])
})

test('unknown storage object blocks before any new intent or deletion', async () => {
  const { db, state } = eligibleJob()
  const r2 = storage({ page: [{ ...object, key: prefix + 'unexpected' }] })
  assert.equal((await invoke(db, r2)).state, 'blocked')
  assert.equal(state.batch, null)
  assert.deepEqual(r2.calls.map(call => call[0]), ['list'])
})

test('empty prefix does not certify deletion of signed objects without exact receipts', async () => {
  const { db, state } = eligibleJob()
  const r2 = storage({ page: [] })
  assert.equal((await invoke(db, r2)).state, 'blocked')
  assert.equal(state.empty, false)
  assert.deepEqual(r2.calls.map(call => call[0]), ['list'])
})

test('exact receipts plus empty listing permit existing storage receipt mechanism', async () => {
  const { db, state } = eligibleJob({ keys: [object.key], receipted: true })
  const r2 = storage({ page: [] })
  assert.equal((await invoke(db, r2)).state, 'storage_verified')
  assert.equal(state.empty, true)
  assert.deepEqual(r2.calls.map(call => call[0]), ['list'])
})

test('native executor retains multi-object batches without requiring HEAD', async () => {
  const keys = [prefix + 'a', prefix + 'b']
  const { db } = eligibleJob({ keys, native: true })
  const calls = []
  const r2 = { async list() { calls.push('list'); return { objects: [], truncated: false } }, async delete(actual) { assert.deepEqual(actual, keys); calls.push('delete') } }
  const result = await invoke(db, r2, { exactInventory: undefined, maxOperations: 1 })
  assert.equal(result.state, 'pending')
  assert.deepEqual(calls, ['delete'])
})
test('bound legacy job cannot omit optional exactInventory to downgrade cleanup', async () => {
  const { db, state } = eligibleJob({ keys: [object.key] })
  const r2 = storage()
  const result = await invoke(db, r2, { exactInventory: undefined })
  assert.equal(result.error.code, 'CONFIGURATION_BLOCKED')
  assert.equal(state.mutations, 0)
  assert.deepEqual(r2.calls, [])
})

test('legacy job without immutable binding or with stale current authority blocks', async () => {
  for (const options of [{ bound: false }, { current: false }]) {
    const { db, state } = eligibleJob({ keys: [object.key], ...options })
    const r2 = storage()
    assert.equal((await invoke(db, r2)).state, 'blocked')
    assert.equal(state.mutations, 0)
    assert.deepEqual(r2.calls, [])
  }
})

test('supplied inventory must exactly match immutable database authority metadata', async () => {
  const { db, state } = eligibleJob({ keys: [object.key] })
  const r2 = storage()
  assert.equal((await invoke(db, r2, { exactInventory: [{ ...object, etag: 'substituted' }] })).state, 'blocked')
  assert.equal(state.mutations, 0)
  assert.deepEqual(r2.calls, [])
})

test('retained manifest digest must recompute from its signed prefixes and objects', async () => {
  const { db, state } = eligibleJob({ manifestHash: '0'.repeat(64), keys: [object.key] })
  const r2 = storage()
  assert.equal((await invoke(db, r2)).state, 'blocked')
  assert.equal(state.mutations, 0)
  assert.deepEqual(r2.calls, [])
})

test('unbound native job rejects an unattached legacy inventory hook', async () => {
  const { db, state } = eligibleJob({ native: true, keys: [object.key] })
  const r2 = storage()
  assert.equal((await invoke(db, r2)).state, 'blocked')
  assert.equal(state.mutations, 0)
  assert.deepEqual(r2.calls, [])
})

test('pre-0017 native jobs retain ordinary executor behavior without an exact hook', async () => {
  const { db } = eligibleJob({ schema: false, native: true, keys: [object.key] })
  const r2 = storage()
  assert.equal((await invoke(db, r2, { exactInventory: undefined, maxOperations: 1 })).state, 'pending')
  assert.deepEqual(r2.calls.map(call => call[0]), ['delete'])
})