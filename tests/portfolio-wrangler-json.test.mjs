import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCliJson, parseCutoverAcknowledgment, parseCutoverReadback } from '../scripts/portfolio-wrangler-json.mjs'

const acknowledgment = [{ results: [], success: true, meta: { changes: 1, rows_written: 1, changed_db: true } }]
test('CLI parser accepts one intact JSON acknowledgment behind Unicode, mojibake, ANSI and warning progress output', () => {
  const output = '\uFEFF\u001b[33m┌ Wrangler progress ┐\u001b[0m\nΓö progress\n[WARNING] Non-JSON notice\n' + JSON.stringify(acknowledgment, null, 2) + '\nFinished\n'
  assert.deepEqual(parseCutoverAcknowledgment(output, 0), acknowledgment)
})
test('a failed or interrupted native process cannot be converted to success even with success-shaped JSON', () => {
  for (const exit of [1, 130, -1]) assert.throws(() => parseCutoverAcknowledgment(JSON.stringify(acknowledgment), exit))
  for (const output of ['', 'Γö progress only\n', '[\n{"success":true}', '[{"success":true}]\n[', '[{broken}]']) {
    assert.throws(() => parseCutoverAcknowledgment(output, 0))
  }
})
test('multiple JSON documents, trailing ambiguity and explicit errors fail closed', () => {
  for (const output of [JSON.stringify(acknowledgment) + '\n' + JSON.stringify(acknowledgment),
    JSON.stringify(acknowledgment) + ' extra', '[ERROR] failure\n' + JSON.stringify(acknowledgment)]) {
    assert.throws(() => parseCutoverAcknowledgment(output, 0))
  }
})
test('guarded zero-row results, failed responses and file-import counters never count as one protocol update', () => {
  for (const row of [
    { ...acknowledgment[0], success: false },
    { ...acknowledgment[0], meta: { changes: 0, rows_written: 0, changed_db: false } },
    { ...acknowledgment[0], meta: { changes: 2, rows_written: 1, changed_db: true } },
    { ...acknowledgment[0], finalBookmark: 'synthetic-import', results: [{ 'Total queries executed': 1 }] },
    { ...acknowledgment[0], meta: { changes: 1, rows_written: 2, changed_db: true } },
  ]) assert.throws(() => parseCutoverAcknowledgment(JSON.stringify([row]), 0))
})
test('read-only reconciliation proves protocol one without replaying the remote operation', () => {
  const state = { protocol: 1, generation: 1, revision: 1, cleanup: 0, finalization: 0 }
  const readback = { state, read_only: true, cutover_executed: false }
  assert.deepEqual(parseCutoverReadback('Γö status\n' + JSON.stringify(readback), 0), readback)
  assert.throws(() => parseCutoverReadback(JSON.stringify({ ...readback, state: { ...state, protocol: 0 } }), 0))
  assert.throws(() => parseCutoverReadback(JSON.stringify({ ...readback, state: { ...state, cleanup: 1 } }), 0))
  assert.throws(() => parseCutoverReadback(JSON.stringify(readback), 1))
})
test('JSON strings containing braces and escaped quotes are parsed without scanning nested documents as separate output', () => {
  const value = { data: '[{"text":"quoted \\" } ]"}]', nested: { value: true } }
  assert.deepEqual(parseCliJson(JSON.stringify(value, null, 2), 0), value)
})
