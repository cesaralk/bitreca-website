-- New allocations only. No legacy or historical ownership is inferred here.
-- Owner IDs deliberately survive removal of a portfolio in a future deletion phase.
CREATE TABLE portfolio_storage_allocations (
    prefix TEXT NOT NULL PRIMARY KEY
        CHECK (length(prefix) > 1 AND substr(prefix, -1) = '/'),
    portfolio_id INTEGER NOT NULL
        CHECK (typeof(portfolio_id) = 'integer' AND portfolio_id > 0),
    allocation_kind TEXT NOT NULL CHECK (allocation_kind IN ('initial', 'folder', 'html')),
    upload_state TEXT NOT NULL
        CHECK (upload_state IN ('uploading', 'completed', 'failed', 'conflicted', 'uncertain')),
    source_prefix TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    -- The final path component must be a canonical lowercase UUID v4.
    CHECK (
        -- D1 limits each LIKE/GLOB pattern to 50 bytes. Split format and
        -- alphabet checks without weakening the canonical UUID v4 constraint.
        substr(prefix, -37, 36) GLOB '????????-????-4???-[89ab]???-????????????'
        AND length(replace(substr(prefix, -37, 36), '-', '')) = 32
        AND replace(substr(prefix, -37, 36), '-', '') NOT GLOB '*[^0-9a-f]*'
    ),
    CHECK (
        (allocation_kind = 'initial' AND prefix = 'portfolio-initial/' || substr(prefix, -37)
            AND source_prefix IS NULL AND upload_state = 'completed')
        OR (allocation_kind IN ('folder', 'html')
            AND prefix = 'portfolio-versions/' || portfolio_id || '/' || substr(prefix, -37))
    )
);

CREATE INDEX idx_portfolio_allocations_owner_state
ON portfolio_storage_allocations(portfolio_id, upload_state);

CREATE TRIGGER portfolio_allocations_validate_insert
BEFORE INSERT ON portfolio_storage_allocations
BEGIN
    -- Upload outcomes must be reached through the transition guard, not inserted.
    SELECT CASE WHEN NEW.allocation_kind IN ('folder', 'html')
        AND NEW.upload_state <> 'uploading'
    THEN RAISE(ABORT, 'New upload allocations must start uploading.') END;

    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM portfolios WHERE id = NEW.portfolio_id
    ) THEN RAISE(ABORT, 'Storage allocation owner does not exist.') END;

    -- substr equality is literal; LIKE would interpret underscores and percent signs.
    -- This also rejects INSERT OR REPLACE, even when the proposed owner is unchanged.
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM portfolio_storage_allocations AS allocation
        WHERE substr(NEW.prefix, 1, length(allocation.prefix)) = allocation.prefix
           OR substr(allocation.prefix, 1, length(NEW.prefix)) = NEW.prefix
    ) OR EXISTS (
        SELECT 1 FROM portfolios AS portfolio
        WHERE portfolio.id <> NEW.portfolio_id AND (
            substr(NEW.prefix, 1, length(portfolio.storage_prefix)) = portfolio.storage_prefix
            OR substr(portfolio.storage_prefix, 1, length(NEW.prefix)) = NEW.prefix
        )
    ) THEN RAISE(ABORT, 'Storage allocation conflict.') END;
END;

CREATE TRIGGER portfolio_allocations_immutable_identity
BEFORE UPDATE ON portfolio_storage_allocations
WHEN NEW.prefix IS NOT OLD.prefix
  OR NEW.portfolio_id IS NOT OLD.portfolio_id
  OR NEW.allocation_kind IS NOT OLD.allocation_kind
  OR NEW.source_prefix IS NOT OLD.source_prefix
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
    SELECT RAISE(ABORT, 'Storage allocation identity is immutable.');
END;

CREATE TRIGGER portfolio_allocations_validate_transition
BEFORE UPDATE OF upload_state ON portfolio_storage_allocations
WHEN NEW.upload_state IS NOT OLD.upload_state
BEGIN
    -- Settled outcomes are terminal. Retrying writes requires a fresh allocation.
    -- An uncertain result may be reconciled after independently verifying its
    -- outcome and writer settlement; these states alone never authorize deletion.
    SELECT CASE WHEN NOT (
        (OLD.upload_state = 'uploading'
            AND NEW.upload_state IN ('completed', 'failed', 'conflicted', 'uncertain'))
        OR (OLD.upload_state = 'uncertain'
            AND NEW.upload_state IN ('completed', 'failed', 'conflicted'))
    ) THEN RAISE(ABORT, 'Invalid storage allocation state transition.') END;

    -- The Worker selects the new prefix before recording completion in one batch.
    SELECT CASE WHEN NEW.upload_state = 'completed' AND NOT EXISTS (
        SELECT 1 FROM portfolios
        WHERE id = NEW.portfolio_id AND storage_prefix = NEW.prefix
    ) THEN RAISE(ABORT, 'Completed allocation must be the active prefix.') END;

    SELECT CASE WHEN NEW.upload_state IN ('failed', 'conflicted') AND EXISTS (
        SELECT 1 FROM portfolios
        WHERE id = NEW.portfolio_id AND storage_prefix = NEW.prefix
    ) THEN RAISE(ABORT, 'Active allocation cannot be failed or conflicted.') END;
END;

CREATE TRIGGER portfolio_allocations_retain_ownership
BEFORE DELETE ON portfolio_storage_allocations
BEGIN
    SELECT RAISE(ABORT, 'Storage allocation ownership must be retained.');
END;
