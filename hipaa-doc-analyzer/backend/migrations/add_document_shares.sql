-- Run against database `hipaa_analyzer` as a user with CREATE privileges (e.g. analyzer_user or master).
-- Safe to run if the table already exists (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS document_shares (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID NOT NULL,
  owner_user_id       VARCHAR(255) NOT NULL,
  shared_with_user_id VARCHAR(255) NOT NULL,
  file_name           VARCHAR(512) DEFAULT 'Document',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (document_id, shared_with_user_id)
);
CREATE INDEX IF NOT EXISTS idx_document_shares_shared_with ON document_shares (shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_document_shares_document ON document_shares (document_id);
