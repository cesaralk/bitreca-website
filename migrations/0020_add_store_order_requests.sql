-- Additive S4 only. No seeds or changes to existing tables/configuration.
CREATE TABLE store_order_requests (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) = 36),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  phone TEXT,
  whatsapp_consent INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_consent IN (0,1)),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  manual_review_ack INTEGER NOT NULL CHECK (manual_review_ack = 1),
  line_count INTEGER NOT NULL CHECK (typeof(line_count) = 'integer' AND line_count BETWEEN 1 AND 10),
  total_quantity INTEGER NOT NULL CHECK (typeof(total_quantity) = 'integer' AND total_quantity BETWEEN 1 AND 50),
  committed INTEGER NOT NULL DEFAULT 0 CHECK (committed IN (0,1)),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','awaiting_customer','closed','archived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK ((phone IS NULL AND whatsapp_consent = 0) OR (phone IS NOT NULL AND length(phone) BETWEEN 9 AND 16 AND substr(phone,1,1) = '+' AND whatsapp_consent = 1))
);
CREATE INDEX idx_store_requests_page ON store_order_requests(committed, created_at DESC, id DESC);
CREATE INDEX idx_store_requests_status ON store_order_requests(committed, status, created_at DESC, id DESC);

CREATE TABLE store_order_request_items (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  request_ref TEXT NOT NULL REFERENCES store_order_requests(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 80),
  sku TEXT NOT NULL CHECK (length(sku) BETWEEN 1 AND 64),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
  category_title TEXT NOT NULL CHECK (length(category_title) BETWEEN 1 AND 100),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  listed_price_minor INTEGER,
  listed_currency TEXT,
  listed_price_note TEXT NOT NULL CHECK (length(listed_price_note) <= 500),
  listed_availability TEXT NOT NULL CHECK (listed_availability IN ('unknown','available')),
  availability_checked_at TEXT,
  captured_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(request_ref, product_id),
  CHECK ((listed_price_minor IS NULL AND listed_currency IS NULL) OR
    (listed_price_minor IS NOT NULL AND listed_currency IS NOT NULL AND typeof(listed_price_minor) = 'integer' AND listed_price_minor BETWEEN 0 AND 999999999999 AND length(listed_currency) = 3))
);
CREATE INDEX idx_store_request_items_ref ON store_order_request_items(request_ref);

-- D1 batch commits header + every SELECT-based snapshot + this final marker
-- together. Missing/unpublished/unavailable products abort the entire batch.
CREATE TRIGGER store_request_commit_guard BEFORE UPDATE OF committed ON store_order_requests
WHEN OLD.committed = 0 AND NEW.committed = 1 AND
  ((SELECT COUNT(*) FROM store_order_request_items WHERE request_ref = OLD.id) <> OLD.line_count OR
   COALESCE((SELECT SUM(quantity) FROM store_order_request_items WHERE request_ref = OLD.id),0) <> OLD.total_quantity)
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_CATALOGUE_CHANGED'); END;

CREATE TRIGGER store_request_item_insert_guard BEFORE INSERT ON store_order_request_items
WHEN NOT EXISTS (SELECT 1 FROM store_order_requests WHERE id = NEW.request_ref AND committed = 0)
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_IMMUTABLE'); END;
CREATE TRIGGER store_request_item_no_update BEFORE UPDATE ON store_order_request_items
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_IMMUTABLE'); END;
CREATE TRIGGER store_request_item_no_delete BEFORE DELETE ON store_order_request_items
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_IMMUTABLE'); END;
CREATE TRIGGER store_request_no_delete BEFORE DELETE ON store_order_requests
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_IMMUTABLE'); END;
CREATE TRIGGER store_request_identity_guard BEFORE UPDATE ON store_order_requests
WHEN NEW.id IS NOT OLD.id OR NEW.request_id IS NOT OLD.request_id OR NEW.request_hash IS NOT OLD.request_hash
  OR NEW.name IS NOT OLD.name OR NEW.email IS NOT OLD.email OR NEW.phone IS NOT OLD.phone
  OR NEW.whatsapp_consent IS NOT OLD.whatsapp_consent OR NEW.note IS NOT OLD.note
  OR NEW.manual_review_ack IS NOT OLD.manual_review_ack OR NEW.line_count IS NOT OLD.line_count
  OR NEW.total_quantity IS NOT OLD.total_quantity OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.committed = 1 AND NEW.committed <> 1)
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_IMMUTABLE'); END;

-- Short-lived purpose-separated abuse counters; no raw IP or customer content.
CREATE TABLE store_order_request_limits (
  key TEXT PRIMARY KEY NOT NULL CHECK (length(key) BETWEEN 1 AND 120),
  hits INTEGER NOT NULL CHECK (hits > 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_store_request_limits_expiry ON store_order_request_limits(expires_at);
