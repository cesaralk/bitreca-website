import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fingerprint, validateRetainedBackupPin, confirmedBackupReceipt } from '../scripts/complete-generation3-backup.mjs'
const pin = { algorithm: 'ECDSA-P256-SHA256', signer_sha256: fingerprint,
  public_key_spki_base64: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEjK1/qWfJ8rrrJb5Gkw2AHDHrebjEDvs818xaORTykhwdD9Ogx6fvW2XKarDGcG4C3DTO0rZEiJL4AwTeawQfUg==' }
test('retained public material is bound to the exact generation-3 P-256 key', () => {
  assert.equal(validateRetainedBackupPin(pin), fingerprint)
  for (const patch of [{ algorithm: 'RSA' }, { signer_sha256: '0'.repeat(64) }, { public_key_spki_base64: 'AAAA' }]) assert.throws(() => validateRetainedBackupPin({ ...pin, ...patch }))
})
test('owner checks and current offline custody are separately mandatory; no fabricated prior timestamp', () => {
  const all = { approved: true, checksConfirmed: true, offlineConfirmed: true }
  for (const key of Object.keys(all)) assert.throws(() => confirmedBackupReceipt(pin, { ...all, [key]: false }, 123456789))
  assert.deepEqual(confirmedBackupReceipt(pin, all, 123456789), { operator: 'bitreca-owner', fingerprint,
    encryptedOfflineBackupVerified: true, passphraseRecoveryTested: true, verifiedAt: 123456789 })
  assert.throws(() => confirmedBackupReceipt(pin, all, -1))
})
