-- Phase 2A only: marking and fencing. No storage or portfolio rows are deleted.
ALTER TABLE portfolios ADD COLUMN deletion_requested_at INTEGER
CHECK (
    deletion_requested_at IS NULL OR (
        typeof(deletion_requested_at) = 'integer'
        AND deletion_requested_at >= 0 AND status = 'draft'
    )
);

-- Retained receipts, deliberately without a cascading portfolio foreign key.
-- A later migration must add the cleanup executor's progress/settlement model.
CREATE TABLE portfolio_deletion_jobs (
    id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
    portfolio_id INTEGER NOT NULL UNIQUE
        CHECK (typeof(portfolio_id) = 'integer' AND portfolio_id > 0),
    requested_by TEXT NOT NULL CHECK (length(requested_by) > 0),
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state = 'pending'),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
        CHECK (typeof(created_at) = 'integer' AND created_at >= 0)
);

-- Fence even older Worker queries that do not yet include the marker predicate.
CREATE TRIGGER portfolios_pending_deletion_no_update
BEFORE UPDATE ON portfolios
WHEN OLD.deletion_requested_at IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'Portfolio is pending deletion.');
END;

CREATE TRIGGER portfolios_pending_deletion_no_replace
BEFORE INSERT ON portfolios
WHEN EXISTS (
    SELECT 1 FROM portfolios
    WHERE deletion_requested_at IS NOT NULL
        AND (id = NEW.id OR slug = NEW.slug OR storage_prefix = NEW.storage_prefix)
)
BEGIN
    SELECT RAISE(ABORT, 'Portfolio is pending deletion.');
END;

CREATE TRIGGER portfolios_pending_deletion_no_delete
BEFORE DELETE ON portfolios
WHEN OLD.deletion_requested_at IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'Portfolio cleanup is not enabled.');
END;

CREATE TRIGGER portfolio_allocations_pending_deletion
BEFORE INSERT ON portfolio_storage_allocations
WHEN EXISTS (
    SELECT 1 FROM portfolios
    WHERE id = NEW.portfolio_id AND deletion_requested_at IS NOT NULL
)
BEGIN
    SELECT RAISE(ABORT, 'Portfolio is pending deletion.');
END;

CREATE TRIGGER portfolio_deletion_jobs_validate_insert
BEFORE INSERT ON portfolio_deletion_jobs
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM portfolios
        WHERE id = NEW.portfolio_id AND deletion_requested_at IS NOT NULL
    ) THEN RAISE(ABORT, 'Deletion job requires a pending portfolio.') END;
    -- The endpoint skips existing owners before INSERT. Reject replacement
    -- through either unique key, including when recursive triggers are off.
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM portfolio_deletion_jobs
        WHERE id = NEW.id OR portfolio_id = NEW.portfolio_id
    ) THEN RAISE(ABORT, 'Deletion job identity already exists.') END;
END;

CREATE TRIGGER portfolio_deletion_jobs_no_update
BEFORE UPDATE ON portfolio_deletion_jobs
BEGIN
    SELECT RAISE(ABORT, 'Deletion job receipt is immutable.');
END;

CREATE TRIGGER portfolio_deletion_jobs_no_delete
BEFORE DELETE ON portfolio_deletion_jobs
BEGIN
    SELECT RAISE(ABORT, 'Deletion job receipt must be retained.');
END;
