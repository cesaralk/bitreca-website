-- Forward-only security fence. Retain migration 0015 and all historical receipts.
-- Never adopt old births, authorize storage deletion, or enable any runtime control.
CREATE TRIGGER portfolio_legacy_finalization_disabled BEFORE INSERT ON portfolio_legacy_deletion_finalizations
BEGIN SELECT RAISE(ABORT,'Legacy reconciliation requires protected provenance and separate authorization.'); END;
DROP TRIGGER portfolios_finalization_delete_guard;
CREATE TRIGGER portfolios_finalization_delete_guard BEFORE DELETE ON portfolios
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM portfolio_deletion_finalizations r
        JOIN portfolio_deletion_finalizable f ON f.job_id = r.job_id AND f.portfolio_id = r.portfolio_id
        JOIN portfolio_deletion_executions e ON e.job_id = r.job_id
        WHERE r.portfolio_id = OLD.id AND e.lease_token = r.lease_token AND e.generation = r.generation
            AND e.lease_expires_at > unixepoch()
    ) THEN RAISE(ABORT, 'Portfolio cleanup is not enabled or finalization is not authorized.') END;
END;
