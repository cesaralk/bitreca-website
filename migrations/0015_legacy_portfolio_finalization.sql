-- Explicitly reviewed production LEGACY portfolio bridge. This is deliberately
-- limited to three production identities present at cutover. It does not
-- establish historical writer provenance or enable generic prefix cleanup.
-- IMPORTANT: The associated Worker only records this receipt after checking
-- the exact R2 allowlist, removing approved objects and re-listing empty.
CREATE TABLE portfolio_legacy_deletion_finalizations (
  job_id TEXT NOT NULL PRIMARY KEY REFERENCES portfolio_deletion_jobs(id),
  portfolio_id INTEGER NOT NULL UNIQUE,
  storage_prefix TEXT NOT NULL UNIQUE,
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256)=64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  confirmed_empty_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TRIGGER portfolio_legacy_finalization_validate BEFORE INSERT ON portfolio_legacy_deletion_finalizations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM portfolio_deletion_jobs j JOIN portfolios p ON p.id=j.portfolio_id
    WHERE j.id=NEW.job_id AND p.id=NEW.portfolio_id
      AND p.storage_prefix=NEW.storage_prefix AND p.storage_birth_token IS NULL
      AND p.deletion_requested_at IS NOT NULL AND p.status='draft'
      AND ( (p.id=1 AND p.slug='forest-demo' AND p.storage_prefix='portfolios/forest-demo/')
         OR (p.id=2 AND p.slug='portfolioforest-test' AND p.storage_prefix='portfolios/portfolioforest-test/')
         OR (p.id=4 AND p.slug='portfolios' AND p.storage_prefix='portfolios/portfolios/') )
      AND NOT EXISTS (SELECT 1 FROM portfolio_storage_allocations a WHERE a.portfolio_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM portfolio_storage_origins o WHERE o.portfolio_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM portfolios other WHERE other.id<>p.id AND (
        substr(other.storage_prefix,1,length(p.storage_prefix))=p.storage_prefix
        OR substr(p.storage_prefix,1,length(other.storage_prefix))=other.storage_prefix))
      AND NOT EXISTS (SELECT 1 FROM portfolio_storage_allocations a WHERE (
        substr(a.prefix,1,length(p.storage_prefix))=p.storage_prefix
        OR substr(p.storage_prefix,1,length(a.prefix))=a.prefix))
  ) THEN RAISE(ABORT,'Unreviewed legacy finalization is forbidden.') END;
END;
-- The guard from migration 0011 still applies to the original attested path.
DROP TRIGGER portfolios_finalization_delete_guard;
CREATE TRIGGER portfolios_finalization_delete_guard BEFORE DELETE ON portfolios
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM portfolio_deletion_finalizations r
    JOIN portfolio_deletion_finalizable f ON f.job_id = r.job_id AND f.portfolio_id = r.portfolio_id
    JOIN portfolio_deletion_executions e ON e.job_id = r.job_id
    WHERE r.portfolio_id = OLD.id AND e.lease_token = r.lease_token AND e.generation = r.generation
      AND e.lease_expires_at > unixepoch()
  ) AND NOT EXISTS (
    SELECT 1 FROM portfolio_legacy_deletion_finalizations l
    JOIN portfolio_deletion_jobs j ON j.id=l.job_id AND j.portfolio_id=l.portfolio_id
    WHERE l.portfolio_id=OLD.id AND l.storage_prefix=OLD.storage_prefix
      AND OLD.deletion_requested_at IS NOT NULL AND OLD.storage_birth_token IS NULL
  ) THEN RAISE(ABORT,'Portfolio cleanup is not enabled or finalization is not authorized.') END;
END;
CREATE TRIGGER portfolio_legacy_finalization_apply AFTER INSERT ON portfolio_legacy_deletion_finalizations
BEGIN
  DELETE FROM portfolios WHERE id=NEW.portfolio_id;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM portfolios WHERE id=NEW.portfolio_id)
    THEN RAISE(ABORT,'Legacy portfolio finalization was not completed.') END;
END;
CREATE TRIGGER portfolio_legacy_finalization_no_update BEFORE UPDATE ON portfolio_legacy_deletion_finalizations
BEGIN SELECT RAISE(ABORT,'Legacy deletion receipt is immutable.'); END;
CREATE TRIGGER portfolio_legacy_finalization_no_delete BEFORE DELETE ON portfolio_legacy_deletion_finalizations
BEGIN SELECT RAISE(ABORT,'Legacy deletion receipt must be retained.'); END;
CREATE TRIGGER portfolio_legacy_finalized_identity_insert BEFORE INSERT ON portfolios
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_legacy_deletion_finalizations f
    WHERE f.portfolio_id=NEW.id OR f.storage_prefix=NEW.storage_prefix)
    THEN RAISE(ABORT,'Deleted legacy identity cannot be reused.') END;
END;
CREATE TRIGGER portfolio_legacy_finalized_identity_update BEFORE UPDATE OF id,storage_prefix ON portfolios
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM portfolio_legacy_deletion_finalizations f
    WHERE f.portfolio_id=NEW.id OR f.storage_prefix=NEW.storage_prefix)
    THEN RAISE(ABORT,'Deleted legacy identity cannot be reused.') END;
END;
