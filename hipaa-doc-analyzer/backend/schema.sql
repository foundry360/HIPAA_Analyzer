-- HIPAA Doc Analyzer — RDS PostgreSQL schema
-- Run this after RDS is created and you have connected (e.g. via bastion or temporarily public).
-- Create database and user first if not using defaults, e.g.:
--   CREATE DATABASE hipaa_analyzer;
--   CREATE USER analyzer_user WITH PASSWORD 'your-secure-password';
--   GRANT ALL PRIVILEGES ON DATABASE hipaa_analyzer TO analyzer_user;
--   \c hipaa_analyzer

-- Audit log table — NO PHI stored here
CREATE TABLE IF NOT EXISTS audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID NOT NULL,
  user_id               VARCHAR(255) NOT NULL,
  action                VARCHAR(100) NOT NULL,
  phi_entities_detected  INTEGER DEFAULT 0,
  phi_types_found       TEXT[],
  model_used            VARCHAR(100),
  analysis_type         VARCHAR(100),
  status                VARCHAR(50) DEFAULT 'SUCCESS',
  error_message         TEXT,
  duration_ms           INTEGER,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- PHI token map table — encrypted, TTL-managed
CREATE TABLE IF NOT EXISTS phi_token_maps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL UNIQUE,
  encrypted_map     TEXT NOT NULL,
  entity_count      INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Analysis results table — summaries only, no PHI
CREATE TABLE IF NOT EXISTS analysis_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL UNIQUE,
  user_id         VARCHAR(255) NOT NULL,
  analysis_type   VARCHAR(100) NOT NULL,
  summary         TEXT NOT NULL,
  phi_detected    BOOLEAN DEFAULT FALSE,
  entity_count    INTEGER DEFAULT 0,
  model_used      VARCHAR(100),
  analysis_status VARCHAR(50) DEFAULT 'COMPLETE',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_document_id ON audit_log(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_phi_token_maps_expires_at ON phi_token_maps(expires_at);
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id ON analysis_results(user_id);

CREATE TABLE IF NOT EXISTS document_shares (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID NOT NULL,
  owner_user_id       VARCHAR(255) NOT NULL,
  shared_with_user_id VARCHAR(255) NOT NULL,
  shared_with_email   VARCHAR(512),
  file_name           VARCHAR(512) DEFAULT 'Document',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (document_id, shared_with_user_id)
);
CREATE INDEX IF NOT EXISTS idx_document_shares_shared_with ON document_shares (shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_document_shares_document ON document_shares (document_id);
