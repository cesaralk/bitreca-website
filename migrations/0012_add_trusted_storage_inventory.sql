-- No cutover, backfill, or certification is performed by this migration.
ALTER TABLE portfolios ADD COLUMN storage_birth_token TEXT
    CHECK (storage_birth_token IS NULL OR (length(storage_birth_token) = 32
        AND length(CAST(storage_birth_token AS BLOB)) = 32 AND storage_birth_token NOT GLOB '*[^0-9a-f]*'));

-- Imported only by the internal verifier after checking an independently signed
-- deployment/drain report against a pinned public key and storage scope.
CREATE TABLE portfolio_storage_protocol_verifications (
    id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
    storage_scope TEXT NOT NULL CHECK (length(storage_scope) BETWEEN 1 AND 200),
    evidence_json TEXT NOT NULL CHECK (length(evidence_json) <= 16384 AND json_valid(evidence_json)),
    signature_hex TEXT NOT NULL CHECK (length(signature_hex) = 128 AND signature_hex NOT GLOB '*[^0-9a-f]*'),
    signer_sha256 TEXT NOT NULL CHECK (length(signer_sha256) = 64 AND signer_sha256 NOT GLOB '*[^0-9a-f]*'),
    verified_at INTEGER NOT NULL CHECK (typeof(verified_at) = 'integer' AND verified_at >= 0)
);
CREATE TRIGGER portfolio_protocol_verification_insert BEFORE INSERT ON portfolio_storage_protocol_verifications
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_storage_protocol_verifications WHERE id = NEW.id)
        OR NEW.verified_at > unixepoch() OR NOT EXISTS (
            SELECT 1 FROM portfolio_storage_writer_policy WHERE id = 1 AND minimum_protocol_version = 1)
        THEN RAISE(ABORT, 'Verified tracking cutover is required.') END;
END;
CREATE TRIGGER portfolio_protocol_verification_no_update BEFORE UPDATE ON portfolio_storage_protocol_verifications
BEGIN SELECT RAISE(ABORT, 'Protocol evidence is immutable.'); END;
CREATE TRIGGER portfolio_protocol_verification_no_delete BEFORE DELETE ON portfolio_storage_protocol_verifications
BEGIN SELECT RAISE(ABORT, 'Protocol evidence must be retained.'); END;

CREATE TABLE portfolio_storage_origins (
    portfolio_id INTEGER NOT NULL PRIMARY KEY,
    birth_token TEXT NOT NULL UNIQUE,
    initial_prefix TEXT NOT NULL UNIQUE,
    epoch_id TEXT REFERENCES portfolio_storage_protocol_verifications(id),
    minimum_at_birth INTEGER NOT NULL,
    born_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE portfolio_storage_birth_seals (
    portfolio_id INTEGER NOT NULL PRIMARY KEY REFERENCES portfolio_storage_origins(portfolio_id),
    initial_prefix TEXT NOT NULL UNIQUE REFERENCES portfolio_storage_allocations(prefix),
    writer_token TEXT NOT NULL UNIQUE,
    sealed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE portfolio_storage_allocation_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    prefix TEXT NOT NULL UNIQUE REFERENCES portfolio_storage_allocations(prefix),
    portfolio_id INTEGER NOT NULL REFERENCES portfolio_storage_origins(portfolio_id),
    allocation_kind TEXT NOT NULL,
    source_prefix TEXT,
    writer_token TEXT,
    writer_protocol_version INTEGER NOT NULL
);
CREATE INDEX idx_portfolio_allocation_events_owner ON portfolio_storage_allocation_events(portfolio_id, sequence);

CREATE TRIGGER portfolio_birth_identity BEFORE UPDATE ON portfolios
WHEN NEW.storage_birth_token IS NOT OLD.storage_birth_token
    OR (OLD.storage_birth_token IS NOT NULL AND NEW.id IS NOT OLD.id)
BEGIN SELECT RAISE(ABORT, 'Storage birth identity is immutable.'); END;
CREATE TRIGGER portfolio_birth_no_replace BEFORE INSERT ON portfolios
WHEN EXISTS (SELECT 1 FROM portfolio_storage_origins WHERE portfolio_id = NEW.id OR birth_token = NEW.storage_birth_token)
BEGIN SELECT RAISE(ABORT, 'Storage birth identity already exists.'); END;
CREATE TRIGGER portfolio_birth_capture AFTER INSERT ON portfolios
WHEN NEW.storage_birth_token IS NOT NULL
BEGIN
    INSERT INTO portfolio_storage_origins(portfolio_id,birth_token,initial_prefix,epoch_id,minimum_at_birth)
    SELECT NEW.id,NEW.storage_birth_token,NEW.storage_prefix,
        (SELECT id FROM portfolio_storage_protocol_verifications WHERE verified_at <= unixepoch()
            ORDER BY verified_at DESC,id DESC LIMIT 1),minimum_protocol_version
    FROM portfolio_storage_writer_policy WHERE id=1;
    SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'Storage birth could not be recorded.') END;
END;
CREATE TRIGGER portfolio_origin_validate BEFORE INSERT ON portfolio_storage_origins
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_storage_origins WHERE portfolio_id = NEW.portfolio_id OR birth_token = NEW.birth_token)
        OR NOT EXISTS (SELECT 1 FROM portfolios WHERE id = NEW.portfolio_id
            AND storage_birth_token = NEW.birth_token AND storage_prefix = NEW.initial_prefix AND deletion_requested_at IS NULL)
        OR EXISTS (SELECT 1 FROM portfolio_storage_allocations WHERE portfolio_id = NEW.portfolio_id)
        THEN RAISE(ABORT, 'Storage origin requires a fresh creation event.') END;
END;
CREATE TRIGGER portfolio_origin_no_update BEFORE UPDATE ON portfolio_storage_origins
BEGIN SELECT RAISE(ABORT, 'Storage origin is immutable.'); END;
CREATE TRIGGER portfolio_origin_no_delete BEFORE DELETE ON portfolio_storage_origins
BEGIN SELECT RAISE(ABORT, 'Storage origin must be retained.'); END;

CREATE TRIGGER portfolio_origin_writer_fence BEFORE INSERT ON portfolio_storage_allocations
WHEN EXISTS (SELECT 1 FROM portfolio_storage_origins WHERE portfolio_id = NEW.portfolio_id)
BEGIN
    SELECT CASE WHEN NEW.writer_protocol_version <> 1 OR (
        NEW.allocation_kind = 'initial' AND NOT EXISTS (
            SELECT 1 FROM portfolio_storage_origins WHERE portfolio_id = NEW.portfolio_id
                AND initial_prefix = NEW.prefix AND birth_token = NEW.writer_token)
    ) THEN RAISE(ABORT, 'Origin tracking requires a registered protocol writer.') END;
END;
CREATE TRIGGER portfolio_origin_activation_fence BEFORE UPDATE OF storage_prefix ON portfolios
WHEN OLD.storage_birth_token IS NOT NULL AND NEW.storage_prefix IS NOT OLD.storage_prefix
BEGIN
    SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM portfolio_storage_allocations
        WHERE portfolio_id = OLD.id AND prefix = NEW.storage_prefix AND writer_protocol_version = 1 AND writer_state = 'closed')
        THEN RAISE(ABORT, 'Origin activation requires a settled owned allocation.') END;
END;
CREATE TRIGGER portfolio_allocation_event_capture AFTER INSERT ON portfolio_storage_allocations
WHEN EXISTS (SELECT 1 FROM portfolio_storage_origins WHERE portfolio_id = NEW.portfolio_id)
BEGIN
    INSERT INTO portfolio_storage_allocation_events(prefix,portfolio_id,allocation_kind,source_prefix,writer_token,writer_protocol_version)
    VALUES(NEW.prefix,NEW.portfolio_id,NEW.allocation_kind,NEW.source_prefix,NEW.writer_token,NEW.writer_protocol_version);
    INSERT INTO portfolio_storage_birth_seals(portfolio_id,initial_prefix,writer_token)
    SELECT NEW.portfolio_id,NEW.prefix,NEW.writer_token WHERE NEW.allocation_kind = 'initial';
END;
CREATE TRIGGER portfolio_allocation_event_validate BEFORE INSERT ON portfolio_storage_allocation_events
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_storage_allocation_events WHERE prefix = NEW.prefix)
        OR NOT EXISTS (SELECT 1 FROM portfolio_storage_allocations WHERE prefix = NEW.prefix AND portfolio_id = NEW.portfolio_id
            AND allocation_kind = NEW.allocation_kind AND source_prefix IS NEW.source_prefix
            AND writer_token IS NEW.writer_token AND writer_protocol_version = NEW.writer_protocol_version)
        THEN RAISE(ABORT, 'Allocation evidence must match its registration.') END;
END;
CREATE TRIGGER portfolio_allocation_event_no_update BEFORE UPDATE ON portfolio_storage_allocation_events
BEGIN SELECT RAISE(ABORT, 'Allocation evidence is immutable.'); END;
CREATE TRIGGER portfolio_allocation_event_no_delete BEFORE DELETE ON portfolio_storage_allocation_events
BEGIN SELECT RAISE(ABORT, 'Allocation evidence must be retained.'); END;
CREATE TRIGGER portfolio_birth_seal_validate BEFORE INSERT ON portfolio_storage_birth_seals
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_storage_birth_seals WHERE portfolio_id = NEW.portfolio_id)
        OR NOT EXISTS (SELECT 1 FROM portfolio_storage_origins o JOIN portfolio_storage_allocations a
            ON a.portfolio_id = o.portfolio_id AND a.prefix = o.initial_prefix
            WHERE o.portfolio_id = NEW.portfolio_id AND o.initial_prefix = NEW.initial_prefix AND o.birth_token = NEW.writer_token
                AND a.writer_token = NEW.writer_token AND a.allocation_kind = 'initial' AND a.writer_protocol_version = 1 AND a.writer_state = 'closed')
        OR (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id = NEW.portfolio_id) <> 1
        THEN RAISE(ABORT, 'Birth seal requires the original zero-write allocation.') END;
END;
CREATE TRIGGER portfolio_birth_seal_no_update BEFORE UPDATE ON portfolio_storage_birth_seals
BEGIN SELECT RAISE(ABORT, 'Birth seal is immutable.'); END;
CREATE TRIGGER portfolio_birth_seal_no_delete BEFORE DELETE ON portfolio_storage_birth_seals
BEGIN SELECT RAISE(ABORT, 'Birth seal must be retained.'); END;

-- This is independent of inventory attestations, avoiding circular trust.
CREATE VIEW portfolio_inventory_history AS
SELECT j.id AS job_id,p.id AS portfolio_id,p.storage_prefix,o.birth_token,o.epoch_id,
    (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id=p.id) AS allocation_count,
    (SELECT max(sequence) FROM portfolio_storage_allocation_events WHERE portfolio_id=p.id) AS allocation_revision
FROM portfolio_deletion_jobs j JOIN portfolios p ON p.id=j.portfolio_id
JOIN portfolio_storage_origins o ON o.portfolio_id=p.id AND o.birth_token=p.storage_birth_token
JOIN portfolio_storage_birth_seals seal ON seal.portfolio_id=p.id AND seal.initial_prefix=o.initial_prefix AND seal.writer_token=o.birth_token
JOIN portfolio_storage_protocol_verifications epoch ON epoch.id=o.epoch_id
WHERE p.deletion_requested_at IS NOT NULL AND p.status='draft' AND o.minimum_at_birth=1 AND epoch.verified_at <= o.born_at
    AND EXISTS (SELECT 1 FROM portfolio_storage_writer_policy WHERE id=1 AND minimum_protocol_version=1)
    AND EXISTS (SELECT 1 FROM portfolio_storage_allocations WHERE portfolio_id=p.id AND prefix=p.storage_prefix)
    AND (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id=p.id) =
        (SELECT count(*) FROM portfolio_storage_allocation_events WHERE portfolio_id=p.id)
    AND NOT EXISTS (
        SELECT 1 FROM portfolio_storage_allocations a WHERE a.portfolio_id=p.id AND (
            a.writer_protocol_version<>1 OR a.writer_state IS NOT 'closed' OR a.writer_closed_at IS NULL OR a.writer_closed_at > unixepoch()
            OR NOT EXISTS (SELECT 1 FROM portfolio_storage_allocation_events e WHERE e.prefix=a.prefix AND e.portfolio_id=a.portfolio_id
                AND e.writer_token=a.writer_token AND e.writer_protocol_version=a.writer_protocol_version
                AND e.allocation_kind=a.allocation_kind AND e.source_prefix IS a.source_prefix)
            OR (a.allocation_kind IN ('folder','html') AND a.source_prefix IS NULL)
            OR (a.source_prefix IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM portfolio_storage_allocations source
                JOIN portfolio_storage_allocation_events source_event ON source_event.prefix=source.prefix AND source_event.portfolio_id=p.id
                JOIN portfolio_storage_allocation_events destination_event ON destination_event.prefix=a.prefix AND destination_event.portfolio_id=p.id
                WHERE source.portfolio_id=p.id AND source.prefix=a.source_prefix AND source_event.sequence < destination_event.sequence)))
    )
    AND NOT EXISTS (
        SELECT 1 FROM portfolio_storage_allocations a JOIN portfolios other ON other.id<>p.id
        WHERE a.portfolio_id=p.id AND (substr(a.prefix,1,length(other.storage_prefix))=other.storage_prefix
            OR substr(other.storage_prefix,1,length(a.prefix))=a.prefix)
    )
    AND NOT EXISTS (
        SELECT 1 FROM portfolio_storage_allocations a JOIN portfolio_storage_allocations other ON other.portfolio_id<>p.id
        WHERE a.portfolio_id=p.id AND (substr(a.prefix,1,length(other.prefix))=other.prefix OR substr(other.prefix,1,length(a.prefix))=a.prefix)
    );

CREATE TABLE portfolio_inventory_verifications (
    job_id TEXT NOT NULL PRIMARY KEY REFERENCES portfolio_deletion_jobs(id),
    portfolio_id INTEGER NOT NULL,
    birth_token TEXT NOT NULL,
    epoch_id TEXT NOT NULL REFERENCES portfolio_storage_protocol_verifications(id),
    storage_prefix TEXT NOT NULL,
    allocation_count INTEGER NOT NULL,
    allocation_revision INTEGER NOT NULL,
    snapshot_sha256 TEXT NOT NULL CHECK (length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
    signer_sha256 TEXT NOT NULL,
    verified_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TRIGGER portfolio_inventory_verification_validate BEFORE INSERT ON portfolio_inventory_verifications
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_inventory_verifications WHERE job_id=NEW.job_id)
        OR NEW.verified_at <> unixepoch() OR NOT EXISTS (
            SELECT 1 FROM portfolio_inventory_history h JOIN portfolio_storage_protocol_verifications e ON e.id=h.epoch_id
            WHERE h.job_id=NEW.job_id AND h.portfolio_id=NEW.portfolio_id AND h.birth_token=NEW.birth_token AND h.epoch_id=NEW.epoch_id
                AND h.storage_prefix=NEW.storage_prefix AND h.allocation_count=NEW.allocation_count AND h.allocation_revision=NEW.allocation_revision
                AND e.signer_sha256=NEW.signer_sha256)
        THEN RAISE(ABORT, 'Complete verified storage history is required.') END;
END;
CREATE TRIGGER portfolio_inventory_verification_apply AFTER INSERT ON portfolio_inventory_verifications
BEGIN
    INSERT INTO portfolio_deletion_inventory(job_id,storage_prefix,allocation_count,verified_by,evidence_reference)
    VALUES(NEW.job_id,NEW.storage_prefix,NEW.allocation_count,'signed-protocol-verifier','snapshot-sha256:'||NEW.snapshot_sha256);
END;
CREATE TRIGGER portfolio_inventory_verification_no_update BEFORE UPDATE ON portfolio_inventory_verifications
BEGIN SELECT RAISE(ABORT, 'Inventory verification is immutable.'); END;
CREATE TRIGGER portfolio_inventory_verification_no_delete BEFORE DELETE ON portfolio_inventory_verifications
BEGIN SELECT RAISE(ABORT, 'Inventory verification must be retained.'); END;
CREATE TRIGGER portfolio_inventory_require_verification BEFORE INSERT ON portfolio_deletion_inventory
WHEN NOT EXISTS (SELECT 1 FROM portfolio_inventory_verifications proof JOIN portfolio_inventory_history h ON h.job_id=proof.job_id
    WHERE proof.job_id=NEW.job_id AND proof.storage_prefix=NEW.storage_prefix AND proof.allocation_count=NEW.allocation_count
        AND proof.allocation_revision=h.allocation_revision AND proof.birth_token=h.birth_token
        AND NEW.verified_by='signed-protocol-verifier' AND NEW.evidence_reference='snapshot-sha256:'||proof.snapshot_sha256)
BEGIN SELECT RAISE(ABORT, 'A trusted inventory verification is required.'); END;

CREATE VIEW portfolio_verified_inventories AS
SELECT proof.job_id FROM portfolio_inventory_verifications proof
JOIN portfolio_inventory_history h ON h.job_id=proof.job_id AND h.portfolio_id=proof.portfolio_id AND h.birth_token=proof.birth_token
    AND h.epoch_id=proof.epoch_id AND h.storage_prefix=proof.storage_prefix
    AND h.allocation_count=proof.allocation_count AND h.allocation_revision=proof.allocation_revision
JOIN portfolio_deletion_inventory i ON i.job_id=proof.job_id AND i.storage_prefix=proof.storage_prefix AND i.allocation_count=proof.allocation_count
    AND i.verified_by='signed-protocol-verifier' AND i.evidence_reference='snapshot-sha256:'||proof.snapshot_sha256;

-- Existing free-text attestations are retained, but cannot authorize cleanup.
-- The original view is replaced below; all consumers continue using its name.
DROP VIEW portfolio_deletion_eligibility;
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
    WHEN NOT EXISTS (SELECT 1 FROM portfolio_inventory_history WHERE job_id = j.id) THEN 'STORAGE_HISTORY_UNVERIFIED'
    WHEN NOT EXISTS (SELECT 1 FROM portfolio_verified_inventories WHERE job_id = j.id) THEN 'INVENTORY_UNVERIFIED'
    ELSE NULL END AS blocker
FROM portfolio_deletion_jobs j LEFT JOIN portfolios p ON p.id = j.portfolio_id;
