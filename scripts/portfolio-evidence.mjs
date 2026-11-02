import { readFile, writeFile, realpath } from 'node:fs/promises'
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { verifyStorageProtocolEvidence } from '../worker/portfolio-inventory.js'

// Offline tooling. Never connects to Cloudflare, imports epochs, or changes D1.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function publicKeyPin(publicKey) {
  const pem = Buffer.isBuffer(publicKey) ? publicKey.toString('utf8') : publicKey
  if (typeof pem !== 'string' || !pem.includes('-----BEGIN PUBLIC KEY-----') || pem.includes('PRIVATE KEY')) throw new Error('Supply an independently obtained PUBLIC PEM only.')
  const key = createPublicKey(pem)
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1') throw new Error('P-256 public key required.')
  const spki = key.export({ type: 'spki', format: 'der' })
  return { algorithm: 'ECDSA-P256-SHA256', public_key_spki_base64: spki.toString('base64'), signer_sha256: sha256(spki),
    warning: 'A fingerprint does not authenticate the auditor. Confirm it through an independent trusted channel before pinning.' }
}
export function canonicalReport(input) {
  if (input.version !== undefined && ![1, 2].includes(input.version)) throw new Error('Unknown evidence version.')
  if (input.version !== 2 && ['authorization_policy', 'policy_id', 'policy_generation', 'operator_id', 'operator_key_id',
    'deployment_verified_at', 'writers_fenced_at', 'writers_settled_at'].some(field => field in input)) {
    throw new Error('Solo policy fields require explicit version 2; conversion is forbidden.')
  }
  return JSON.stringify({ version: input.version === 2 ? 2 : 1, id: input.id,
    ...(input.version === 2 ? { authorization_policy: input.authorization_policy, policy_id: input.policy_id,
      policy_generation: input.policy_generation, operator_id: input.operator_id, operator_key_id: input.operator_key_id,
      deployment_verified_at: input.deployment_verified_at, writers_fenced_at: input.writers_fenced_at,
      writers_settled_at: input.writers_settled_at } : {}), storage_scope: input.storage_scope,
    writer_protocol: 1, deployment_sha256: input.deployment_sha256, evidence_sha256: input.evidence_sha256,
    legacy_writers_settled: input.legacy_writers_settled, verified_at: input.verified_at })
}

export function prepareSoloEnrollment({ publicKey, scope, deployment, policyId, generation, operatorId, enrolledAt }) {
  const pin = publicKeyPin(publicKey)
  pin.warning = 'SOLO operator key: compare this fingerprint directly on the offline owner signing machine. This provides no independent reviewer.'
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(policyId || '') ||
      !Number.isSafeInteger(generation) || generation < 1 || !/^[a-zA-Z0-9._@-]{1,100}$/.test(operatorId || '') ||
      !Number.isSafeInteger(enrolledAt) || enrolledAt < 0 || enrolledAt > Math.floor(Date.now() / 1000) ||
      !/^portfolioforest\/(staging|production)\/[a-z0-9-]+\/[0-9a-f-]{36}$/.test(scope || '')) throw new Error('Invalid enrollment identity.')
  const authorization = { authorizationPolicy: 'solo-operator-v1', policyId, policyGeneration: generation,
    operatorId, operatorKeyId: pin.signer_sha256, storageScope: scope, deploymentSha256: sha256(deployment), enrolledAt }
  // Values are validated above; quote scope defensively as well. No execution.
  const sqlText = value => "'" + value.replaceAll("'", "''") + "'"
  const enrollmentSQL = `INSERT INTO portfolio_storage_authorization_policies
    (id,generation,policy,operator_id,operator_key_id,storage_scope,deployment_sha256,enrolled_at)
    VALUES(${sqlText(policyId)},${generation},'solo-operator-v1',${sqlText(operatorId)},${sqlText(pin.signer_sha256)},${sqlText(scope)},${sqlText(authorization.deploymentSha256)},${enrolledAt});
UPDATE portfolio_storage_authorization_state SET policy='solo-operator-v1',generation=${generation},policy_id=${sqlText(policyId)} WHERE id=1;`
  return { authorization, publicKeyPin: pin, enrollmentSQL,
    environment: { PORTFOLIO_AUTHORIZATION_POLICY: authorization.authorizationPolicy,
      PORTFOLIO_AUTHORIZATION_POLICY_ID: policyId, PORTFOLIO_AUTHORIZATION_GENERATION: String(generation),
      PORTFOLIO_OPERATOR_ID: operatorId, PORTFOLIO_OPERATOR_KEY_ID: pin.signer_sha256,
      PORTFOLIO_DEPLOYMENT_SHA256: authorization.deploymentSha256, PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI: pin.public_key_spki_base64 },
    warning: 'SOLO OWNER APPROVAL, NOT INDEPENDENT REVIEW. No writer settlement is asserted. Review and archive outside the database before separate enrollment approval.' }
}
export async function verifyEvidencePackage({ evidence, publicKey, scope, deployment, audit, expectedSigner, authorization }) {
  if (authorization && authorization.storageScope !== scope) throw new Error('Scope differs from reviewed enrollment.')
  const spki = createPublicKey(publicKey).export({ type: 'spki', format: 'der' })
  const signature = Uint8Array.from(Buffer.from(evidence.signature_base64, 'base64'))
  const verified = await verifyStorageProtocolEvidence({ ...authorization, publicKeySpki: new Uint8Array(spki), storageScope: scope }, { payload: evidence.payload, signature })
  if (verified.report.version === 2 && (!Number.isSafeInteger(authorization?.enrolledAt) ||
      verified.report.deployment_verified_at < authorization.enrolledAt)) throw new Error('Evidence predates reviewed enrollment.')
  if (expectedSigner !== undefined && (!/^[0-9a-f]{64}$/.test(expectedSigner) || verified.signer !== expectedSigner)) throw new Error('Independent signer fingerprint differs.')
  if (verified.report.verified_at > Math.floor(Date.now() / 1000) ||
      verified.report.deployment_sha256 !== sha256(deployment) || verified.report.evidence_sha256 !== sha256(audit)) {
    throw new Error('Evidence time or artifact digests do not match.')
  }
  return verified
}
export async function signEvidence({ report, privateKey, deployment, audit, acknowledged, ownerAcknowledged, settlementAcknowledged, authorization }) {
  if (report.legacy_writers_settled !== true || (report.version === 2
    ? (!ownerAcknowledged || !settlementAcknowledged || acknowledged)
    : (!acknowledged || ownerAcknowledged))) throw new Error('Correct policy and writer-settlement acknowledgement required.')
  const key = createPrivateKey(privateKey)
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1') throw new Error('An external P-256 signing key is required.')
  const payload = canonicalReport(report)
  const signature = sign('sha256', Buffer.from(payload), { key, dsaEncoding: 'ieee-p1363' })
  const evidence = { payload, signature_base64: signature.toString('base64') }
  await verifyEvidencePackage({ evidence, publicKey: createPublicKey(key).export({ type: 'spki', format: 'pem' }),
    scope: report.storage_scope, deployment, audit, authorization })
  return evidence
}
async function main(args) {
  const command = args[0]
  if (!command || command === '--help') {
    console.log('Offline only: public-pin --public-key PUBLIC_PEM --out NEW_FILE; enroll-solo --public-key PUBLIC_PEM --scope SCOPE --deployment FILE --policy-id UUID --generation INTEGER --operator ID --enrolled-at UNIXTIME --out NEW_FILE; sign|verify --report FILE (sign) --evidence FILE (verify) --public-key FILE (verify) --expected-signer SHA256 (verify) --private-key FILE (sign, outside repository) --scope SCOPE --deployment FILE --audit FILE --out NEW_FILE (sign). Independent v1: --acknowledge-independent-audit. Solo v2: --authorization REVIEWED_PINS_JSON plus --acknowledge-owner-responsibility --acknowledge-writer-settlement-evidence. Private keys are never printed. No key generation, cutover, epoch import, or Cloudflare access is performed.')
    return
  }
  const options = {}
  for (let index = 1; index < args.length; index++) {
    const name = args[index]
    if (!name.startsWith('--')) throw new Error('Invalid arguments.')
    options[name.slice(2)] = ['--acknowledge-independent-audit', '--acknowledge-owner-responsibility', '--acknowledge-writer-settlement-evidence'].includes(name) ? true : args[++index]
  }
  if (command === 'public-pin') {
    const pin = publicKeyPin(await readFile(options['public-key']))
    await writeFile(options.out, JSON.stringify(pin, null, 2) + '\n', { flag: 'wx' })
    console.log('Public SPKI pin and fingerprint written to a new file. No runtime configuration changed.')
    return
  }
  if (command === 'enroll-solo') {
    const result = prepareSoloEnrollment({ publicKey: await readFile(options['public-key']), scope: options.scope,
      deployment: await readFile(options.deployment), policyId: options['policy-id'], generation: Number(options.generation),
      operatorId: options.operator, enrolledAt: Number(options['enrolled-at']) })
    await writeFile(options.out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
    console.log('Public enrollment proposal written. Review enrollmentSQL and environment; extract authorization to a separate reviewed pin file. No enrollment was executed.')
    return
  }
  if (!['sign', 'verify'].includes(command) || !options.scope) throw new Error('Use --help for the required arguments.')
  const deployment = await readFile(options.deployment), audit = await readFile(options.audit)
  // A separately reviewed enrollment/pin file is mandatory for solo evidence;
  // policy pins are never inferred from the report being signed or verified.
  const authorization = options.authorization ? JSON.parse(await readFile(options.authorization, 'utf8')) : undefined
  if (command === 'sign') {
    const keyPath = await realpath(options['private-key'])
    const inside = relative(repository, keyPath)
    if (!isAbsolute(inside) && inside !== '..' && !inside.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) {
      throw new Error('Signing keys must remain outside the repository.')
    }
    const report = JSON.parse(await readFile(options.report, 'utf8'))
    if (report.storage_scope !== options.scope) throw new Error('Storage scope does not match the reviewed report.')
    const evidence = await signEvidence({ report, privateKey: await readFile(keyPath), deployment, audit,
      acknowledged: options['acknowledge-independent-audit'] === true,
      ownerAcknowledged: options['acknowledge-owner-responsibility'] === true,
      settlementAcknowledged: options['acknowledge-writer-settlement-evidence'] === true, authorization })
    await writeFile(options.out, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    console.log('Signed evidence written to a new file. No runtime policy or database was changed.')
  } else {
    await verifyEvidencePackage({ evidence: JSON.parse(await readFile(options.evidence, 'utf8')),
      publicKey: await readFile(options['public-key']), scope: options.scope, deployment, audit, expectedSigner: options['expected-signer'], authorization })
    console.log('Signature, scope, time, and both artifact digests verified. This does not independently establish the truth of the audit.')
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { console.error('Evidence operation refused. Check the arguments, pinned key, scope, digests, and independent audit. No key material is printed.'); process.exitCode = 1 })
}
