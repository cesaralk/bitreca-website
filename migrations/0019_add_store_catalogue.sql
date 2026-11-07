-- Additive S2 only. No seeds, orders, checkout or existing schema changes.
CREATE TABLE store_categories (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  creation_hash TEXT NOT NULL CHECK (length(creation_hash) = 64),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX idx_store_categories_page ON store_categories(created_at DESC, id DESC);
CREATE INDEX idx_store_categories_status ON store_categories(status, created_at DESC, id DESC);

CREATE TABLE store_products (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  creation_hash TEXT NOT NULL CHECK (length(creation_hash) = 64),
  category_id TEXT NOT NULL REFERENCES store_categories(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(sku) BETWEEN 1 AND 64),
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 80),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  specifications TEXT NOT NULL DEFAULT '' CHECK (length(specifications) <= 12000),
  image_key TEXT CHECK (image_key IS NULL OR length(image_key) <= 100),
  source_reference TEXT NOT NULL DEFAULT '' CHECK (length(source_reference) <= 2000),
  internal_notes TEXT NOT NULL DEFAULT '' CHECK (length(internal_notes) <= 4000),
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('unknown','available','unavailable')),
  availability_checked_at TEXT,
  price_minor INTEGER CHECK (price_minor IS NULL OR (typeof(price_minor) = 'integer' AND price_minor BETWEEN 0 AND 999999999999)),
  currency TEXT CHECK (currency IS NULL OR (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*')),
  price_note TEXT NOT NULL DEFAULT '' CHECK (length(price_note) <= 500),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK ((price_minor IS NULL AND currency IS NULL) OR (price_minor IS NOT NULL AND currency IS NOT NULL)),
  CHECK (availability = 'unknown' OR availability_checked_at IS NOT NULL)
);
CREATE INDEX idx_store_products_page ON store_products(created_at DESC, id DESC);
CREATE INDEX idx_store_products_status ON store_products(status, created_at DESC, id DESC);
CREATE INDEX idx_store_products_category ON store_products(category_id, status, created_at DESC, id DESC);

-- Enforce category lifecycle even when writes race. Only new Store tables touched.
CREATE TRIGGER store_product_category_insert BEFORE INSERT ON store_products
WHEN NOT EXISTS (SELECT 1 FROM store_categories WHERE id = NEW.category_id
  AND (NEW.status = 'archived' OR status <> 'archived')
  AND (NEW.status <> 'published' OR status = 'published'))
BEGIN SELECT RAISE(ABORT, 'STORE_CATEGORY_STATE'); END;
CREATE TRIGGER store_product_category_update BEFORE UPDATE ON store_products
WHEN NOT EXISTS (SELECT 1 FROM store_categories WHERE id = NEW.category_id
  AND (NEW.status = 'archived' OR status <> 'archived')
  AND (NEW.status <> 'published' OR status = 'published'))
BEGIN SELECT RAISE(ABORT, 'STORE_CATEGORY_STATE'); END;
CREATE TRIGGER store_category_state_update BEFORE UPDATE OF status ON store_categories
WHEN (NEW.status <> 'published' AND EXISTS (SELECT 1 FROM store_products WHERE category_id = OLD.id AND status = 'published'))
  OR (NEW.status = 'archived' AND EXISTS (SELECT 1 FROM store_products WHERE category_id = OLD.id AND status <> 'archived'))
BEGIN SELECT RAISE(ABORT, 'STORE_CATEGORY_STATE'); END;
