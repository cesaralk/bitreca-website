import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareLegacyReconciliation, validateDossier, target } from '../scripts/prepare-legacy-reconciliation.mjs'

function fixture() {
  const portfolios = [], allocations = [], inventories = []
  for (let id = 5; id <= 10; id++) {
    const initial = `initial/${id}/`, current = `versions/${id}/`
    portfolios.push({ id, status: 'published', deletion_requested_at: null, minimum_at_birth: 0, epoch_id: null, birth_identity_matches: 1, initial_seal_matches: 1, initial_prefix: initial, storage_prefix: current })
    for (const [prefix, source, kind] of [[initial, null, 'initial'], [current, initial, 'folder']]) {
      allocations.push({ portfolio_id: id, prefix, source_prefix: source, allocation_kind: kind, writer_protocol_version: 1, writer_state: 'closed', writer_closed_at: 1, immutable_event_matches: 1, overlapping_foreign_allocations: 0, overlapping_foreign_current_prefixes: 0 })
      const count = prefix === current ? (id === 10 ? 4 : 2) : 0
      inventories.push({ portfolio_id: id, prefix, completeListing: true, objectOwnershipCertified: false, objects: Array.from({ length: count }, (_, index) => ({ key: `${prefix}${index}.html`, size: 1, etag: `etag-${index}` })) })
    }
  }
  return { target: { ...target }, observedAt: '2026-10-30T13:47:32.565Z', readOnly: true, portfolios, allocations, inventories, eligible: false, externallyUntrackedWritersExcluded: false, completeUnregisteredHistoricalPrefixesExcluded: false, registeredSourceChainAndNoKnownForeignOverlap: true, allHaveOriginalBirthAndSeal: true }
}

test('local dossier plan preserves unsupported facts and all fourteen exact objects', () => {
  const plan = validateDossier(fixture())
  assert.equal(plan.exactObjects.length, 14)
  assert.equal(plan.registeredPrefixes.length, 12)
  assert.equal(plan.eligible, false)
  assert.equal(plan.signingReady, false)
  assert.equal(plan.remoteMutations, false)
  assert.equal(plan.unsupportedAssertions.length, 3)
})
test('modified pinned bytes and wrong production identity fail closed', () => {
  assert.throws(() => prepareLegacyReconciliation(Buffer.from('{}')), /digest/)
  const dossier = fixture(); dossier.target.database = 'wrong'
  assert.throws(() => validateDossier(dossier), /target/)
})
test('invented ownership or writer settlement never becomes a ready plan', () => {
  for (const field of ['eligible', 'externallyUntrackedWritersExcluded', 'completeUnregisteredHistoricalPrefixesExcluded']) {
    const dossier = fixture(); dossier[field] = true
    assert.throws(() => validateDossier(dossier))
  }
  const dossier = fixture(); dossier.inventories[0].objectOwnershipCertified = true
  assert.throws(() => validateDossier(dossier))
})
test('foreign or duplicate object and prefix identities are rejected', () => {
  const foreign = fixture(); foreign.inventories[1].objects[0].key = 'foreign/key'
  assert.throws(() => validateDossier(foreign))
  const duplicate = fixture(); duplicate.inventories[1].objects[1].key = duplicate.inventories[1].objects[0].key
  assert.throws(() => validateDossier(duplicate), /Duplicate/)
  const overlap = fixture(); overlap.allocations[1].prefix = overlap.allocations[0].prefix + 'nested/'
  assert.throws(() => validateDossier(overlap), /Overlapping/)
})
test('uncertain writers, unresolved source chains and changed births stay blocked', () => {
  const uncertain = fixture(); uncertain.allocations[0].writer_state = 'uncertain'
  assert.throws(() => validateDossier(uncertain))
  const chain = fixture(); chain.allocations[1].source_prefix = 'unknown/'
  assert.throws(() => validateDossier(chain), /source chain/)
  const birth = fixture(); birth.portfolios[0].minimum_at_birth = 1
  assert.throws(() => validateDossier(birth))
})
