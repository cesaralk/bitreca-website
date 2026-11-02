-- Guarded finalization only. This migration does not finalize existing jobs.
-- No portfolio foreign key: permanent evidence and ownership survive deletion.
CREATE TABLE portfolio_deletion_finalizations (
    job_id TEXT NOT NULL PRIMARY KEY REFERENCES portfolio_deletion_jobs(id),
    portfolio_id INTEGER NOT NULL UNIQUE CHECK (typeof(portfolio_id) = 'integer' AND portfolio_id > 0),
    generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation > 0),
    lease_token TEXT NOT NULL CHECK (length(lease_token) = 32 AND length(CAST(lease_token AS BLOB)) = 32
        AND lease_token NOT GLOB '*[^0-9a-f]*'),
    storage_verified_at INTEGER NOT NULL CHECK (typeof(storage_verified_at) = 'integer' AND storage_verified_at >= 0),
    finalized_at INTEGER NOT NULL DEFAULT (unixepoch()) CHECK (typeof(finalized_at) = 'integer' AND finalized_at >= 0)
);

-- Recheck identities and chronology, not just matching counts or a phase name.
-- The inventory attestation remains independent, trusted evidence; this view
-- never infers historical ownership or writer settlement from age/prefix names.
CREATE VIEW portfolio_deletion_finalizable AS
SELECT j.id AS job_id, j.portfolio_id, s.verified_at AS storage_verified_at
FROM portfolio_deletion_jobs j
JOIN portfolios p ON p.id = j.portfolio_id AND p.status = 'draft' AND p.deletion_requested_at IS NOT NULL
JOIN portfolio_deletion_eligibility v ON v.job_id = j.id AND v.blocker IS NULL
JOIN portfolio_deletion_inventory i ON i.job_id = j.id AND i.storage_prefix = p.storage_prefix
JOIN portfolio_deletion_storage_receipts s ON s.job_id = j.id
JOIN portfolio_deletion_executions e ON e.job_id = j.id
WHERE i.allocation_count > 0 AND i.verified_at <= s.verified_at AND s.verified_at <= unixepoch()
    AND s.generation <= e.generation
    AND i.allocation_count = (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id)
    AND i.allocation_count = (SELECT count(*) FROM portfolio_deletion_items WHERE job_id = j.id)
    AND i.allocation_count = (SELECT count(*) FROM portfolio_deletion_prefix_receipts WHERE job_id = j.id)
    AND NOT EXISTS (
        SELECT 1 FROM portfolio_storage_allocations a WHERE a.portfolio_id = j.portfolio_id AND (
            a.writer_protocol_version <> 1 OR a.writer_state IS NOT 'closed' OR a.writer_closed_at IS NULL
            OR NOT EXISTS (
                SELECT 1 FROM portfolio_deletion_items item
                JOIN portfolio_deletion_prefix_receipts r ON r.job_id = item.job_id AND r.prefix = item.prefix
                WHERE item.job_id = j.id AND item.prefix = a.prefix
                    AND a.writer_closed_at <= r.verified_empty_at AND r.verified_empty_at <= s.verified_at
                    AND item.generation <= r.generation AND r.generation <= s.generation)
        )
    )
    AND NOT EXISTS (
        SELECT 1 FROM portfolio_deletion_items item WHERE item.job_id = j.id AND NOT EXISTS (
            SELECT 1 FROM portfolio_storage_allocations a WHERE a.prefix = item.prefix AND a.portfolio_id = j.portfolio_id)
    )
    AND NOT EXISTS (
        SELECT 1 FROM portfolio_deletion_batches b WHERE b.job_id = j.id AND NOT EXISTS (
            SELECT 1 FROM portfolio_deletion_batch_receipts r
            JOIN portfolio_deletion_prefix_receipts empty ON empty.job_id = b.job_id AND empty.prefix = b.prefix
            WHERE r.batch_id = b.id AND b.generation <= r.generation AND r.generation <= empty.generation
                AND b.created_at <= r.confirmed_at AND r.confirmed_at <= empty.verified_empty_at)
    );

CREATE TRIGGER portfolio_finalization_validate BEFORE INSERT ON portfolio_deletion_finalizations
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_deletion_finalizations
        WHERE job_id = NEW.job_id OR portfolio_id = NEW.portfolio_id)
        OR NEW.finalized_at <> unixepoch() OR NOT EXISTS (
            SELECT 1 FROM portfolio_deletion_finalizable f JOIN portfolio_deletion_executions e ON e.job_id = f.job_id
            WHERE f.job_id = NEW.job_id AND f.portfolio_id = NEW.portfolio_id
                AND f.storage_verified_at = NEW.storage_verified_at
                AND e.generation = NEW.generation AND e.lease_token = NEW.lease_token
                AND e.lease_expires_at > unixepoch()
        ) THEN RAISE(ABORT, 'Finalization requires complete verification and a current matching lease.') END;
END;

-- Install the replacement guard BEFORE removing 0007's unconditional guard.
-- Even a direct DELETE with a valid lease needs the receipt being inserted by
-- the atomic operation below. No lasting standalone deletion permit exists.
CREATE TRIGGER portfolios_finalization_delete_guard BEFORE DELETE ON portfolios
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM portfolio_deletion_finalizations r
        JOIN portfolio_deletion_finalizable f ON f.job_id = r.job_id AND f.portfolio_id = r.portfolio_id
        JOIN portfolio_deletion_executions e ON e.job_id = r.job_id
        WHERE r.portfolio_id = OLD.id AND e.lease_token = r.lease_token AND e.generation = r.generation
            AND e.lease_expires_at > unixepoch()
    ) THEN RAISE(ABORT, 'Portfolio cleanup is not enabled or finalization is not authorized.') END;
END;

CREATE TRIGGER portfolio_finalization_apply AFTER INSERT ON portfolio_deletion_finalizations
BEGIN
    DELETE FROM portfolios WHERE id = NEW.portfolio_id;
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolios WHERE id = NEW.portfolio_id)
        THEN RAISE(ABORT, 'Portfolio finalization was not completed.') END;
    UPDATE portfolio_deletion_executions
    SET lease_token = NULL, lease_expires_at = NULL, phase = 'prepared',
        last_error_code = NULL, next_attempt_at = 0, updated_at = unixepoch()
    WHERE job_id = NEW.job_id AND lease_token = NEW.lease_token AND generation = NEW.generation;
    SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'Finalization lease release was not confirmed.') END;
END;
CREATE TRIGGER portfolio_finalization_no_update BEFORE UPDATE ON portfolio_deletion_finalizations
BEGIN SELECT RAISE(ABORT, 'Permanent deletion receipt is immutable.'); END;
CREATE TRIGGER portfolio_finalization_no_delete BEFORE DELETE ON portfolio_deletion_finalizations
BEGIN SELECT RAISE(ABORT, 'Permanent deletion receipt must be retained.'); END;

-- UUID allocation tombstones also fence direct INSERT/REPLACE or prefix edits
-- after the portfolio row has disappeared. Slugs may be reused with new storage.
CREATE TRIGGER portfolios_finalized_identity_insert BEFORE INSERT ON portfolios
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_deletion_finalizations WHERE portfolio_id = NEW.id)
        THEN RAISE(ABORT, 'Portfolio identity was permanently deleted.') END;
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM portfolio_storage_allocations a JOIN portfolio_deletion_finalizations f ON f.portfolio_id = a.portfolio_id
        WHERE substr(NEW.storage_prefix, 1, length(a.prefix)) = a.prefix
            OR substr(a.prefix, 1, length(NEW.storage_prefix)) = NEW.storage_prefix
    ) THEN RAISE(ABORT, 'Storage allocation conflict.') END;
END;
CREATE TRIGGER portfolios_finalized_identity_update BEFORE UPDATE OF id, storage_prefix ON portfolios
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_deletion_finalizations WHERE portfolio_id = NEW.id)
        THEN RAISE(ABORT, 'Portfolio identity was permanently deleted.') END;
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM portfolio_storage_allocations a JOIN portfolio_deletion_finalizations f ON f.portfolio_id = a.portfolio_id
        WHERE substr(NEW.storage_prefix, 1, length(a.prefix)) = a.prefix
            OR substr(a.prefix, 1, length(NEW.storage_prefix)) = NEW.storage_prefix
    ) THEN RAISE(ABORT, 'Storage allocation conflict.') END;
END;

DROP TRIGGER portfolios_pending_deletion_no_delete;
