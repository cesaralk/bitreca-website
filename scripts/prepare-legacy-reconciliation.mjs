// Local preparation only: no network, database access, signing or key access.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

export const dossierPath = 'C:/Users/cezar/Desktop/bitreca-deletion-review/production-legacy-object-proof-20261030.json'
export const dossierPin = '81426542792d2f9284ecc886341d6016c53c8a3cc6a3f2e980a5a78962415295'
export const target = Object.freeze({ account: '4ec868eac2a3b9127531ad39d2501f15', database: '8ff2d1f7-e747-4fe8-a6a3-87898e1ae79a', bucket: 'bitreca-media' })
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const ids = [5, 6, 7, 8, 9, 10]

export function validateDossier(dossier) {
  assert.deepEqual(dossier.target, target, 'Wrong production target')
  assert.equal(dossier.readOnly, true)
  assert.ok(Number.isFinite(Date.parse(dossier.observedAt)))
  assert.equal(dossier.eligible, false)
  assert.equal(dossier.externallyUntrackedWritersExcluded, false)
  assert.equal(dossier.completeUnregisteredHistoricalPrefixesExcluded, false)
  assert.equal(dossier.registeredSourceChainAndNoKnownForeignOverlap, true)
  assert.equal(dossier.allHaveOriginalBirthAndSeal, true)
  assert.deepEqual(dossier.portfolios.map(row => row.id).sort((a, b) => a - b), ids)
  assert.equal(dossier.allocations.length, 12)
  assert.equal(dossier.inventories.length, 12)
  const prefixes = new Set()
  for (const row of dossier.allocations) {
    assert.ok(ids.includes(row.portfolio_id) && typeof row.prefix === 'string' && row.prefix.endsWith('/'))
    assert.ok(!prefixes.has(row.prefix), 'Duplicate allocation prefix')
    for (const existing of prefixes) assert.ok(!existing.startsWith(row.prefix) && !row.prefix.startsWith(existing), 'Overlapping prefixes')
    prefixes.add(row.prefix)
    assert.equal(row.writer_protocol_version, 1)
    assert.equal(row.writer_state, 'closed')
    assert.ok(Number.isSafeInteger(row.writer_closed_at) && row.writer_closed_at > 0)
    assert.equal(row.immutable_event_matches, 1)
    assert.equal(row.overlapping_foreign_allocations, 0)
    assert.equal(row.overlapping_foreign_current_prefixes, 0)
  }
  const seenPrefixes = new Set(), seenKeys = new Set(), objects = []
  for (const inventory of dossier.inventories) {
    assert.equal(inventory.completeListing, true)
    assert.equal(inventory.objectOwnershipCertified, false)
    assert.ok(!seenPrefixes.has(inventory.prefix), 'Duplicate inventory prefix')
    seenPrefixes.add(inventory.prefix)
    const allocation = dossier.allocations.find(row => row.prefix === inventory.prefix)
    assert.ok(allocation && allocation.portfolio_id === inventory.portfolio_id)
    for (const object of inventory.objects) {
      assert.ok(typeof object.key === 'string' && object.key.startsWith(inventory.prefix) && !object.key.includes('\0'))
      assert.ok(!seenKeys.has(object.key), 'Duplicate object')
      seenKeys.add(object.key)
      assert.ok(Number.isSafeInteger(object.size) && object.size >= 0)
      assert.ok(typeof object.etag === 'string' && object.etag.length > 0)
      objects.push({ portfolio_id: inventory.portfolio_id, prefix: inventory.prefix, key: object.key, size: object.size, etag: object.etag })
    }
  }
  assert.deepEqual([...seenPrefixes].sort(), [...prefixes].sort())
  assert.equal(objects.length, 14)
  for (const portfolio of dossier.portfolios) {
    assert.equal(portfolio.status, 'published')
    assert.equal(portfolio.deletion_requested_at, null)
    assert.equal(portfolio.minimum_at_birth, 0)
    assert.equal(portfolio.epoch_id, null)
    assert.equal(portfolio.birth_identity_matches, 1)
    assert.equal(portfolio.initial_seal_matches, 1)
    const allocations = dossier.allocations.filter(row => row.portfolio_id === portfolio.id)
    assert.equal(allocations.length, 2)
    assert.ok(allocations.some(row => row.prefix === portfolio.storage_prefix))
    const birth = allocations.find(row => row.prefix === portfolio.initial_prefix)
    assert.ok(birth?.allocation_kind === 'initial' && birth.source_prefix === null)
    for (const allocation of allocations) assert.ok(allocation.source_prefix === null || allocations.some(row => row.prefix === allocation.source_prefix), 'Unresolved source chain')
  }
  return { format: 1, classification: 'LOCAL_UNSIGNED_BLOCKED_INPUTS', target,
    source: { sha256: dossierPin, observedAt: dossier.observedAt }, ids,
    registeredPrefixes: [...prefixes].sort(), exactObjects: objects.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    observed: { birthAndSealMatch: true, registeredWriterChainsClosed: true, noKnownForeignRegisteredOverlap: true, completeListingsOfRegisteredPrefixes: true },
    unsupportedAssertions: ['Exclusive ownership and custody of each exact object', 'Completeness of historical namespaces, including unregistered prefixes', 'Settlement or exclusion of all historical external/untracked writers'],
    requiredFreshInputs: ['Current immutable birth/allocation/publication snapshot', 'Production-scoped active enrolled policy/key/artifact and verified signed settlement epoch', 'Genuine ownership and historical-writer supporting evidence with hashes and chronology'],
    eligible: false, signingReady: false, imported: false, remoteMutations: false }
}

export function prepareLegacyReconciliation(bytes) {
  assert.equal(sha(bytes), dossierPin, 'Dossier digest differs from reviewed evidence')
  return validateDossier(JSON.parse(bytes))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 2, 'PLAN ONLY; no approval or mutation arguments accepted')
  console.log(JSON.stringify(prepareLegacyReconciliation(await readFile(dossierPath)), null, 2))
}
