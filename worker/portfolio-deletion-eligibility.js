// Read-only explanation; never adopts legacy history or authorizes R2 removal.
export function deletionEligibility(row) {
  if (!row) return { canRequest: false, code: 'UNAVAILABLE', message: 'Deletion eligibility could not be verified.' }
  if (row.deletion_requested_at != null) return { canRequest: false, code: 'ALREADY_REQUESTED', message: 'Deletion is already requested; follow its retained job.' }
  if (row.tracked_birth !== 1) return { canRequest: false, code: 'LEGACY_PROVENANCE_REQUIRED', message: 'Historical storage ownership and writer provenance require reconciliation. This website remains unchanged.' }
  if (row.authorized_origin !== 1 && row.reconciled_origin !== 1) return { canRequest: false, code: 'CURRENT_POLICY_REQUIRED', message: 'A verified origin under the current signed policy is required. Older generations cannot be relabeled.' }
  if (row.uncertain_writers !== 0) return { canRequest: false, code: 'WRITER_REVIEW_REQUIRED', message: 'Outstanding or uncertain writers require factual settlement evidence.' }
  return { canRequest: true, code: row.reconciled_origin === 1 ? 'RECONCILED_REQUEST_CANDIDATE' : 'REQUEST_CANDIDATE', message: 'Request eligible; complete ownership, inventory and writer checks must still pass before cleanup. Finalization requires separate approval.' }
}
export const eligibilityColumns = `(storage_birth_token IS NOT NULL) AS tracked_birth,
 EXISTS(SELECT 1 FROM portfolio_storage_origins o JOIN portfolio_storage_authorized_epochs e ON e.id=o.epoch_id
   WHERE o.portfolio_id=portfolios.id AND o.birth_token=portfolios.storage_birth_token AND o.minimum_at_birth=1) AS authorized_origin,
 EXISTS(SELECT 1 FROM portfolio_legacy_reconciliations_current r WHERE r.portfolio_id=portfolios.id) AS reconciled_origin,
 (SELECT count(*) FROM portfolio_storage_allocations a WHERE a.portfolio_id=portfolios.id
   AND (a.writer_protocol_version<>1 OR a.writer_state IS NOT 'closed' OR a.writer_closed_at IS NULL OR a.writer_closed_at>unixepoch())) AS uncertain_writers`
export async function readDeletionEligibility(db, id) {
  const row = await db.prepare(`SELECT deletion_requested_at,${eligibilityColumns} FROM portfolios WHERE id=?`).bind(id).first()
  return deletionEligibility(row)
}
