// Local integration edits only. Never invokes Wrangler or network operations.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const target = 'C:/Users/cezar/Desktop/bitreca-deletion-integration'
async function edit(path, callback) {
  const file = join(target, path), text = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n')
  await writeFile(file, callback(text))
}
await writeFile(join(target, 'worker/portfolio-deletion-eligibility.js'), `// Read-only explanation; never adopts legacy history or authorizes R2 removal.
export function deletionEligibility(row) {
  if (!row) return { canRequest: false, code: 'UNAVAILABLE', message: 'Deletion eligibility could not be verified.' }
  if (row.deletion_requested_at != null) return { canRequest: false, code: 'ALREADY_REQUESTED', message: 'Deletion is already requested; follow its retained job.' }
  if (row.tracked_birth !== 1) return { canRequest: false, code: 'LEGACY_PROVENANCE_REQUIRED', message: 'Historical storage ownership and writer provenance require reconciliation. This website remains unchanged.' }
  if (row.authorized_origin !== 1) return { canRequest: false, code: 'CURRENT_POLICY_REQUIRED', message: 'A verified origin under the current signed policy is required. Older generations cannot be relabeled.' }
  if (row.uncertain_writers !== 0) return { canRequest: false, code: 'WRITER_REVIEW_REQUIRED', message: 'Outstanding or uncertain writers require factual settlement evidence.' }
  return { canRequest: true, code: 'REQUEST_CANDIDATE', message: 'Request eligible; complete ownership, inventory and writer checks must still pass before cleanup. Finalization requires separate approval.' }
}
export const eligibilityColumns = \`(storage_birth_token IS NOT NULL) AS tracked_birth,
 EXISTS(SELECT 1 FROM portfolio_storage_origins o JOIN portfolio_storage_authorized_epochs e ON e.id=o.epoch_id
   WHERE o.portfolio_id=portfolios.id AND o.birth_token=portfolios.storage_birth_token AND o.minimum_at_birth=1) AS authorized_origin,
 (SELECT count(*) FROM portfolio_storage_allocations a WHERE a.portfolio_id=portfolios.id
   AND (a.writer_protocol_version<>1 OR a.writer_state IS NOT 'closed' OR a.writer_closed_at IS NULL OR a.writer_closed_at>unixepoch())) AS uncertain_writers\`
export async function readDeletionEligibility(db, id) {
  const row = await db.prepare(\`SELECT deletion_requested_at,\${eligibilityColumns} FROM portfolios WHERE id=?\`).bind(id).first()
  return deletionEligibility(row)
}
`)
await edit('worker/index.js', text => {
  text = "import { deletionEligibility, eligibilityColumns, readDeletionEligibility } from './portfolio-deletion-eligibility.js'\n" + text
  text = text.replace(/ {12}CASE WHEN \(id=1 AND slug='forest-demo'[\s\S]*?ELSE 0 END AS reviewed_legacy_deletion,/, '            ${eligibilityColumns},')
  text = text.replace('portfolios: result.results,', 'portfolios: result.results.map(row => { const { tracked_birth, authorized_origin, uncertain_writers, ...portfolio } = row; return { ...portfolio, deletion_eligibility: deletionEligibility({ ...portfolio, tracked_birth, authorized_origin, uncertain_writers }) } }),')
  const anchor = "    // Protect legacy customers in main staging from deletion tests."
  text = text.replace(anchor, `    try {
      const eligibility = await readDeletionEligibility(env.bitreca_db, id)
      if (!eligibility.canRequest && eligibility.code !== 'ALREADY_REQUESTED') {
        return Response.json({ success: false, message: eligibility.message, code: eligibility.code }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
      }
    } catch {
      return Response.json({ success: false, message: 'Deletion eligibility is unavailable; no portfolio was changed.' }, { status: 503 })
    }
` + anchor)
  return text
})
await edit('src/pages/AdminPortfolios.jsx', text => {
  text = text.replace('!pending ? <a', '!pending ? <a')
  text = text.replace('<button type="button" className="pf-delete-link" disabled={disabled || !deletionEnabled}', '<p className="pf-operation">{portfolio.deletion_eligibility?.message || \'Deletion eligibility is awaiting verification.\'}</p>\n      <button type="button" className="pf-delete-link" disabled={disabled || !deletionEnabled || portfolio.deletion_eligibility?.canRequest !== true}')
  text = text.replace("if (!capabilities.requestsEnabled || (capabilities.legacyOnly && portfolio.reviewed_legacy_deletion !== 1)", "if (!capabilities.requestsEnabled || portfolio.deletion_eligibility?.canRequest !== true || (capabilities.legacyOnly && portfolio.reviewed_legacy_deletion !== 1)")
  text = text.replace("if (!capabilities.requestsEnabled || (capabilities.legacyOnly && deleting?.reviewed_legacy_deletion !== 1)", "if (!capabilities.requestsEnabled || deleting?.deletion_eligibility?.canRequest !== true || (capabilities.legacyOnly && deleting?.reviewed_legacy_deletion !== 1)")
  return text
})
await edit('scripts/check-portfolio-ui.mjs', text => text.replace("deletion_requested_at: null, storage_prefix:", "deletion_requested_at: null, deletion_eligibility: { canRequest: true, message: 'Request eligible; inventory checks remain required.' }, storage_prefix:"))
console.log('Applied fail-closed eligibility and Admin explanations only in integration worktree.')
