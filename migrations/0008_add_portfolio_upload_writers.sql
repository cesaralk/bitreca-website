-- Step 1 only. Historical allocations stay untracked; no settlement is inferred.
ALTER TABLE portfolio_storage_allocations ADD COLUMN writer_protocol_version INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(writer_protocol_version) = 'integer' AND writer_protocol_version IN (0, 1));
ALTER TABLE portfolio_storage_allocations ADD COLUMN writer_token TEXT
    CHECK (writer_token IS NULL OR (typeof(writer_token) = 'text'
        AND length(writer_token) = 32 AND length(CAST(writer_token AS BLOB)) = 32
        AND writer_token NOT GLOB '*[^0-9a-f]*'));
ALTER TABLE portfolio_storage_allocations ADD COLUMN writer_state TEXT
    CHECK (writer_state IS NULL OR writer_state IN ('open', 'closed', 'uncertain'));
ALTER TABLE portfolio_storage_allocations ADD COLUMN writer_closed_at INTEGER
    CHECK (
        (writer_protocol_version = 0 AND writer_token IS NULL
            AND writer_state IS NULL AND writer_closed_at IS NULL)
        OR (writer_protocol_version = 1 AND writer_token IS NOT NULL AND writer_state IS NOT NULL AND (
            (writer_state IN ('open', 'uncertain') AND writer_closed_at IS NULL)
            OR (writer_state = 'closed' AND writer_closed_at IS NOT NULL
                AND typeof(writer_closed_at) = 'integer' AND writer_closed_at >= 0)
        ))
    );
CREATE UNIQUE INDEX idx_portfolio_writer_token ON portfolio_storage_allocations(writer_token);

-- 0 is compatibility mode. A separately authorized cutover may raise this to 1.
-- Raising the minimum fences old allocation/activation SQL, not R2 calls that
-- were already issued by old Workers. Never use this gate as settlement proof.
CREATE TABLE portfolio_storage_writer_policy (
    id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
    minimum_protocol_version INTEGER NOT NULL
        CHECK (typeof(minimum_protocol_version) = 'integer' AND minimum_protocol_version >= 0)
);
INSERT INTO portfolio_storage_writer_policy VALUES (1, 0);

CREATE TRIGGER portfolio_writer_policy_no_downgrade
BEFORE UPDATE ON portfolio_storage_writer_policy
WHEN NEW.id IS NOT OLD.id OR NEW.minimum_protocol_version < OLD.minimum_protocol_version
BEGIN
    SELECT RAISE(ABORT, 'Storage writer protocol cannot be downgraded.');
END;
CREATE TRIGGER portfolio_writer_policy_no_replace
BEFORE INSERT ON portfolio_storage_writer_policy
WHEN EXISTS (SELECT 1 FROM portfolio_storage_writer_policy)
BEGIN
    SELECT RAISE(ABORT, 'Storage writer policy already exists.');
END;
CREATE TRIGGER portfolio_writer_policy_no_delete
BEFORE DELETE ON portfolio_storage_writer_policy
BEGIN
    SELECT RAISE(ABORT, 'Storage writer policy must be retained.');
END;

CREATE TRIGGER portfolio_allocations_validate_writer_insert
BEFORE INSERT ON portfolio_storage_allocations
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM portfolio_storage_writer_policy
        WHERE id = 1 AND minimum_protocol_version <= NEW.writer_protocol_version
    ) THEN RAISE(ABORT, 'Storage writer protocol upgrade required.') END;
    SELECT CASE WHEN NEW.writer_protocol_version = 1 AND (
        (NEW.allocation_kind = 'initial' AND NEW.writer_state IS NOT 'closed')
        OR (NEW.allocation_kind IN ('folder', 'html') AND NEW.writer_state IS NOT 'open')
    ) THEN RAISE(ABORT, 'Invalid initial writer state.') END;
END;

CREATE TRIGGER portfolio_allocations_writer_identity
BEFORE UPDATE ON portfolio_storage_allocations
WHEN NEW.writer_protocol_version IS NOT OLD.writer_protocol_version
    OR NEW.writer_token IS NOT OLD.writer_token
BEGIN
    SELECT RAISE(ABORT, 'Storage writer identity is immutable.');
END;
CREATE TRIGGER portfolio_allocations_writer_transition
BEFORE UPDATE ON portfolio_storage_allocations
WHEN NEW.writer_state IS NOT OLD.writer_state OR NEW.writer_closed_at IS NOT OLD.writer_closed_at
BEGIN
    SELECT CASE WHEN NOT (
        OLD.writer_protocol_version = 1 AND OLD.writer_state = 'open'
        AND NEW.writer_state IN ('closed', 'uncertain')
    ) THEN RAISE(ABORT, 'Invalid storage writer transition.') END;
END;

CREATE TRIGGER portfolios_writer_protocol_activation
BEFORE UPDATE OF storage_prefix ON portfolios
WHEN NEW.storage_prefix IS NOT OLD.storage_prefix
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM portfolio_storage_writer_policy AS policy
        WHERE policy.id = 1 AND (
            policy.minimum_protocol_version = 0 OR EXISTS (
                SELECT 1 FROM portfolio_storage_allocations AS allocation
                WHERE allocation.prefix = NEW.storage_prefix AND allocation.portfolio_id = NEW.id
                    AND allocation.writer_protocol_version >= policy.minimum_protocol_version
                    AND allocation.writer_state = 'closed'
            )
        )
    ) THEN RAISE(ABORT, 'Storage writer protocol upgrade required.') END;
END;
