-- Multi-tenant: tenants table + tenant_id on tenant-scoped tables.
-- Default tenant UUID must match DEFAULT_TENANT_ID in CDK / Lambda env.
-- Run as analyzer_user (or superuser) against hipaa_analyzer after backup.

BEGIN;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Default',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tenants (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Default organization')
ON CONFLICT (id) DO NOTHING;

-- audit_log
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE audit_log SET tenant_id = '00000000-0000-4000-8000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE audit_log ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log (tenant_id);

-- analysis_results
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE analysis_results SET tenant_id = '00000000-0000-4000-8000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE analysis_results ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_results_tenant_user_doc ON analysis_results (tenant_id, user_id, document_id);

-- saved_summaries: replace unique (user_id, document_id) with (tenant_id, user_id, document_id)
ALTER TABLE saved_summaries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE saved_summaries SET tenant_id = '00000000-0000-4000-8000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE saved_summaries DROP CONSTRAINT IF EXISTS saved_summaries_user_id_document_id_key;
ALTER TABLE saved_summaries ALTER COLUMN tenant_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS saved_summaries_tenant_user_doc ON saved_summaries (tenant_id, user_id, document_id);

-- document_shares
ALTER TABLE document_shares ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE document_shares SET tenant_id = '00000000-0000-4000-8000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE document_shares ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_shares_tenant ON document_shares (tenant_id);

-- phi_token_maps
ALTER TABLE phi_token_maps ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
UPDATE phi_token_maps p SET tenant_id = ar.tenant_id
FROM analysis_results ar WHERE ar.document_id = p.document_id AND p.tenant_id IS NULL;
UPDATE phi_token_maps SET tenant_id = '00000000-0000-4000-8000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE phi_token_maps ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phi_token_maps_tenant ON phi_token_maps (tenant_id);

COMMIT;
