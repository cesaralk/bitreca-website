// Local receipt completion only: no private-key, USB, credential or network access.
import assert from 'node:assert/strict'
import { readFile, lstat, realpath, open } from 'node:fs/promises'
import { createHash, createPublicKey } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

export const fingerprint = '7e0d344e4de13d5cdd773482346ef7e3d5c57d411555bdf4db7f0ed028214a4e'
const review = 'C:/Users/cezar/Desktop/bitreca-deletion-review'
const paths = { pin: join(review, 'generation3-backup-public-pin.json'),
  receipt: join(review, 'generation3-backup-confirmation.json'),
  evidence: join(review, 'generation3-backup-completion-evidence.json'),
  plan: join(review, 'generation3-enroll3-plan.json') }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export function validateRetainedBackupPin(pin) {
  assert.equal(pin.algorithm, 'ECDSA-P256-SHA256')
  assert.equal(pin.signer_sha256, fingerprint, 'Retained public fingerprint differs; private re-verification required')
  assert.match(pin.public_key_spki_base64, /^[A-Za-z0-9+/]+={0,2}$/)
  const bytes = Buffer.from(pin.public_key_spki_base64, 'base64')
  assert.equal(bytes.toString('base64'), pin.public_key_spki_base64)
  const key = createPublicKey({ key: bytes, format: 'der', type: 'spki' })
  assert.equal(key.asymmetricKeyType, 'ec'); assert.equal(key.asymmetricKeyDetails.namedCurve, 'prime256v1')
  assert.equal(hash(key.export({ type: 'spki', format: 'der' })), fingerprint)
  return fingerprint
}
export function confirmedBackupReceipt(pin, confirmation, now) {
  validateRetainedBackupPin(pin)
  assert.equal(confirmation.approved, true, 'Explicit local receipt-completion approval required')
  assert.equal(confirmation.checksConfirmed, true, 'Owner must confirm prior integrity/recovery checks reached the final custody prompt')
  assert.equal(confirmation.offlineConfirmed, true, 'Explicit current physical unplugging/offline-custody confirmation required')
  assert.ok(Number.isSafeInteger(now) && now > 0)
  return { operator: 'bitreca-owner', fingerprint, encryptedOfflineBackupVerified: true,
    passphraseRecoveryTested: true, verifiedAt: now }
}
async function requireAbsent(path) {
  try { await lstat(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  throw new Error('Existing output must be preserved; no overwrite or automatic retry')
}
async function writeNew(path, value) {
  const file = await open(path, 'wx')
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync() } finally { await file.close() }
}
async function assertRealPath(path) {
  let current = resolve(path)
  for (;;) {
    assert.ok(!(await lstat(current)).isSymbolicLink(), 'Reparse/symlink path forbidden')
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  assert.equal((await realpath(path)).toLowerCase(), resolve(path).toLowerCase(), 'Redirected path forbidden')
}
export async function completeBackup(args) {
  const allowed = ['--plan', '--approved-completion', '--prior-checks-confirmed', '--offline-custody-confirmed']
  assert.ok(args.every(arg => allowed.includes(arg)) && new Set(args).size === args.length, 'Unknown or duplicate argument')
  await assertRealPath(review); await assertRealPath(paths.pin)
  const bytes = await readFile(paths.pin), pin = JSON.parse(bytes)
  validateRetainedBackupPin(pin)
  await requireAbsent(paths.receipt); await requireAbsent(paths.evidence)
  if (!args.includes('--approved-completion')) return { planOnly: true, retainedPublicPinVerified: true, fingerprint,
    required: 'Owner confirmation of prior checks reaching final prompt AND current unplugged offline custody', writes: false, network: false }
  const now = Math.floor(Date.now() / 1000)
  const receipt = confirmedBackupReceipt(pin, { approved: true,
    checksConfirmed: args.includes('--prior-checks-confirmed'), offlineConfirmed: args.includes('--offline-custody-confirmed') }, now)
  await writeNew(paths.evidence, { completedAt: now, operator: 'bitreca-owner',
    observed: { publicPinFile: paths.pin, publicPinSha256: hash(bytes), fingerprint },
    ownerConfirmed: { priorCiphertextIntegrityMatched: true, backupCopyUnlockedAndPublicPinVerified: true,
      reachedFinalOfflineCustodyPrompt: true, stoppedOnlyForMissingConfirmationInput: true,
      usbSafelyEjectedPhysicallyUnpluggedAndInOfflineCustody: true },
    basis: 'Explicit first-person owner confirmation plus retained public-key output; not an independently retained cryptographic log of the earlier copy/unlock checks',
    privateReverificationRun: false, privateMaterialAccessed: false, networkAccessed: false })
  await writeNew(paths.receipt, receipt)
  let oldPlanExpired = true
  try {
    const plan = JSON.parse(await readFile(paths.plan, 'utf8'))
    oldPlanExpired = !Number.isSafeInteger(plan.createdAt) || Date.now() < plan.createdAt || Date.now() - plan.createdAt >= 30 * 60 * 1000
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const nextPath = join(review, `generation3-enroll3-after-backup-${now}.json`)
  return { completed: 'backup-confirmation', receipt: paths.receipt, evidence: paths.evidence, fingerprint, verifiedAt: now,
    oldPlanExpired, cloudflareAccessed: false, enrolled: false,
    nextReadOnlyPreflight: oldPlanExpired ? `node scripts/execute-generation3-recovery.mjs --stage enroll3 --preflight "${nextPath}"` : 'Existing plan may be reused only after local digest/freshness review',
    enrollmentApprovalTemplate: `node scripts/execute-generation3-recovery.mjs --stage enroll3 --execute "${oldPlanExpired ? nextPath : paths.plan}" --sha256 <REVIEWED_VALID_PLAN_SHA256> --approved-stage enroll3 --backup-receipt "${paths.receipt}"` }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  completeBackup(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(`Receipt completion stopped: ${error.message}. Preserve existing files; no automatic retry.`); process.exitCode = 1
  })
}
