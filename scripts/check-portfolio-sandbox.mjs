import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { sandboxResources, validateSandboxPair } from './check-portfolio-config.mjs'
import { quotePowerShell } from './portfolio-staging-plan.mjs'
import { verifyStagingPackage } from './prepare-portfolio-staging.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const sandboxScope = `portfolioforest/staging/${sandboxResources.bucket}/${sandboxResources.databaseId}`
export const sandboxProtocolCutoverSQL = `UPDATE portfolio_storage_writer_policy
SET minimum_protocol_version=1
WHERE id=1 AND minimum_protocol_version=0
 AND NOT EXISTS(SELECT 1 FROM portfolios)
 AND NOT EXISTS(SELECT 1 FROM portfolio_storage_allocations)
 AND NOT EXISTS(SELECT 1 FROM portfolio_storage_origins)
 AND NOT EXISTS(SELECT 1 FROM portfolio_storage_birth_seals)
 AND NOT EXISTS(SELECT 1 FROM portfolio_storage_allocation_events)
 AND NOT EXISTS(SELECT 1 FROM portfolio_deletion_jobs)
 AND NOT EXISTS(SELECT 1 FROM portfolio_storage_protocol_verifications)
 AND NOT EXISTS(SELECT 1 FROM portfolio_deletion_finalizations)
 AND EXISTS(SELECT 1 FROM portfolio_deletion_runtime_policy WHERE id=1 AND revision=0 AND cleanup_enabled=0 AND finalization_enabled=0);`

// Prints commands only; this module has no subprocess or HTTP execution path.
export async function prepareSandboxTrustPlan(evidenceDirectory) {
  const candidate = 'C:\\Users\\cezar\\Desktop\\bitreca-deletion-review\\candidate-module-discovery-off-20261027'
  const pin = '9cce8a7419f15e1bd67f78c81980ed980f9f3f88aeb322371dfaeca621ebf199'
  assert.equal((await verifyStagingPackage(candidate)).artifactSha256, pin)
  const access = JSON.parse(await readFile(join(evidenceDirectory, 'sandbox-access-namespace.json'), 'utf8'))
  assert.equal(access.http_status, 200); assert.equal(access.success, true)
  assert.match(access.result.subdomain, /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
  assert.equal(access.result.subdomain, 'ceasar-elkhatib', 'Provider namespace differs from the reviewed sandbox account')
  const origin = `https://${sandboxResources.mainName}.${access.result.subdomain}.workers.dev`
  const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js')
  const command = args => '& ' + [process.execPath, wrangler, ...args, '--config', join(candidate, 'main.wrangler.jsonc')].map(quotePowerShell).join(' ')
  const execute = sql => command(['d1', 'execute', sandboxResources.databaseName, '--remote', '--json', '--command', sql])
  const cutover = [
    "if ($ApprovedProtocol1 -ne $true -or $IndependentWriterAuditApproved -ne $true) { throw 'Separate protocol approval AND genuine independent writer audit are required.' }",
    "$env:CLOUDFLARE_ACCOUNT_ID = '4ec868eac2a3b9127531ad39d2501f15'",
    `$packageText = & ${[process.execPath, join(root, 'scripts/prepare-portfolio-staging.mjs'), '--verify', candidate].map(quotePowerShell).join(' ')}`,
    "if ($LASTEXITCODE -ne 0) { throw 'Pinned package verification failed' }",
    `$package = ($packageText -join "\u0060n") | ConvertFrom-Json; if ($package.artifactSha256 -cne '${pin}') { throw 'Package pin mismatch' }`,
    `$cutoverText = ${execute(sandboxProtocolCutoverSQL)}`,
    "if ($LASTEXITCODE -ne 0) { throw 'Cutover response unresolved; read state, do not retry blindly' }",
    '$cutover = ($cutoverText -join "`n") | ConvertFrom-Json',
    "if (-not $cutover[0].success -or $cutover[0].meta.changes -ne 1) { throw 'Expected one cutover row; inspect state without bypassing guard' }",
    `$readbackText = ${execute('SELECT minimum_protocol_version FROM portfolio_storage_writer_policy WHERE id=1;')}`,
    "if ($LASTEXITCODE -ne 0) { throw 'Protocol readback unavailable; keep execution disabled' }",
    '$readback = ($readbackText -join "`n") | ConvertFrom-Json',
    "if (-not $readback[0].success -or $readback[0].meta.rows_written -ne 0 -or $readback[0].results[0].minimum_protocol_version -ne 1) { throw 'Protocol 1 was not independently read back; stop' }",
  ].join('\n')
  const importCommand = [
    "if ($ApprovedEvidenceImport -ne $true) { throw 'Separate evidence-import approval required' }",
    `if ($ApprovedSandboxOrigin -cne '${origin}') { throw 'Exact approved sandbox origin required' }`,
    "if (-not $SandboxSession -or $IndependentSignerSHA256 -cnotmatch '^[0-9a-f]{64}$') { throw 'Authenticated operator session and independently confirmed public-key fingerprint required' }",
    `& ${[process.execPath, join(root, 'scripts/portfolio-evidence.mjs'), 'verify'].map(quotePowerShell).join(' ')} --evidence $SignedEvidence --public-key $IndependentPublicKey --expected-signer $IndependentSignerSHA256 --scope '${sandboxScope}' --deployment '${join(candidate, 'deployment-artifact.json')}' --audit $IndependentAudit`,
    "if ($LASTEXITCODE -ne 0) { throw 'Signed evidence failed independent pin/scope/artifact/audit verification' }",
    '$body = [System.IO.File]::ReadAllBytes($SignedEvidence)',
    "if ($body.Length -gt 32768) { throw 'Evidence body exceeds server bound' }",
    `Invoke-WebRequest -UseBasicParsing -Method Post -Uri '${origin}/api/admin/portfolio-protocol-evidence' -WebSession $SandboxSession -Headers @{Origin='${origin}'} -ContentType 'application/json' -Body $body -MaximumRedirection 0`,
  ].join('\n')
  return { mode: 'OFFLINE COMMAND PREPARATION ONLY; NOTHING EXECUTED', account: '4ec868eac2a3b9127531ad39d2501f15',
    resources: sandboxResources, scope: sandboxScope, candidateManifestSha256: pin, origin,
    protocolStage: { approval: 'Approve monotonic protocol 0->1 only after independent settlement/authority findings. All other gates stay off.', sql: sandboxProtocolCutoverSQL, command: cutover },
    importStage: { approval: 'Separate approved public-pin/config/access changes and temporary import/unfreeze. This plan does not change them.', command: importCommand,
      before: ['Independently verify auditor public-key fingerprint and retain genuine signed audit.',
        'Read back protocol 1, exact server public pin, cleanup/finalization/schedule/marking off, and restricted approved access.',
        'The mutation freeze blocks import: lift it only for the approved operation, with ingress restricted. Current public access remains off.'],
      after: ['Read back the immutable protocol epoch; disable import and re-freeze under the same approved control-change plan.',
        'Retain version IDs/config hashes linking control-only changes to the audited writer artifact.'] },
    next: 'Separately approve post-epoch disposable creation/uploads/marking; then cleanup policy/Cron, and finally finalization per existing E2E matrix.',
    limitations: ['These commands do not establish audit truth or grant approval.', 'A zero-row cutover never permits bypassing its conditions.', 'No deployment or credential/permission changes are included.'] }
}
// SELECT only. No credentials, sessions, customer content or object keys.
export const sandboxReadinessSQL = `SELECT
  (SELECT json_group_array(name) FROM (SELECT name FROM d1_migrations ORDER BY name)) AS migrations,
  (SELECT count(*) FROM portfolios) AS portfolios,
  (SELECT count(*) FROM portfolio_storage_allocations) AS allocations,
  (SELECT count(*) FROM portfolio_storage_allocations WHERE writer_state IN ('open','uncertain') OR writer_protocol_version<>1 OR writer_state IS NULL) AS unsettled_or_untracked,
  (SELECT minimum_protocol_version FROM portfolio_storage_writer_policy WHERE id=1) AS minimum_protocol,
  (SELECT count(*) FROM portfolio_storage_protocol_verifications) AS epochs,
  (SELECT count(*) FROM portfolio_deletion_jobs) AS deletion_jobs,
  (SELECT revision FROM portfolio_deletion_runtime_policy WHERE id=1) AS policy_revision,
  (SELECT cleanup_enabled FROM portfolio_deletion_runtime_policy WHERE id=1) AS cleanup_enabled,
  (SELECT finalization_enabled FROM portfolio_deletion_runtime_policy WHERE id=1) AS finalization_enabled;`

export function validateSandboxSnapshot(raw, migrationNames) {
  assert.ok(Array.isArray(raw) && raw.length === 1 && raw[0].success === true)
  assert.ok(Array.isArray(raw[0].results) && raw[0].results.length === 1)
  const row = raw[0].results[0]
  assert.deepEqual(JSON.parse(row.migrations), migrationNames)
  for (const name of ['portfolios', 'allocations', 'unsettled_or_untracked', 'epochs', 'deletion_jobs',
    'minimum_protocol', 'cleanup_enabled', 'finalization_enabled']) assert.equal(row[name], 0, `Unexpected initial sandbox state: ${name}`)
  assert.ok(Number.isSafeInteger(row.policy_revision) && row.policy_revision >= 0)
  return { state: 'empty-disabled-pre-cutover', policyRevision: row.policy_revision,
    limitation: 'An offline snapshot does not prove its origin, freshness, R2 identity, deployed code or legacy-writer settlement.' }
}

export async function checkSandbox({ snapshot } = {}) {
  const mainPath = join(root, 'wrangler.delete-sandbox.jsonc')
  const main = JSON.parse(await readFile(mainPath, 'utf8'))
  const hosting = JSON.parse(await readFile(join(root, 'wrangler.delete-sandbox-hosting.jsonc'), 'utf8'))
  validateSandboxPair(main, hosting)
  const migrations = (await readdir(join(root, 'migrations'))).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()
  assert.equal(migrations.length, 14)
  const command = sql => '& ' + [process.execPath, join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute',
    sandboxResources.databaseName, '--remote', '--json', '--config', mainPath, '--command', sql].map(quotePowerShell).join(' ')
  return { mode: 'OFFLINE ONLY; commands printed, never executed', resources: sandboxResources, scope: sandboxScope,
    configuration: 'PASS: exact sandbox pair, frozen mutations, deletion flags off, no routes/Cron, no secret values',
    publicKeyConfigured: Boolean(main.vars.PORTFOLIO_INVENTORY_PUBLIC_KEY_SPKI),
    snapshot: snapshot ? validateSandboxSnapshot(JSON.parse(await readFile(snapshot, 'utf8')), migrations) : 'NOT VERIFIED: no fresh provider snapshot supplied',
    readOnlyChecks: [
      { purpose: 'Initial empty, disabled pre-cutover D1 baseline; save private JSON output for --snapshot FILE.', sql: sandboxReadinessSQL, command: command(sandboxReadinessSQL) },
      { purpose: 'No foreign-key violations: expect an empty results array.', sql: 'PRAGMA foreign_key_check;', command: command('PRAGMA foreign_key_check;') },
      { purpose: 'D1-supported SQLite quick check: expect quick_check=ok.', sql: 'PRAGMA quick_check;', command: command('PRAGMA quick_check;') },
    ],
    remainingIndependentChecks: ['Verify provider account and both deployed version IDs/traffic splits against reviewed artifact bytes.',
      'Read R2 sentinel custom metadata through the approved account; compare all four identity fields with this scope.',
      'Audit all bucket write authorities, in-flight legacy requests and rollback targets; an empty D1 snapshot proves none of these.',
      'The public verifier pin must come from an independent trusted channel. No signing key or live evidence is generated here.'] }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--cutover-plan') {
      assert.equal(process.argv.length, 4)
      console.log(JSON.stringify(await prepareSandboxTrustPlan(process.argv[3]), null, 2))
    } else {
      assert.ok(process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === '--snapshot'))
      console.log(JSON.stringify(await checkSandbox({ snapshot: process.argv[3] }), null, 2))
    }
  } catch (error) { console.error(`Sandbox readiness refused: ${error.message}. No remote commands were executed.`); process.exitCode = 1 }
}
