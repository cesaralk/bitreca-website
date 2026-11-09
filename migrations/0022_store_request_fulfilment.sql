-- Additive operational metadata on the existing requests. No historical rewrites.
-- Review statuses, immutable item snapshots and deletion triggers remain intact.
ALTER TABLE store_order_requests ADD COLUMN fulfilment_stage TEXT NOT NULL DEFAULT 'new'
  CHECK (fulfilment_stage IN ('new','supplier_check','customer_confirmed','sourcing','ready_for_delivery','out_for_delivery','completed','cancelled','unavailable'));
ALTER TABLE store_order_requests ADD COLUMN delivery_method TEXT CHECK (delivery_method IN ('personal','third_party'));
ALTER TABLE store_order_requests ADD COLUMN delivery_company TEXT NOT NULL DEFAULT '' CHECK (length(delivery_company)<=120);
ALTER TABLE store_order_requests ADD COLUMN tracking_reference TEXT NOT NULL DEFAULT '' CHECK (length(tracking_reference)<=120);
ALTER TABLE store_order_requests ADD COLUMN delivery_notes TEXT NOT NULL DEFAULT '' CHECK (length(delivery_notes)<=2000);
ALTER TABLE store_order_requests ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'not_arranged'
  CHECK (delivery_status IN ('not_arranged','preparing','dispatched','delivered','failed'));
ALTER TABLE store_order_requests ADD COLUMN delivery_charge_minor INTEGER
  CHECK (delivery_charge_minor IS NULL OR (typeof(delivery_charge_minor)='integer' AND delivery_charge_minor BETWEEN 0 AND 999999999999));
ALTER TABLE store_order_requests ADD COLUMN delivery_currency TEXT CHECK (delivery_currency IS NULL OR (length(delivery_currency)=3 AND delivery_currency NOT GLOB '*[^A-Z]*'));
ALTER TABLE store_order_requests ADD COLUMN payment_method TEXT CHECK (payment_method IN ('cod','wish_money'));
ALTER TABLE store_order_requests ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','confirmed'));
ALTER TABLE store_order_requests ADD COLUMN customer_confirmed_at INTEGER CHECK (customer_confirmed_at IS NULL OR customer_confirmed_at>0);
CREATE INDEX idx_store_requests_fulfilment ON store_order_requests(committed,fulfilment_stage,created_at DESC,id DESC);

CREATE TRIGGER store_request_confirmed_terms_guard BEFORE UPDATE ON store_order_requests
WHEN OLD.customer_confirmed_at IS NOT NULL AND
  (NEW.customer_confirmed_at IS NOT OLD.customer_confirmed_at OR NEW.delivery_charge_minor IS NOT OLD.delivery_charge_minor
   OR NEW.delivery_currency IS NOT OLD.delivery_currency OR NEW.payment_method IS NOT OLD.payment_method)
BEGIN SELECT RAISE(ABORT,'STORE_CONFIRMED_TERMS_LOCKED'); END;

CREATE TRIGGER store_request_confirmation_guard BEFORE UPDATE ON store_order_requests
WHEN (NEW.customer_confirmed_at IS NOT NULL AND
  (NEW.delivery_charge_minor IS NULL OR NEW.delivery_currency IS NULL OR NEW.payment_method IS NULL
   OR (SELECT COUNT(*) FROM store_order_request_items WHERE request_ref=OLD.id)<>OLD.line_count
   OR EXISTS(SELECT 1 FROM store_order_request_items WHERE request_ref=OLD.id AND
     (listed_price_minor IS NULL OR listed_currency IS NULL OR listed_currency<>NEW.delivery_currency))))
  OR (NEW.fulfilment_stage IN ('customer_confirmed','sourcing','ready_for_delivery','out_for_delivery','completed') AND NEW.customer_confirmed_at IS NULL)
  OR ((NEW.delivery_charge_minor IS NULL)<>(NEW.delivery_currency IS NULL))
BEGIN SELECT RAISE(ABORT,'STORE_CUSTOMER_CONFIRMATION_REQUIRED'); END;
