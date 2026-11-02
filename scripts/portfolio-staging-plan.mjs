import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { stagingResources } from './check-portfolio-config.mjs'
import { verifyStagingPackage } from './prepare-portfolio-staging.mjs'

export const quotePowerShell = value => "'" + String(value).replaceAll("'", "''") + "'"
// PRINT ONLY. No subprocess, HTTP client, Wrangler import or execution capability.
export async function prepareStagingCommandPlan(directory) {
  directory = resolve(directory)
  const verified = await verifyStagingPackage(directory)
  if (verified.target !== 'portfolioforest-staging') throw new Error('This legacy staging command plan cannot target the deletion sandbox.')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const executable = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const main = join(directory, 'main.wrangler.jsonc'), hosting = join(directory, 'hosting.wrangler.jsonc')
  const command = (args, config = main) => '& ' + [process.execPath, executable, ...args, '--config', config].map(quotePowerShell).join(' ')
  const db = stagingResources.databaseName
  const execute = sql => command(['d1', 'execute', db, '--remote', '--command', sql])
  const backup = join(tmpdir(), 'portfolioforest-staging-backup-' + randomUUID() + '.sql')
  const steps = [
    { gate: 'REMOTE READ APPROVAL', purpose: 'Inspect schema only; no tables or customer rows are created/read.',
      command: execute("SELECT name,type FROM sqlite_master WHERE type IN ('table','view','trigger') ORDER BY type,name;") },
    { gate: 'REMOTE READ APPROVAL; only if d1_migrations exists', purpose: 'Read applied migration names, not session/credential records.',
      command: execute('SELECT name,applied_at FROM d1_migrations ORDER BY id;') },
    { gate: 'REMOTE BACKUP APPROVAL', purpose: 'Export staging only to a new PRIVATE file outside this package/repository; never print/share it.',
      before: `if (Test-Path -LiteralPath ${quotePowerShell(backup)}) { throw 'Refusing to overwrite backup.' }`,
      command: command(['d1', 'export', db, '--remote', '--output', backup]) },
    { gate: 'REMOTE DATABASE WRITE APPROVAL', purpose: 'Wrangler migrations list may initialize its tracking table; this is NOT strictly read-only.',
      command: command(['d1', 'migrations', 'list', db, '--remote']) },
    { gate: 'MIGRATION APPLICATION APPROVAL', purpose: 'Apply all pending 0001-0014 only after empty/new staging history and the portable 0006 source were independently reviewed. No --yes bypass.',
      command: command(['d1', 'migrations', 'apply', db, '--remote']) },
    { gate: 'REMOTE READ APPROVAL after migrations', purpose: 'Read public authoritative auth/protocol/deletion versions and schema integrity.',
      command: execute("SELECT admin_id,auth_version FROM admin_auth_state; SELECT minimum_protocol_version FROM portfolio_storage_writer_policy; SELECT revision,cleanup_enabled,finalization_enabled FROM portfolio_deletion_runtime_policy; PRAGMA foreign_key_check; PRAGMA integrity_check;") },
    { gate: 'SEALED STAGING DEPLOYMENT APPROVAL', purpose: 'Deploy the bundled main Worker and frontend with public endpoints, cleanup and Cron still disabled. Verify account/free-plan eligibility first.',
      command: command(['deploy', '--no-bundle']) },
    ...['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET'].map(name => ({ gate: 'STAGING SECRET CONFIGURATION APPROVAL',
      purpose: `Enter unique staging ${name} interactively. Never put its value in arguments, tracked files, transcripts or stdout.`,
      command: command(['secret', 'put', name]) })),
    { gate: 'SEALED STAGING DEPLOYMENT APPROVAL', purpose: 'Deploy only the staging hosting Worker, with no production routes or domains.',
      command: command(['deploy', '--no-bundle'], hosting) },
  ]
  // Check copied config names again for human review; only public identity is read.
  const mainConfig = JSON.parse(await readFile(main, 'utf8'))
  return { mode: 'PRINT ONLY — NOT EXECUTED', artifactSha256: verified.artifactSha256,
    worker: mainConfig.name, resources: stagingResources,
    workingDirectory: directory, instruction: 'Use a separately approved operator session from this package directory. Verify the unchanged package hash and target account before EACH remote command. No root production config, --env override, npx download or paid upgrade is used.', steps }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.error('Usage: node scripts/portfolio-staging-plan.mjs REVIEWED_PACKAGE_DIRECTORY. Prints commands only.'); process.exitCode = 1 }
  else {
    try { console.log(JSON.stringify(await prepareStagingCommandPlan(process.argv[2]), null, 2)) }
    catch { console.error('Command plan refused: package identity, integrity or staging isolation could not be verified. Nothing was executed.'); process.exitCode = 1 }
  }
}
