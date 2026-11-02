-- Preparation only: no object deletion, empty-prefix certification, or row removal.
-- Keep the immutable 0007 receipt and 0006/0008 ownership/writer evidence intact.
CREATE TABLE portfolio_deletion_inventory (
    job_id TEXT NOT NULL PRIMARY KEY REFERENCES portfolio_deletion_jobs(id),
    storage_prefix TEXT NOT NULL,
    allocation_count INTEGER NOT NULL CHECK (typeof(allocation_count) = 'integer' AND allocation_count > 0),
    verified_by TEXT NOT NULL CHECK (length(trim(verified_by)) > 0),
    evidence_reference TEXT NOT NULL CHECK (length(trim(evidence_reference)) > 0),
    verified_at INTEGER NOT NULL DEFAULT (unixepoch()) CHECK (typeof(verified_at) = 'integer' AND verified_at >= 0)
);
-- This is an explicit, trusted completeness attestation, NOT inferred ownership.
-- No application endpoint creates one in this phase. Historical keys must be
-- accounted for independently before a separately authorized audit records it.
-- Evidence must also establish settlement of pre-cutover/untracked writers;
-- a raised policy, elapsed time, or matching allocation count is not that proof.
CREATE TRIGGER portfolio_inventory_validate_insert BEFORE INSERT ON portfolio_deletion_inventory
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_deletion_inventory WHERE job_id = NEW.job_id)
        OR NOT EXISTS (
            SELECT 1 FROM portfolio_deletion_jobs j JOIN portfolios p ON p.id = j.portfolio_id
            WHERE j.id = NEW.job_id AND p.deletion_requested_at IS NOT NULL
                AND p.storage_prefix = NEW.storage_prefix
                AND NEW.allocation_count = (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id = p.id)
        ) THEN RAISE(ABORT, 'Invalid ownership inventory attestation.') END;
END;
CREATE TRIGGER portfolio_inventory_no_update BEFORE UPDATE ON portfolio_deletion_inventory
BEGIN SELECT RAISE(ABORT, 'Ownership inventory attestation is immutable.'); END;
CREATE TRIGGER portfolio_inventory_no_delete BEFORE DELETE ON portfolio_deletion_inventory
BEGIN SELECT RAISE(ABORT, 'Ownership inventory evidence must be retained.'); END;

CREATE TABLE portfolio_deletion_executions (
    job_id TEXT NOT NULL PRIMARY KEY REFERENCES portfolio_deletion_jobs(id),
    phase TEXT NOT NULL DEFAULT 'pending' CHECK (phase IN ('pending', 'preparing', 'prepared', 'retry_wait')),
    generation INTEGER NOT NULL DEFAULT 0 CHECK (typeof(generation) = 'integer' AND generation >= 0),
    lease_token TEXT CHECK (lease_token IS NULL OR (typeof(lease_token) = 'text' AND length(lease_token) = 32
        AND length(CAST(lease_token AS BLOB)) = 32 AND lease_token NOT GLOB '*[^0-9a-f]*')),
    lease_expires_at INTEGER CHECK (lease_expires_at IS NULL OR (typeof(lease_expires_at) = 'integer' AND lease_expires_at >= 0)),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(attempt_count) = 'integer' AND attempt_count >= 0),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(retry_count) = 'integer' AND retry_count >= 0),
    next_attempt_at INTEGER NOT NULL DEFAULT 0 CHECK (typeof(next_attempt_at) = 'integer' AND next_attempt_at >= 0),
    last_error_code TEXT CHECK (last_error_code IN ('PREPARATION_FAILED', 'STORAGE_UNAVAILABLE', 'OUTCOME_UNKNOWN')),
    allocation_cursor TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()) CHECK (typeof(updated_at) = 'integer' AND updated_at >= 0),
    CHECK ((lease_token IS NULL AND lease_expires_at IS NULL) OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
    CHECK (lease_token IS NULL OR phase = 'preparing')
);
CREATE INDEX idx_portfolio_cleanup_due ON portfolio_deletion_executions(next_attempt_at, lease_expires_at);
CREATE UNIQUE INDEX idx_portfolio_cleanup_lease ON portfolio_deletion_executions(lease_token);
INSERT INTO portfolio_deletion_executions(job_id) SELECT id FROM portfolio_deletion_jobs;
CREATE TRIGGER portfolio_deletion_initialize_execution AFTER INSERT ON portfolio_deletion_jobs
BEGIN INSERT INTO portfolio_deletion_executions(job_id) VALUES(NEW.id); END;
CREATE TRIGGER portfolio_cleanup_execution_no_replace BEFORE INSERT ON portfolio_deletion_executions
WHEN EXISTS (SELECT 1 FROM portfolio_deletion_executions WHERE job_id = NEW.job_id)
BEGIN SELECT RAISE(ABORT, 'Cleanup execution already exists.'); END;
CREATE TRIGGER portfolio_cleanup_execution_identity BEFORE UPDATE ON portfolio_deletion_executions
WHEN NEW.job_id IS NOT OLD.job_id OR NEW.generation < OLD.generation
    OR NEW.attempt_count < OLD.attempt_count OR NEW.retry_count < OLD.retry_count
    OR (NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND NEW.generation <> OLD.generation + 1)
BEGIN SELECT RAISE(ABORT, 'Invalid cleanup execution revision.'); END;
CREATE TRIGGER portfolio_cleanup_execution_no_delete BEFORE DELETE ON portfolio_deletion_executions
BEGIN SELECT RAISE(ABORT, 'Cleanup execution evidence must be retained.'); END;

-- Authoritative, live eligibility: reuse for claims AND every fenced mutation.
-- A closed writer with an uncertain upload result is safe to inventory; an
-- uncertain writer is not. Never infer settlement from age or lease expiration.
CREATE VIEW portfolio_deletion_eligibility AS
SELECT j.id AS job_id, CASE
    WHEN p.id IS NULL OR p.deletion_requested_at IS NULL OR p.status <> 'draft' THEN 'NOT_PENDING'
    WHEN EXISTS (
        SELECT 1 FROM portfolio_storage_allocations a JOIN portfolios other ON other.id <> a.portfolio_id
        WHERE a.portfolio_id = j.portfolio_id AND (
            substr(a.prefix, 1, length(other.storage_prefix)) = other.storage_prefix
            OR substr(other.storage_prefix, 1, length(a.prefix)) = a.prefix)
    ) OR EXISTS (
        SELECT 1 FROM portfolio_storage_allocations a JOIN portfolio_storage_allocations other
            ON other.portfolio_id <> a.portfolio_id
        WHERE a.portfolio_id = j.portfolio_id AND (
            substr(a.prefix, 1, length(other.prefix)) = other.prefix
            OR substr(other.prefix, 1, length(a.prefix)) = a.prefix)
    ) THEN 'OWNERSHIP_CONFLICT'
    WHEN NOT EXISTS (SELECT 1 FROM portfolio_storage_writer_policy WHERE id = 1 AND minimum_protocol_version = 1)
        THEN 'PROTOCOL_CUTOVER_REQUIRED'
    WHEN NOT EXISTS (SELECT 1 FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id AND prefix = p.storage_prefix)
        OR EXISTS (
            SELECT 1 FROM portfolio_storage_allocations a WHERE a.portfolio_id = j.portfolio_id
                AND a.source_prefix IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM portfolio_storage_allocations source
                    WHERE source.prefix = a.source_prefix AND source.portfolio_id = a.portfolio_id)
        ) THEN 'LEGACY_STORAGE_UNVERIFIED'
    WHEN EXISTS (SELECT 1 FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id
        AND (writer_protocol_version <> 1 OR writer_state IS NULL OR writer_token IS NULL)) THEN 'UNTRACKED_ALLOCATION'
    WHEN EXISTS (SELECT 1 FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id AND writer_state = 'uncertain') THEN 'WRITER_UNCERTAIN'
    WHEN EXISTS (SELECT 1 FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id AND writer_state = 'open') THEN 'WRITERS_OPEN'
    WHEN NOT EXISTS (
        SELECT 1 FROM portfolio_deletion_inventory i WHERE i.job_id = j.id AND i.storage_prefix = p.storage_prefix
            AND i.allocation_count = (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id = j.portfolio_id)
    ) THEN 'INVENTORY_INCOMPLETE'
    ELSE NULL END AS blocker
FROM portfolio_deletion_jobs j LEFT JOIN portfolios p ON p.id = j.portfolio_id;

CREATE TABLE portfolio_deletion_items (
    job_id TEXT NOT NULL REFERENCES portfolio_deletion_jobs(id),
    prefix TEXT NOT NULL REFERENCES portfolio_storage_allocations(prefix),
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state = 'pending'),
    generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation > 0),
    lease_token TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(job_id, prefix)
);
CREATE TRIGGER portfolio_cleanup_item_validate BEFORE INSERT ON portfolio_deletion_items
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_deletion_items WHERE job_id = NEW.job_id AND prefix = NEW.prefix)
        OR NOT EXISTS (
            SELECT 1 FROM portfolio_deletion_executions e
            JOIN portfolio_deletion_eligibility v ON v.job_id = e.job_id AND v.blocker IS NULL
            JOIN portfolio_deletion_jobs j ON j.id = e.job_id
            JOIN portfolio_storage_allocations a ON a.portfolio_id = j.portfolio_id AND a.prefix = NEW.prefix
            WHERE e.job_id = NEW.job_id AND e.generation = NEW.generation AND e.lease_token = NEW.lease_token
                AND e.lease_expires_at > unixepoch()
        ) THEN RAISE(ABORT, 'Cleanup item requires eligible ownership and a current lease.') END;
END;
CREATE TRIGGER portfolio_cleanup_item_no_update BEFORE UPDATE ON portfolio_deletion_items
BEGIN SELECT RAISE(ABORT, 'Cleanup item identity is immutable.'); END;
CREATE TRIGGER portfolio_cleanup_item_no_delete BEFORE DELETE ON portfolio_deletion_items
BEGIN SELECT RAISE(ABORT, 'Cleanup item evidence must be retained.'); END;

-- Exact-key, bounded, immutable intents. They are NOT evidence of R2 deletion.
CREATE TABLE portfolio_deletion_batches (
    id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
    job_id TEXT NOT NULL,
    prefix TEXT NOT NULL,
    keys_json TEXT NOT NULL CHECK (length(CAST(keys_json AS BLOB)) <= 131072),
    state TEXT NOT NULL DEFAULT 'planned' CHECK (state = 'planned'),
    generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation > 0),
    lease_token TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY(job_id, prefix) REFERENCES portfolio_deletion_items(job_id, prefix)
);
CREATE INDEX idx_portfolio_cleanup_batches ON portfolio_deletion_batches(job_id, prefix);
CREATE TRIGGER portfolio_cleanup_batch_validate BEFORE INSERT ON portfolio_deletion_batches
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_deletion_batches WHERE id = NEW.id)
        OR NOT EXISTS (
            SELECT 1 FROM portfolio_deletion_executions e
            JOIN portfolio_deletion_eligibility v ON v.job_id = e.job_id AND v.blocker IS NULL
            JOIN portfolio_deletion_items i ON i.job_id = e.job_id AND i.prefix = NEW.prefix
            WHERE e.job_id = NEW.job_id AND e.generation = NEW.generation AND e.lease_token = NEW.lease_token
                AND e.lease_expires_at > unixepoch()
        ) THEN RAISE(ABORT, 'Cleanup batch requires an eligible item and current lease.') END;
    SELECT CASE WHEN NOT json_valid(NEW.keys_json) THEN RAISE(ABORT, 'Invalid cleanup manifest JSON.') END;
    SELECT CASE WHEN json_type(NEW.keys_json) <> 'array' OR json_array_length(NEW.keys_json) NOT BETWEEN 1 AND 100
        THEN RAISE(ABORT, 'Invalid cleanup manifest size.') END;
    SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.keys_json)
        WHERE type <> 'text' OR substr(value, 1, length(NEW.prefix)) <> NEW.prefix
            OR length(CAST(value AS BLOB)) > 1024 OR instr(value, char(0)) > 0)
        OR (SELECT count(DISTINCT value) FROM json_each(NEW.keys_json)) <> json_array_length(NEW.keys_json)
        THEN RAISE(ABORT, 'Invalid cleanup manifest keys.') END;
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM portfolio_deletion_batches b, json_each(b.keys_json) old, json_each(NEW.keys_json) next
        WHERE b.job_id = NEW.job_id AND b.prefix = NEW.prefix AND old.value = next.value
    ) THEN RAISE(ABORT, 'Cleanup manifest keys already planned.') END;
END;
CREATE TRIGGER portfolio_cleanup_batch_no_update BEFORE UPDATE ON portfolio_deletion_batches
BEGIN SELECT RAISE(ABORT, 'Cleanup manifest is immutable.'); END;
CREATE TRIGGER portfolio_cleanup_batch_no_delete BEFORE DELETE ON portfolio_deletion_batches
BEGIN SELECT RAISE(ABORT, 'Cleanup manifest evidence must be retained.'); END;
