
CREATE TABLE portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    profession TEXT,
    description TEXT,
    thumbnail_url TEXT,

    storage_prefix TEXT NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published')),

    featured INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_portfolios_status
ON portfolios(status);
