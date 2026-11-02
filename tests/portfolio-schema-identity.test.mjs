import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeSchemaLineEndings as normalize } from '../scripts/portfolio-schema-identity.mjs'
test('schema identity permits only nonliteral CRLF transport differences', () => {
  assert.equal(normalize('CREATE TABLE a (\r\nid INTEGER\r\n)'), 'CREATE TABLE a (\nid INTEGER\n)')
  assert.notEqual(normalize("CHECK(x='a\r\nb')"), normalize("CHECK(x='a\nb')"))
  assert.notEqual(normalize('CREATE TABLE "a\r\nb"(x)'), normalize('CREATE TABLE "a\nb"(x)'))
  assert.notEqual(normalize('CHECK(x=1)'), normalize('CHECK(x=2)'))
  assert.equal(normalize("-- don't interpret quote\r\nCREATE TABLE a(x)"), "-- don't interpret quote\nCREATE TABLE a(x)")
  assert.equal(normalize(null), null)
})
test('retained exact sandbox schema differences are exclusively transport line endings', async () => {
  const receipt = JSON.parse(await readFile('C:/Users/cezar/Desktop/bitreca-deletion-review/generation3-schema-reconciliation.json', 'utf8'))
  assert.equal(receipt.readOnly, true)
  assert.equal(receipt.differences.length, 2)
  for (const { actual, expected } of receipt.differences) {
    assert.deepEqual({ ...actual, sql: normalize(actual.sql) }, { ...expected, sql: normalize(expected.sql) })
  }
})
