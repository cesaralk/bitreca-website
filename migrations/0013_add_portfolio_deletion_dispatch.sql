-- Operational controls only. No ownership is inferred and no deletion runs.
CREATE TABLE portfolio_deletion_runtime_policy (
    id INTEGER NOT NULL PRIMARY KEY CHECK(id=1),
    revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision>=0),
    environment TEXT CHECK(environment IN ('staging','production')),
    storage_scope TEXT,
    bucket_name TEXT,
    database_id TEXT,
    signer_sha256 TEXT,
    cleanup_enabled INTEGER NOT NULL DEFAULT 0 CHECK(cleanup_enabled IN (0,1)),
    finalization_enabled INTEGER NOT NULL DEFAULT 0 CHECK(finalization_enabled IN (0,1)),
    CHECK(finalization_enabled=0 OR cleanup_enabled=1),
    CHECK(cleanup_enabled=0 OR (environment IS NOT NULL AND storage_scope IS NOT NULL
        AND bucket_name IS NOT NULL AND database_id IS NOT NULL AND signer_sha256 IS NOT NULL
        AND length(storage_scope)>0 AND length(bucket_name)>0 AND length(database_id)=36
        AND length(signer_sha256)=64 AND signer_sha256 NOT GLOB '*[^0-9a-f]*'))
);
INSERT INTO portfolio_deletion_runtime_policy(id) VALUES(1);
CREATE TRIGGER portfolio_deletion_policy_revision BEFORE UPDATE ON portfolio_deletion_runtime_policy
WHEN NEW.id<>OLD.id OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'Deletion authorization requires a new revision.'); END;
CREATE TRIGGER portfolio_deletion_policy_no_replace BEFORE INSERT ON portfolio_deletion_runtime_policy
WHEN EXISTS(SELECT 1 FROM portfolio_deletion_runtime_policy)
BEGIN SELECT RAISE(ABORT,'Deletion authorization already exists.'); END;
CREATE TRIGGER portfolio_deletion_policy_no_delete BEFORE DELETE ON portfolio_deletion_runtime_policy
BEGIN SELECT RAISE(ABORT,'Deletion authorization must be retained.'); END;

CREATE TABLE portfolio_deletion_dispatch (
    job_id TEXT NOT NULL PRIMARY KEY REFERENCES portfolio_deletion_jobs(id),
    phase TEXT NOT NULL DEFAULT 'queued' CHECK(phase IN ('queued','waiting_writers','blocked','retry_wait','storage_verified','finalized')),
    generation INTEGER NOT NULL DEFAULT 0 CHECK(typeof(generation)='integer' AND generation>=0),
    lease_token TEXT,
    lease_expires_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(typeof(attempts)='integer' AND attempts>=0),
    next_attempt_at INTEGER NOT NULL DEFAULT 0 CHECK(typeof(next_attempt_at)='integer' AND next_attempt_at>=0),
    error_code TEXT CHECK(error_code IN ('CONFIGURATION_BLOCKED','WRITERS_OPEN','INVENTORY_BLOCKED','RETRY_REQUIRED','FINALIZATION_DISABLED')),
    updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
    CHECK((lease_token IS NULL AND lease_expires_at IS NULL) OR
        (typeof(lease_token)='text' AND length(lease_token)=32 AND lease_token NOT GLOB '*[^0-9a-f]*'
            AND typeof(lease_expires_at)='integer' AND lease_expires_at>=0))
);
CREATE INDEX idx_portfolio_dispatch_due ON portfolio_deletion_dispatch(phase,next_attempt_at,lease_expires_at,job_id);
INSERT INTO portfolio_deletion_dispatch(job_id) SELECT id FROM portfolio_deletion_jobs;
CREATE TRIGGER portfolio_deletion_dispatch_create AFTER INSERT ON portfolio_deletion_jobs
BEGIN INSERT INTO portfolio_deletion_dispatch(job_id) VALUES(NEW.id); END;
CREATE TRIGGER portfolio_dispatch_revision BEFORE UPDATE ON portfolio_deletion_dispatch
WHEN NEW.job_id IS NOT OLD.job_id OR NEW.generation<OLD.generation OR NEW.attempts<OLD.attempts
    OR (NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND NEW.generation<>OLD.generation+1)
BEGIN SELECT RAISE(ABORT,'Invalid deletion dispatch revision.'); END;
CREATE TRIGGER portfolio_dispatch_no_replace BEFORE INSERT ON portfolio_deletion_dispatch
WHEN EXISTS(SELECT 1 FROM portfolio_deletion_dispatch WHERE job_id=NEW.job_id)
BEGIN SELECT RAISE(ABORT,'Deletion dispatch already exists.'); END;
CREATE TRIGGER portfolio_dispatch_no_delete BEFORE DELETE ON portfolio_deletion_dispatch
BEGIN SELECT RAISE(ABORT,'Deletion dispatch must be retained.'); END;
