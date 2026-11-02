-- Forward-only, inert by default. No key, evidence, cutover or enablement is seeded.
CREATE TABLE portfolio_storage_authorization_policies (
    id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
    generation INTEGER NOT NULL UNIQUE CHECK(typeof(generation)='integer' AND generation>0),
    policy TEXT NOT NULL CHECK(policy='solo-operator-v1'),
    operator_id TEXT NOT NULL CHECK(length(operator_id) BETWEEN 1 AND 100),
    operator_key_id TEXT NOT NULL CHECK(length(operator_key_id)=64 AND operator_key_id NOT GLOB '*[^0-9a-f]*'),
    storage_scope TEXT NOT NULL CHECK(length(storage_scope) BETWEEN 1 AND 200),
    deployment_sha256 TEXT NOT NULL CHECK(length(deployment_sha256)=64 AND deployment_sha256 NOT GLOB '*[^0-9a-f]*'),
    enrolled_at INTEGER NOT NULL CHECK(typeof(enrolled_at)='integer' AND enrolled_at>=0)
);
CREATE TABLE portfolio_storage_key_revocations (
    operator_key_id TEXT PRIMARY KEY NOT NULL CHECK(length(operator_key_id)=64 AND operator_key_id NOT GLOB '*[^0-9a-f]*'),
    revoked_at INTEGER NOT NULL DEFAULT(unixepoch()) CHECK(typeof(revoked_at)='integer')
);
CREATE TABLE portfolio_storage_authorization_state (
    id INTEGER PRIMARY KEY CHECK(id=1),
    policy TEXT NOT NULL CHECK(policy IN ('independent-v1','solo-operator-v1')),
    generation INTEGER NOT NULL CHECK(typeof(generation)='integer' AND generation>=0),
    policy_id TEXT REFERENCES portfolio_storage_authorization_policies(id),
    CHECK((policy='independent-v1' AND generation=0 AND policy_id IS NULL) OR
          (policy='solo-operator-v1' AND generation>0 AND policy_id IS NOT NULL))
);
INSERT INTO portfolio_storage_authorization_state VALUES(1,'independent-v1',0,NULL);
CREATE TRIGGER portfolio_authorization_enroll BEFORE INSERT ON portfolio_storage_authorization_policies
BEGIN
    SELECT CASE WHEN NEW.enrolled_at>unixepoch()
        OR NEW.enrolled_at<COALESCE((SELECT max(enrolled_at) FROM portfolio_storage_authorization_policies),0)
        OR NEW.generation<>(SELECT generation+1 FROM portfolio_storage_authorization_state WHERE id=1)
        OR EXISTS(SELECT 1 FROM portfolio_storage_key_revocations WHERE operator_key_id=NEW.operator_key_id)
        OR EXISTS(SELECT 1 FROM portfolio_storage_authorization_policies WHERE id=NEW.id OR generation=NEW.generation)
        THEN RAISE(ABORT,'Authorization enrollment must advance the generation with an unrevoked key.') END;
END;
CREATE TRIGGER portfolio_authorization_no_update BEFORE UPDATE ON portfolio_storage_authorization_policies
BEGIN SELECT RAISE(ABORT,'Authorization enrollment is immutable.'); END;
CREATE TRIGGER portfolio_authorization_no_delete BEFORE DELETE ON portfolio_storage_authorization_policies
BEGIN SELECT RAISE(ABORT,'Authorization enrollment must be retained.'); END;
CREATE TRIGGER portfolio_key_revocation_no_replace BEFORE INSERT ON portfolio_storage_key_revocations
WHEN NEW.revoked_at>unixepoch() OR EXISTS(SELECT 1 FROM portfolio_storage_key_revocations WHERE operator_key_id=NEW.operator_key_id)
BEGIN SELECT RAISE(ABORT,'Revocation already exists.'); END;
CREATE TRIGGER portfolio_key_revocation_no_update BEFORE UPDATE ON portfolio_storage_key_revocations
BEGIN SELECT RAISE(ABORT,'Key revocation is permanent.'); END;
CREATE TRIGGER portfolio_key_revocation_no_delete BEFORE DELETE ON portfolio_storage_key_revocations
BEGIN SELECT RAISE(ABORT,'Key revocation must be retained.'); END;
CREATE TRIGGER portfolio_authorization_state_no_insert BEFORE INSERT ON portfolio_storage_authorization_state
BEGIN SELECT RAISE(ABORT,'Authorization state cannot be replaced.'); END;
CREATE TRIGGER portfolio_authorization_state_no_delete BEFORE DELETE ON portfolio_storage_authorization_state
BEGIN SELECT RAISE(ABORT,'Authorization state must be retained.'); END;
CREATE TRIGGER portfolio_authorization_state_advance BEFORE UPDATE ON portfolio_storage_authorization_state
BEGIN
    SELECT CASE WHEN NEW.id<>OLD.id OR NEW.policy<>'solo-operator-v1' OR NEW.generation<>OLD.generation+1
        OR NOT EXISTS(SELECT 1 FROM portfolio_storage_authorization_policies p
            WHERE p.id=NEW.policy_id AND p.generation=NEW.generation
            AND NOT EXISTS(SELECT 1 FROM portfolio_storage_key_revocations r WHERE r.operator_key_id=p.operator_key_id))
        THEN RAISE(ABORT,'Authorization rollback or unreviewed generation is forbidden.') END;
END;
-- Invalidate in-flight cleanup authorizations on rotation or revocation.
CREATE TRIGGER portfolio_authorization_disable AFTER UPDATE ON portfolio_storage_authorization_state
BEGIN UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,cleanup_enabled=0,finalization_enabled=0 WHERE id=1; END;
CREATE TRIGGER portfolio_revocation_disable AFTER INSERT ON portfolio_storage_key_revocations
BEGIN UPDATE portfolio_deletion_runtime_policy SET revision=revision+1,cleanup_enabled=0,finalization_enabled=0 WHERE id=1; END;
CREATE VIEW portfolio_storage_current_solo_policy AS
SELECT p.* FROM portfolio_storage_authorization_policies p JOIN portfolio_storage_authorization_state s
    ON s.policy_id=p.id AND s.generation=p.generation AND s.policy=p.policy
WHERE NOT EXISTS(SELECT 1 FROM portfolio_storage_key_revocations r WHERE r.operator_key_id=p.operator_key_id);

ALTER TABLE portfolio_storage_allocations ADD COLUMN authorization_policy_id TEXT;
ALTER TABLE portfolio_storage_allocations ADD COLUMN authorization_generation INTEGER;
ALTER TABLE portfolio_storage_allocations ADD COLUMN authorization_artifact TEXT;
CREATE TRIGGER portfolio_writer_authorization_identity BEFORE UPDATE ON portfolio_storage_allocations
WHEN NEW.authorization_policy_id IS NOT OLD.authorization_policy_id
    OR NEW.authorization_generation IS NOT OLD.authorization_generation OR NEW.authorization_artifact IS NOT OLD.authorization_artifact
BEGIN SELECT RAISE(ABORT,'Writer authorization identity is immutable.'); END;
CREATE TRIGGER portfolio_writer_authorization_insert BEFORE INSERT ON portfolio_storage_allocations
WHEN (SELECT policy FROM portfolio_storage_authorization_state WHERE id=1)='solo-operator-v1'
    AND NOT EXISTS(SELECT 1 FROM portfolio_storage_current_solo_policy p WHERE p.id=NEW.authorization_policy_id
        AND p.generation=NEW.authorization_generation AND p.deployment_sha256=NEW.authorization_artifact)
BEGIN SELECT RAISE(ABORT,'Writer authorization pins are required.'); END;

CREATE VIEW portfolio_storage_authorized_epochs AS
SELECT e.* FROM portfolio_storage_protocol_verifications e
WHERE ((SELECT policy FROM portfolio_storage_authorization_state WHERE id=1)='independent-v1'
    AND json_extract(e.evidence_json,'$.version')=1)
OR EXISTS(SELECT 1 FROM portfolio_storage_current_solo_policy p
    WHERE json_extract(e.evidence_json,'$.version')=2
      AND json_extract(e.evidence_json,'$.authorization_policy')=p.policy
      AND json_extract(e.evidence_json,'$.policy_id')=p.id
      AND json_extract(e.evidence_json,'$.policy_generation')=p.generation
      AND json_extract(e.evidence_json,'$.operator_id')=p.operator_id
      AND json_extract(e.evidence_json,'$.operator_key_id')=p.operator_key_id
      AND json_extract(e.evidence_json,'$.deployment_sha256')=p.deployment_sha256
      AND json_extract(e.evidence_json,'$.legacy_writers_settled')=1
      AND json_extract(e.evidence_json,'$.writer_protocol')=1
      AND e.signer_sha256=p.operator_key_id AND e.storage_scope=p.storage_scope
      AND json_type(e.evidence_json,'$.deployment_verified_at')='integer'
      AND json_type(e.evidence_json,'$.writers_fenced_at')='integer'
      AND json_type(e.evidence_json,'$.writers_settled_at')='integer'
      AND json_extract(e.evidence_json,'$.deployment_verified_at')>=p.enrolled_at
      AND json_extract(e.evidence_json,'$.writers_fenced_at')>=json_extract(e.evidence_json,'$.deployment_verified_at')
      AND json_extract(e.evidence_json,'$.writers_settled_at')>=json_extract(e.evidence_json,'$.writers_fenced_at')
      AND e.verified_at>=json_extract(e.evidence_json,'$.writers_settled_at'));
CREATE TRIGGER portfolio_protocol_policy_insert AFTER INSERT ON portfolio_storage_protocol_verifications
WHEN NOT EXISTS(SELECT 1 FROM portfolio_storage_authorized_epochs WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'Protocol evidence does not match the active policy.'); END;

-- Birth must select the current policy, never relabel an older independent epoch.
DROP TRIGGER portfolio_birth_capture;
CREATE TRIGGER portfolio_birth_capture AFTER INSERT ON portfolios
WHEN NEW.storage_birth_token IS NOT NULL
BEGIN
    INSERT INTO portfolio_storage_origins(portfolio_id,birth_token,initial_prefix,epoch_id,minimum_at_birth)
    SELECT NEW.id,NEW.storage_birth_token,NEW.storage_prefix,
        (SELECT id FROM portfolio_storage_authorized_epochs WHERE verified_at<=unixepoch()
            ORDER BY verified_at DESC,id DESC LIMIT 1),minimum_protocol_version
    FROM portfolio_storage_writer_policy WHERE id=1;
    SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'Storage birth could not be recorded.') END;
END;
CREATE TRIGGER portfolio_solo_origin BEFORE INSERT ON portfolio_storage_origins
WHEN (SELECT policy FROM portfolio_storage_authorization_state WHERE id=1)='solo-operator-v1'
    AND NOT EXISTS(SELECT 1 FROM portfolio_storage_authorized_epochs WHERE id=NEW.epoch_id)
BEGIN SELECT RAISE(ABORT,'Solo birth requires current signed settlement evidence.'); END;
CREATE TRIGGER portfolio_solo_allocation BEFORE INSERT ON portfolio_storage_allocations
WHEN (SELECT policy FROM portfolio_storage_authorization_state WHERE id=1)='solo-operator-v1'
    AND NOT EXISTS(SELECT 1 FROM portfolio_storage_origins o JOIN portfolio_storage_authorized_epochs e ON e.id=o.epoch_id
        WHERE o.portfolio_id=NEW.portfolio_id)
BEGIN SELECT RAISE(ABORT,'Solo writers require current authorized origins.'); END;
CREATE TRIGGER portfolio_solo_activation BEFORE UPDATE OF storage_prefix ON portfolios
WHEN NEW.storage_prefix IS NOT OLD.storage_prefix
    AND (SELECT policy FROM portfolio_storage_authorization_state WHERE id=1)='solo-operator-v1'
    AND NOT EXISTS(SELECT 1 FROM portfolio_storage_origins o JOIN portfolio_storage_authorized_epochs e ON e.id=o.epoch_id
        WHERE o.portfolio_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Solo activation requires a current authorized origin.'); END;

-- Preserve every existing ownership, provenance and writer predicate verbatim.
CREATE VIEW portfolio_inventory_history_baseline AS
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
DROP VIEW portfolio_inventory_history;
CREATE VIEW portfolio_inventory_history AS
SELECT h.* FROM portfolio_inventory_history_baseline h
JOIN portfolio_storage_authorized_epochs e ON e.id=h.epoch_id;
