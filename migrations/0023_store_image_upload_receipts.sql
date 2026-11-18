-- Additive, empty receipts only. No product, image, request or deletion row changes.
-- Claim after validation and before R2 put: an uncertain storage write is never replayed.
CREATE TABLE store_image_upload_receipts (
  upload_id TEXT PRIMARY KEY NOT NULL CHECK(length(upload_id) = 36),
  product_id TEXT NOT NULL CHECK(length(product_id) = 36),
  image_key TEXT UNIQUE NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size INTEGER NOT NULL CHECK(typeof(size) = 'integer' AND size BETWEEN 1 AND 2097152),
  created_at INTEGER NOT NULL DEFAULT(unixepoch())
);
