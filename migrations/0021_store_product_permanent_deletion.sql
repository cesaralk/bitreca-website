-- Store only. Copy every snapshot before replacing its NOT NULL product link.
-- No request/header/catalogue data is deleted by this migration.
PRAGMA defer_foreign_keys = ON;
DROP TRIGGER store_request_commit_guard;
DROP TRIGGER store_request_item_insert_guard;
DROP TRIGGER store_request_item_no_update;
DROP TRIGGER store_request_item_no_delete;

CREATE TABLE store_order_request_items_next (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  request_ref TEXT NOT NULL REFERENCES store_order_requests(id) ON DELETE RESTRICT,
  product_id TEXT REFERENCES store_products(id) ON DELETE SET NULL,
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
INSERT INTO store_order_request_items_next
  (id,request_ref,product_id,slug,sku,title,category_title,quantity,listed_price_minor,listed_currency,listed_price_note,listed_availability,availability_checked_at,captured_at)
SELECT id,request_ref,CASE WHEN EXISTS(SELECT 1 FROM store_products p WHERE p.id=product_id) THEN product_id ELSE NULL END,
  slug,sku,title,category_title,quantity,listed_price_minor,listed_currency,listed_price_note,listed_availability,availability_checked_at,captured_at
FROM store_order_request_items;
DROP TABLE store_order_request_items;
ALTER TABLE store_order_request_items_next RENAME TO store_order_request_items;
CREATE INDEX idx_store_request_items_ref ON store_order_request_items(request_ref);

CREATE TRIGGER store_request_commit_guard BEFORE UPDATE OF committed ON store_order_requests
WHEN OLD.committed = 0 AND NEW.committed = 1 AND
  ((SELECT COUNT(*) FROM store_order_request_items WHERE request_ref = OLD.id) <> OLD.line_count OR
   COALESCE((SELECT SUM(quantity) FROM store_order_request_items WHERE request_ref = OLD.id),0) <> OLD.total_quantity)
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_CATALOGUE_CHANGED'); END;
CREATE TRIGGER store_request_item_insert_guard BEFORE INSERT ON store_order_request_items
WHEN NEW.product_id IS NULL OR NOT EXISTS (SELECT 1 FROM store_order_requests WHERE id = NEW.request_ref AND committed = 0)
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_IMMUTABLE'); END;
-- Only the FK action after an actual parent deletion may detach a live link.
-- Every captured field and the request identity remain immutable.
CREATE TRIGGER store_request_item_no_update BEFORE UPDATE ON store_order_request_items
WHEN NOT (OLD.product_id IS NOT NULL AND NEW.product_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM store_products WHERE id=OLD.product_id)
  AND NEW.id IS OLD.id AND NEW.request_ref IS OLD.request_ref AND NEW.slug IS OLD.slug
  AND NEW.sku IS OLD.sku AND NEW.title IS OLD.title AND NEW.category_title IS OLD.category_title
  AND NEW.quantity IS OLD.quantity AND NEW.listed_price_minor IS OLD.listed_price_minor
  AND NEW.listed_currency IS OLD.listed_currency AND NEW.listed_price_note IS OLD.listed_price_note
  AND NEW.listed_availability IS OLD.listed_availability
  AND NEW.availability_checked_at IS OLD.availability_checked_at AND NEW.captured_at IS OLD.captured_at)
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_IMMUTABLE'); END;
CREATE TRIGGER store_request_item_no_delete BEFORE DELETE ON store_order_request_items
BEGIN SELECT RAISE(ABORT, 'STORE_REQUEST_IMMUTABLE'); END;

-- Minimal cleanup receipts, not archived products. Product rows are physically removed.
CREATE TABLE store_product_deletions (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  title TEXT NOT NULL,
  sku TEXT NOT NULL,
  version INTEGER NOT NULL,
  image_key TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','removed','retained_shared','no_image')),
  created_at INTEGER NOT NULL DEFAULT(unixepoch()),
  completed_at INTEGER
);
CREATE INDEX idx_store_product_deletions_pending ON store_product_deletions(state,created_at DESC,id DESC);
CREATE TRIGGER store_product_deletion_receipt AFTER DELETE ON store_products
BEGIN
  INSERT INTO store_product_deletions(id,title,sku,version,image_key,state,completed_at)
  VALUES(OLD.id,OLD.title,OLD.sku,OLD.version,OLD.image_key,
    CASE WHEN OLD.image_key IS NULL THEN 'no_image'
      WHEN EXISTS(SELECT 1 FROM store_products WHERE image_key=OLD.image_key) THEN 'retained_shared'
      ELSE 'pending' END,
    CASE WHEN OLD.image_key IS NULL OR EXISTS(SELECT 1 FROM store_products WHERE image_key=OLD.image_key) THEN unixepoch() ELSE NULL END);
END;
CREATE TRIGGER store_product_deleted_id_guard BEFORE INSERT ON store_products
WHEN EXISTS(SELECT 1 FROM store_product_deletions WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'STORE_PRODUCT_DELETED'); END;
-- Serialize image ownership in D1 before any R2 cleanup. This also fences old
-- in-flight writers that passed an earlier R2 existence check.
CREATE TRIGGER store_product_image_delete_insert BEFORE INSERT ON store_products
WHEN NEW.image_key IS NOT NULL AND EXISTS(SELECT 1 FROM store_product_deletions WHERE image_key=NEW.image_key AND state IN ('pending','removed'))
BEGIN SELECT RAISE(ABORT,'STORE_IMAGE_DELETING'); END;
CREATE TRIGGER store_product_image_delete_update BEFORE UPDATE OF image_key ON store_products
WHEN NEW.image_key IS NOT NULL AND EXISTS(SELECT 1 FROM store_product_deletions WHERE image_key=NEW.image_key AND state IN ('pending','removed'))
BEGIN SELECT RAISE(ABORT,'STORE_IMAGE_DELETING'); END;
PRAGMA defer_foreign_keys = OFF;
