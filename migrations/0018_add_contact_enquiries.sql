-- Additive only: no existing project, portfolio, authentication or deletion data.
CREATE TABLE contact_enquiries (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
  request_id TEXT NOT NULL UNIQUE CHECK (length(request_id) = 36),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  service TEXT NOT NULL CHECK (service IN ('Website development', 'Applications', 'Custom software', 'Game development', 'Not sure yet')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 20 AND 5000),
  phone TEXT,
  whatsapp_consent INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_consent IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'replied', 'archived')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()) CHECK (updated_at >= created_at),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK ((phone IS NULL AND whatsapp_consent = 0) OR
    (phone IS NOT NULL AND length(phone) BETWEEN 9 AND 16 AND substr(phone, 1, 1) = '+' AND whatsapp_consent = 1))
);
CREATE INDEX idx_contact_enquiries_created ON contact_enquiries(created_at DESC, id DESC);
CREATE INDEX idx_contact_enquiries_status_created ON contact_enquiries(status, created_at DESC, id DESC);

-- Short-lived abuse counters only. No raw IP address or message content.
CREATE TABLE contact_enquiry_limits (
  key TEXT PRIMARY KEY NOT NULL CHECK (length(key) BETWEEN 1 AND 120),
  hits INTEGER NOT NULL CHECK (hits > 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_contact_enquiry_limits_expiry ON contact_enquiry_limits(expires_at);
