-- Cleanup evidence only. No R2 operation, ownership backfill, or portfolio removal.
-- Keep 0009 manifests/items immutable; record acknowledgements separately.
CREATE TABLE portfolio_deletion_batch_receipts (
    batch_id TEXT NOT NULL PRIMARY KEY REFERENCES portfolio_deletion_batches(id),
    generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation > 0),
    lease_token TEXT NOT NULL,
    confirmed_at INTEGER NOT NULL DEFAULT (unixepoch()) CHECK (typeof(confirmed_at) = 'integer' AND confirmed_at >= 0)
);
CREATE TABLE portfolio_deletion_prefix_receipts (
    job_id TEXT NOT NULL,
    prefix TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation > 0),
    lease_token TEXT NOT NULL,
    verified_empty_at INTEGER NOT NULL DEFAULT (unixepoch()) CHECK (typeof(verified_empty_at) = 'integer' AND verified_empty_at >= 0),
    PRIMARY KEY(job_id, prefix),
    FOREIGN KEY(job_id, prefix) REFERENCES portfolio_deletion_items(job_id, prefix)
);
CREATE TABLE portfolio_deletion_storage_receipts (
    job_id TEXT NOT NULL PRIMARY KEY REFERENCES portfolio_deletion_jobs(id),
    generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation > 0),
    lease_token TEXT NOT NULL,
    verified_at INTEGER NOT NULL DEFAULT (unixepoch()) CHECK (typeof(verified_at) = 'integer' AND verified_at >= 0)
);

-- Re-evaluate ownership, inventory and ALL writer evidence for every operation.
-- Lease expiry authorizes takeover, never certification of writer settlement.
CREATE VIEW portfolio_cleanup_authorized_items AS
SELECT i.job_id, i.prefix, e.generation, e.lease_token, e.lease_expires_at
FROM portfolio_deletion_items i
JOIN portfolio_deletion_jobs j ON j.id = i.job_id
JOIN portfolio_storage_allocations a ON a.prefix = i.prefix AND a.portfolio_id = j.portfolio_id
JOIN portfolio_deletion_executions e ON e.job_id = i.job_id
JOIN portfolio_deletion_eligibility v ON v.job_id = i.job_id AND v.blocker IS NULL
WHERE e.lease_expires_at > unixepoch() AND a.writer_protocol_version = 1 AND a.writer_state = 'closed'
    AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_storage_receipts s WHERE s.job_id = i.job_id);

CREATE TRIGGER portfolio_cleanup_batch_receipt_validate BEFORE INSERT ON portfolio_deletion_batch_receipts
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_deletion_batch_receipts WHERE batch_id = NEW.batch_id)
        OR NOT EXISTS (
            SELECT 1 FROM portfolio_deletion_batches b JOIN portfolio_cleanup_authorized_items a
                ON a.job_id = b.job_id AND a.prefix = b.prefix
            WHERE b.id = NEW.batch_id AND a.generation = NEW.generation AND a.lease_token = NEW.lease_token
                AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_prefix_receipts p WHERE p.job_id = b.job_id AND p.prefix = b.prefix)
        ) THEN RAISE(ABORT, 'Batch confirmation requires current cleanup authority.') END;
END;
CREATE TRIGGER portfolio_cleanup_prefix_receipt_validate BEFORE INSERT ON portfolio_deletion_prefix_receipts
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_deletion_prefix_receipts WHERE job_id = NEW.job_id AND prefix = NEW.prefix)
        OR NOT EXISTS (
            SELECT 1 FROM portfolio_cleanup_authorized_items a WHERE a.job_id = NEW.job_id AND a.prefix = NEW.prefix
                AND a.generation = NEW.generation AND a.lease_token = NEW.lease_token
        ) OR EXISTS (
            SELECT 1 FROM portfolio_deletion_batches b WHERE b.job_id = NEW.job_id AND b.prefix = NEW.prefix
                AND NOT EXISTS (SELECT 1 FROM portfolio_deletion_batch_receipts r WHERE r.batch_id = b.id)
        ) THEN RAISE(ABORT, 'Empty-prefix confirmation requires settled batches and current authority.') END;
END;
CREATE TRIGGER portfolio_cleanup_storage_receipt_validate BEFORE INSERT ON portfolio_deletion_storage_receipts
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_deletion_storage_receipts WHERE job_id = NEW.job_id)
        OR NOT EXISTS (
            SELECT 1 FROM portfolio_deletion_executions e
            JOIN portfolio_deletion_eligibility v ON v.job_id = e.job_id AND v.blocker IS NULL
            JOIN portfolio_deletion_inventory i ON i.job_id = e.job_id
            WHERE e.job_id = NEW.job_id AND e.generation = NEW.generation AND e.lease_token = NEW.lease_token
                AND e.lease_expires_at > unixepoch() AND i.allocation_count = (
                    SELECT count(*) FROM portfolio_deletion_prefix_receipts WHERE job_id = NEW.job_id)
                AND i.allocation_count = (SELECT count(*) FROM portfolio_deletion_items WHERE job_id = NEW.job_id)
        ) THEN RAISE(ABORT, 'Storage confirmation requires every owned prefix to be verified empty.') END;
END;
CREATE TRIGGER portfolio_cleanup_no_manifest_after_empty BEFORE INSERT ON portfolio_deletion_batches
WHEN EXISTS (SELECT 1 FROM portfolio_deletion_prefix_receipts WHERE job_id = NEW.job_id AND prefix = NEW.prefix)
BEGIN SELECT RAISE(ABORT, 'Verified empty prefixes cannot accept new manifests.'); END;

CREATE TRIGGER portfolio_cleanup_batch_receipt_no_update BEFORE UPDATE ON portfolio_deletion_batch_receipts
BEGIN SELECT RAISE(ABORT, 'Batch confirmation is immutable.'); END;
CREATE TRIGGER portfolio_cleanup_batch_receipt_no_delete BEFORE DELETE ON portfolio_deletion_batch_receipts
BEGIN SELECT RAISE(ABORT, 'Batch confirmation must be retained.'); END;
CREATE TRIGGER portfolio_cleanup_prefix_receipt_no_update BEFORE UPDATE ON portfolio_deletion_prefix_receipts
BEGIN SELECT RAISE(ABORT, 'Empty-prefix confirmation is immutable.'); END;
CREATE TRIGGER portfolio_cleanup_prefix_receipt_no_delete BEFORE DELETE ON portfolio_deletion_prefix_receipts
BEGIN SELECT RAISE(ABORT, 'Empty-prefix confirmation must be retained.'); END;
CREATE TRIGGER portfolio_cleanup_storage_receipt_no_update BEFORE UPDATE ON portfolio_deletion_storage_receipts
BEGIN SELECT RAISE(ABORT, 'Storage confirmation is immutable.'); END;
CREATE TRIGGER portfolio_cleanup_storage_receipt_no_delete BEFORE DELETE ON portfolio_deletion_storage_receipts
BEGIN SELECT RAISE(ABORT, 'Storage confirmation must be retained.'); END;
