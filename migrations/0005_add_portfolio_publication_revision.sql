-- Additive only. Required before deploying publication revision checks.
ALTER TABLE portfolios
ADD COLUMN publication_revision INTEGER NOT NULL DEFAULT 0
CHECK (
    typeof(publication_revision) = 'integer'
    AND publication_revision >= 0
);
