-- Distinct append-only authority. No portfolios, keys, policies, evidence or controls are seeded/changed.
-- Original min-0 birth records and epoch IDs remain immutable; the native authority is unchanged.
CREATE VIEW portfolio_legacy_reconciliation_candidates AS
SELECT p.id AS portfolio_id,p.storage_prefix,o.birth_token,o.initial_prefix,o.born_at,o.minimum_at_birth,
    p.publication_revision,p.deletion_requested_at,p.status,
    (SELECT count(*) FROM portfolio_storage_allocations WHERE portfolio_id=p.id) AS allocation_count,
    (SELECT max(sequence) FROM portfolio_storage_allocation_events WHERE portfolio_id=p.id) AS allocation_revision
FROM portfolios p
JOIN portfolio_storage_origins o ON o.portfolio_id=p.id AND o.birth_token=p.storage_birth_token
JOIN portfolio_storage_birth_seals seal ON seal.portfolio_id=p.id AND seal.initial_prefix=o.initial_prefix AND seal.writer_token=o.birth_token
WHERE p.id BETWEEN 5 AND 10 AND o.minimum_at_birth=0 AND o.epoch_id IS NULL
    AND (p.deletion_requested_at IS NULL OR p.status='draft')
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

CREATE TABLE portfolio_legacy_reconciliations (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
 portfolio_id INTEGER NOT NULL CHECK(portfolio_id BETWEEN 5 AND 10),
 birth_token TEXT NOT NULL,storage_prefix TEXT NOT NULL,storage_scope TEXT NOT NULL,
 publication_revision INTEGER NOT NULL CHECK(typeof(publication_revision)='integer' AND publication_revision>=0),
 allocation_count INTEGER NOT NULL CHECK(allocation_count BETWEEN 1 AND 2000),
 allocation_revision INTEGER NOT NULL,
 snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
 manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
 epoch_id TEXT NOT NULL REFERENCES portfolio_storage_protocol_verifications(id),
 policy_id TEXT NOT NULL REFERENCES portfolio_storage_authorization_policies(id),
 policy_generation INTEGER NOT NULL,operator_key_id TEXT NOT NULL,deployment_sha256 TEXT NOT NULL,
 evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND length(evidence_json)<=32768),
 signature_hex TEXT NOT NULL CHECK(length(signature_hex)=128 AND signature_hex NOT GLOB '*[^0-9a-f]*'),
 signer_sha256 TEXT NOT NULL,verified_at INTEGER NOT NULL CHECK(typeof(verified_at)='integer' AND verified_at>=0)
);
CREATE TABLE portfolio_legacy_reconciliation_objects (
 reconciliation_id TEXT NOT NULL REFERENCES portfolio_legacy_reconciliations(id),
 prefix TEXT NOT NULL,key TEXT NOT NULL,size INTEGER NOT NULL CHECK(typeof(size)='integer' AND size>=0),
 etag TEXT NOT NULL CHECK(length(etag) BETWEEN 1 AND 256),
 PRIMARY KEY(reconciliation_id,key),CHECK(length(key) BETWEEN 1 AND 1024 AND substr(key,1,length(prefix))=prefix)
);
CREATE VIEW portfolio_legacy_reconciliations_current AS
SELECT r.* FROM portfolio_legacy_reconciliations r
JOIN portfolio_legacy_reconciliation_candidates c ON c.portfolio_id=r.portfolio_id
 AND c.birth_token=r.birth_token AND c.storage_prefix=r.storage_prefix
 AND c.allocation_count=r.allocation_count AND c.allocation_revision=r.allocation_revision
 AND c.publication_revision=r.publication_revision+CASE WHEN c.deletion_requested_at IS NULL THEN 0 ELSE 1 END
JOIN portfolio_storage_current_solo_policy p ON p.id=r.policy_id AND p.generation=r.policy_generation
 AND p.operator_key_id=r.operator_key_id AND p.operator_key_id=r.signer_sha256
 AND p.deployment_sha256=r.deployment_sha256 AND p.storage_scope=r.storage_scope
JOIN portfolio_storage_authorized_epochs e ON e.id=r.epoch_id AND e.signer_sha256=r.signer_sha256
 AND e.storage_scope=r.storage_scope
WHERE r.verified_at>=e.verified_at AND r.verified_at<=unixepoch()
 AND json_extract(r.evidence_json,'$.observed_at')>=e.verified_at
 AND NOT EXISTS(SELECT 1 FROM portfolio_storage_allocations a WHERE a.portfolio_id=r.portfolio_id
   AND a.writer_closed_at>json_extract(r.evidence_json,'$.observed_at'));
CREATE TRIGGER portfolio_legacy_reconciliation_validate BEFORE INSERT ON portfolio_legacy_reconciliations
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM portfolio_legacy_reconciliations WHERE id=NEW.id)
 OR NOT EXISTS(SELECT 1 FROM portfolio_legacy_reconciliation_candidates c WHERE c.portfolio_id=NEW.portfolio_id
   AND c.deletion_requested_at IS NULL AND c.birth_token=NEW.birth_token AND c.storage_prefix=NEW.storage_prefix
   AND c.publication_revision=NEW.publication_revision AND c.allocation_count=NEW.allocation_count AND c.allocation_revision=NEW.allocation_revision)
 OR NOT EXISTS(SELECT 1 FROM portfolio_storage_current_solo_policy p JOIN portfolio_storage_authorized_epochs e ON e.id=NEW.epoch_id
   WHERE p.id=NEW.policy_id AND p.generation=NEW.policy_generation AND p.operator_key_id=NEW.operator_key_id
    AND json_extract(NEW.evidence_json,'$.operator_id')=p.operator_id
    AND p.operator_key_id=NEW.signer_sha256 AND p.deployment_sha256=NEW.deployment_sha256
    AND p.storage_scope=NEW.storage_scope AND e.storage_scope=p.storage_scope AND e.signer_sha256=p.operator_key_id
    AND NEW.verified_at>=e.verified_at AND NEW.verified_at<=unixepoch()
    AND json_extract(NEW.evidence_json,'$.observed_at')>=e.verified_at)
 OR json_extract(NEW.evidence_json,'$.version') IS NOT 2
 OR json_extract(NEW.evidence_json,'$.report_type') IS NOT 'legacy-portfolio-reconciliation'
 OR json_extract(NEW.evidence_json,'$.authorization_policy') IS NOT 'solo-operator-v1'
 OR json_extract(NEW.evidence_json,'$.id') IS NOT NEW.id
 OR json_extract(NEW.evidence_json,'$.portfolio_id') IS NOT NEW.portfolio_id
 OR json_extract(NEW.evidence_json,'$.birth_token') IS NOT NEW.birth_token
 OR json_extract(NEW.evidence_json,'$.storage_prefix') IS NOT NEW.storage_prefix
 OR json_extract(NEW.evidence_json,'$.storage_scope') IS NOT NEW.storage_scope
 OR json_extract(NEW.evidence_json,'$.publication_revision') IS NOT NEW.publication_revision
 OR json_extract(NEW.evidence_json,'$.allocation_count') IS NOT NEW.allocation_count
 OR json_extract(NEW.evidence_json,'$.allocation_revision') IS NOT NEW.allocation_revision
 OR json_extract(NEW.evidence_json,'$.snapshot_sha256') IS NOT NEW.snapshot_sha256
 OR json_extract(NEW.evidence_json,'$.manifest_sha256') IS NOT NEW.manifest_sha256
 OR json_extract(NEW.evidence_json,'$.epoch_id') IS NOT NEW.epoch_id
 OR json_extract(NEW.evidence_json,'$.policy_id') IS NOT NEW.policy_id
 OR json_extract(NEW.evidence_json,'$.policy_generation') IS NOT NEW.policy_generation
 OR json_extract(NEW.evidence_json,'$.operator_key_id') IS NOT NEW.operator_key_id
 OR json_extract(NEW.evidence_json,'$.deployment_sha256') IS NOT NEW.deployment_sha256
 OR json_extract(NEW.evidence_json,'$.verified_at') IS NOT NEW.verified_at
 OR json_extract(NEW.evidence_json,'$.ownership_verified') IS NOT 1
 OR json_extract(NEW.evidence_json,'$.historical_namespaces_complete') IS NOT 1
 OR json_extract(NEW.evidence_json,'$.legacy_writers_settled') IS NOT 1
 OR json_type(NEW.evidence_json,'$.observed_at') IS NOT 'integer'
 OR json_extract(NEW.evidence_json,'$.observed_at')>NEW.verified_at
 OR EXISTS(SELECT 1 FROM portfolio_storage_allocations a WHERE a.portfolio_id=NEW.portfolio_id
   AND a.writer_closed_at>json_extract(NEW.evidence_json,'$.observed_at'))
 OR json_type(NEW.evidence_json,'$.prefixes') IS NOT 'array'
 OR json_array_length(NEW.evidence_json,'$.prefixes')<>NEW.allocation_count
 OR (SELECT count(DISTINCT value) FROM json_each(NEW.evidence_json,'$.prefixes'))<>NEW.allocation_count
 OR EXISTS(SELECT 1 FROM json_each(NEW.evidence_json,'$.prefixes') x WHERE NOT EXISTS(
   SELECT 1 FROM portfolio_storage_allocations a WHERE a.portfolio_id=NEW.portfolio_id AND a.prefix=x.value))
 OR json_type(NEW.evidence_json,'$.objects') IS NOT 'array'
 OR json_array_length(NEW.evidence_json,'$.objects') NOT BETWEEN 1 AND 100
 OR length(json_extract(NEW.evidence_json,'$.audit_sha256')) IS NOT 64
 OR json_extract(NEW.evidence_json,'$.audit_sha256') GLOB '*[^0-9a-f]*'
 THEN RAISE(ABORT,'Current distinct signed legacy reconciliation is required.') END;
END;
CREATE TRIGGER portfolio_legacy_reconciliation_capture AFTER INSERT ON portfolio_legacy_reconciliations
BEGIN
 INSERT INTO portfolio_legacy_reconciliation_objects(reconciliation_id,prefix,key,size,etag)
 SELECT NEW.id,json_extract(value,'$.prefix'),json_extract(value,'$.key'),json_extract(value,'$.size'),json_extract(value,'$.etag')
 FROM json_each(NEW.evidence_json,'$.objects');
END;
CREATE TRIGGER portfolio_legacy_objects_validate BEFORE INSERT ON portfolio_legacy_reconciliation_objects
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM portfolio_legacy_reconciliation_objects WHERE reconciliation_id=NEW.reconciliation_id AND key=NEW.key)
 OR NOT EXISTS(SELECT 1 FROM portfolio_legacy_reconciliations r JOIN json_each(r.evidence_json,'$.objects') x
   WHERE r.id=NEW.reconciliation_id AND json_extract(x.value,'$.prefix')=NEW.prefix
   AND json_extract(x.value,'$.key')=NEW.key AND json_extract(x.value,'$.size')=NEW.size AND json_extract(x.value,'$.etag')=NEW.etag
   AND EXISTS(SELECT 1 FROM portfolio_storage_allocations a WHERE a.portfolio_id=r.portfolio_id AND a.prefix=NEW.prefix))
 THEN RAISE(ABORT,'Object must match the immutable signed manifest.') END;
END;
CREATE TABLE portfolio_legacy_inventory_bindings (
 job_id TEXT PRIMARY KEY NOT NULL REFERENCES portfolio_deletion_jobs(id),
 reconciliation_id TEXT NOT NULL REFERENCES portfolio_legacy_reconciliations(id),
 snapshot_sha256 TEXT NOT NULL CHECK(length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*')
);
CREATE TRIGGER portfolio_legacy_inventory_binding_validate BEFORE INSERT ON portfolio_legacy_inventory_bindings
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM portfolio_legacy_inventory_bindings WHERE job_id=NEW.job_id)
 OR EXISTS(SELECT 1 FROM portfolio_inventory_verifications WHERE job_id=NEW.job_id)
 OR NOT EXISTS(SELECT 1 FROM portfolio_deletion_jobs j JOIN portfolio_legacy_reconciliations_current r ON r.portfolio_id=j.portfolio_id
   JOIN portfolios p ON p.id=j.portfolio_id WHERE j.id=NEW.job_id AND r.id=NEW.reconciliation_id AND p.deletion_requested_at IS NOT NULL)
 THEN RAISE(ABORT,'Job must bind one current immutable reconciliation.') END;
END;
DROP VIEW portfolio_inventory_history;
CREATE VIEW portfolio_inventory_history AS
SELECT h.* FROM portfolio_inventory_history_baseline h JOIN portfolio_storage_authorized_epochs e ON e.id=h.epoch_id
UNION ALL
SELECT j.id AS job_id,r.portfolio_id,r.storage_prefix,r.birth_token,r.epoch_id,r.allocation_count,r.allocation_revision
FROM portfolio_deletion_jobs j JOIN portfolio_legacy_reconciliations_current r ON r.portfolio_id=j.portfolio_id
JOIN portfolios p ON p.id=j.portfolio_id AND p.status='draft' AND p.deletion_requested_at IS NOT NULL
WHERE r.id=COALESCE((SELECT reconciliation_id FROM portfolio_legacy_inventory_bindings WHERE job_id=j.id),
 (SELECT current.id FROM portfolio_legacy_reconciliations_current current WHERE current.portfolio_id=j.portfolio_id ORDER BY current.verified_at DESC,current.id DESC LIMIT 1));
DROP VIEW portfolio_verified_inventories;
CREATE VIEW portfolio_verified_inventories AS
SELECT proof.job_id FROM portfolio_inventory_verifications proof
JOIN portfolio_inventory_history h ON h.job_id=proof.job_id AND h.portfolio_id=proof.portfolio_id AND h.birth_token=proof.birth_token
 AND h.epoch_id=proof.epoch_id AND h.storage_prefix=proof.storage_prefix
 AND h.allocation_count=proof.allocation_count AND h.allocation_revision=proof.allocation_revision
JOIN portfolio_deletion_inventory i ON i.job_id=proof.job_id AND i.storage_prefix=proof.storage_prefix AND i.allocation_count=proof.allocation_count
 AND i.verified_by='signed-protocol-verifier' AND i.evidence_reference='snapshot-sha256:'||proof.snapshot_sha256
WHERE EXISTS(SELECT 1 FROM portfolio_storage_origins o WHERE o.portfolio_id=proof.portfolio_id AND o.minimum_at_birth=1)
 OR EXISTS(SELECT 1 FROM portfolio_legacy_inventory_bindings b JOIN portfolio_legacy_reconciliations_current r ON r.id=b.reconciliation_id
   WHERE b.job_id=proof.job_id AND r.portfolio_id=proof.portfolio_id AND b.snapshot_sha256=proof.snapshot_sha256 AND r.epoch_id=proof.epoch_id);
CREATE TRIGGER portfolio_legacy_inventory_proof_validate BEFORE INSERT ON portfolio_inventory_verifications
WHEN EXISTS(SELECT 1 FROM portfolio_storage_origins WHERE portfolio_id=NEW.portfolio_id AND minimum_at_birth=0)
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM portfolio_legacy_inventory_bindings b JOIN portfolio_legacy_reconciliations_current r ON r.id=b.reconciliation_id
   WHERE b.job_id=NEW.job_id AND b.snapshot_sha256=NEW.snapshot_sha256 AND r.portfolio_id=NEW.portfolio_id AND r.epoch_id=NEW.epoch_id)
 THEN RAISE(ABORT,'Legacy inventory requires its own reconciliation binding.') END;
END;
CREATE TRIGGER portfolio_legacy_batch_exact BEFORE INSERT ON portfolio_deletion_batches
WHEN EXISTS(SELECT 1 FROM portfolio_legacy_inventory_bindings WHERE job_id=NEW.job_id)
BEGIN
 SELECT CASE WHEN json_array_length(NEW.keys_json)<>1 OR EXISTS(
   SELECT 1 FROM json_each(NEW.keys_json) x WHERE NOT EXISTS(
    SELECT 1 FROM portfolio_legacy_inventory_bindings b JOIN portfolio_legacy_reconciliation_objects o ON o.reconciliation_id=b.reconciliation_id
    WHERE b.job_id=NEW.job_id AND o.prefix=NEW.prefix AND o.key=x.value))
 OR EXISTS(SELECT 1 FROM portfolio_deletion_batches prior,json_each(prior.keys_json) old_key,json_each(NEW.keys_json) new_key
   WHERE prior.job_id=NEW.job_id AND old_key.value=new_key.value)
 THEN RAISE(ABORT,'Cleanup key is outside the reconciled inventory.') END;
END;
-- A signed object that disappeared before its recorded cleanup is not silently counted as deleted.
CREATE TRIGGER portfolio_legacy_prefix_exact_receipts BEFORE INSERT ON portfolio_deletion_prefix_receipts
WHEN EXISTS(SELECT 1 FROM portfolio_legacy_inventory_bindings WHERE job_id=NEW.job_id)
BEGIN
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM portfolio_legacy_inventory_bindings binding JOIN portfolio_legacy_reconciliation_objects o ON o.reconciliation_id=binding.reconciliation_id
  WHERE binding.job_id=NEW.job_id AND o.prefix=NEW.prefix AND NOT EXISTS(
   SELECT 1 FROM portfolio_deletion_batches batch JOIN portfolio_deletion_batch_receipts receipt ON receipt.batch_id=batch.id
   JOIN json_each(batch.keys_json) x ON x.value=o.key WHERE batch.job_id=NEW.job_id AND batch.prefix=o.prefix))
 THEN RAISE(ABORT,'Every reconciled object requires its exact cleanup receipt.') END;
END;

CREATE TRIGGER portfolio_legacy_reconciliations_no_update BEFORE UPDATE ON portfolio_legacy_reconciliations BEGIN SELECT RAISE(ABORT,'Legacy authority is immutable.'); END;
CREATE TRIGGER portfolio_legacy_reconciliations_no_delete BEFORE DELETE ON portfolio_legacy_reconciliations BEGIN SELECT RAISE(ABORT,'Legacy authority must be retained.'); END;

CREATE TRIGGER portfolio_legacy_reconciliation_objects_no_update BEFORE UPDATE ON portfolio_legacy_reconciliation_objects BEGIN SELECT RAISE(ABORT,'Legacy authority is immutable.'); END;
CREATE TRIGGER portfolio_legacy_reconciliation_objects_no_delete BEFORE DELETE ON portfolio_legacy_reconciliation_objects BEGIN SELECT RAISE(ABORT,'Legacy authority must be retained.'); END;

CREATE TRIGGER portfolio_legacy_inventory_bindings_no_update BEFORE UPDATE ON portfolio_legacy_inventory_bindings BEGIN SELECT RAISE(ABORT,'Legacy authority is immutable.'); END;
CREATE TRIGGER portfolio_legacy_inventory_bindings_no_delete BEFORE DELETE ON portfolio_legacy_inventory_bindings BEGIN SELECT RAISE(ABORT,'Legacy authority must be retained.'); END;

-- Atomic stale-state fence at the mark boundary, separate from the disabled request flag.
CREATE TRIGGER portfolio_legacy_request_authority BEFORE UPDATE OF deletion_requested_at ON portfolios
WHEN OLD.deletion_requested_at IS NULL AND NEW.deletion_requested_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM portfolio_storage_origins WHERE portfolio_id=OLD.id AND minimum_at_birth=0)
BEGIN
 SELECT CASE WHEN NEW.publication_revision<>OLD.publication_revision+1 OR NOT EXISTS(
  SELECT 1 FROM portfolio_legacy_reconciliations_current r WHERE r.portfolio_id=OLD.id
   AND r.publication_revision=OLD.publication_revision AND r.storage_prefix=OLD.storage_prefix AND r.birth_token=OLD.storage_birth_token)
 THEN RAISE(ABORT,'Legacy request requires current distinct reconciliation.') END;
END;
