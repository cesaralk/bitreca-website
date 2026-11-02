-- Additive only. ADMIN_AUTH_VERSION must match the authoritative row below.
-- Advance this version on every credential/secret rotation; never downgrade it.
CREATE TABLE admin_auth_state (
    admin_id TEXT NOT NULL PRIMARY KEY,
    auth_version INTEGER NOT NULL
        CHECK (typeof(auth_version) = 'integer' AND auth_version > 0)
);

-- Keep each principal's version monotonic, including reset attempts through
-- renaming, deletion/reinsertion, or INSERT OR REPLACE.
CREATE TRIGGER admin_auth_state_no_downgrade
BEFORE UPDATE ON admin_auth_state
WHEN NEW.admin_id <> OLD.admin_id OR NEW.auth_version < OLD.auth_version
BEGIN
    SELECT RAISE(ABORT, 'Authentication state cannot be renamed or downgraded.');
END;

CREATE TRIGGER admin_auth_state_no_replacement_downgrade
BEFORE INSERT ON admin_auth_state
WHEN EXISTS (
    SELECT 1 FROM admin_auth_state
    WHERE admin_id = NEW.admin_id AND auth_version > NEW.auth_version
)
BEGIN
    SELECT RAISE(ABORT, 'Authentication version cannot be downgraded.');
END;

CREATE TRIGGER admin_auth_state_no_delete
BEFORE DELETE ON admin_auth_state
BEGIN
    SELECT RAISE(ABORT, 'Authentication state cannot be deleted.');
END;

INSERT INTO admin_auth_state (admin_id, auth_version)
VALUES ('primary-admin', 1);

CREATE TABLE admin_sessions (
    token_hash TEXT NOT NULL PRIMARY KEY CHECK (length(token_hash) = 64),
    admin_id TEXT NOT NULL REFERENCES admin_auth_state(admin_id),
    auth_version INTEGER NOT NULL
        CHECK (typeof(auth_version) = 'integer' AND auth_version > 0),
    config_fingerprint TEXT NOT NULL CHECK (length(config_fingerprint) = 64),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
);

CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions(expires_at);
