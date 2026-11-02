import assert from 'node:assert/strict'

// Sequencing primitive only. No built-in network or configuration mutator.
// An explicitly reviewed operator-only transport is required before live use.
export async function controlledEvidenceImport({ approvedImport, operatorAccessVerified, verifyClosed, open,
  verifyOpen, postOnce, restore, verifyRestored, verifyEpoch }) {
  assert.equal(approvedImport, true, 'Separate import approval required.')
  assert.equal(operatorAccessVerified, true, 'Verified operator-only access is required before unfreezing.')
  await verifyClosed()
  let attemptedOpen = false
  try {
    attemptedOpen = true
    await open()
    await verifyOpen()
    await postOnce()
  } finally {
    // Even a lost open/import response may follow an applied remote change.
    // Restore once, then verify. Never replay import or pretend restoration worked.
    if (attemptedOpen) { await restore(); await verifyRestored() }
  }
  // Close the window before inspecting the persisted epoch. A slow/failed
  // readback must not leave import enabled or portfolio mutations unfrozen.
  await verifyEpoch()
  return { state: 'imported-and-restored' }
}
