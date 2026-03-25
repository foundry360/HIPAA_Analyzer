-- Billing: Stripe + GHL sync for allocated AWS cost per tenant (no PHI).
-- Run against hipaa_analyzer after backup. Also applied via RunDbSetup for new DBs.

BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;

CREATE TABLE IF NOT EXISTS billing_period_charges (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_yyyymm         TEXT NOT NULL,
  amount_usd            NUMERIC(14, 4) NOT NULL,
  stripe_invoice_id     TEXT,
  status                TEXT NOT NULL DEFAULT 'invoiced',
  ghl_synced_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, period_yyyymm)
);

CREATE INDEX IF NOT EXISTS idx_billing_period_charges_tenant ON billing_period_charges (tenant_id);

COMMIT;
