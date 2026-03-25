import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl:
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  max: 2
});

export type TenantBillingRow = {
  id: string;
  name: string;
  stripe_customer_id: string | null;
  ghl_contact_id: string | null;
};

export async function listTenantsReadyForBilling(): Promise<TenantBillingRow[]> {
  const r = await pool.query<TenantBillingRow>(
    `SELECT id::text, name, stripe_customer_id, ghl_contact_id
     FROM tenants
     WHERE stripe_customer_id IS NOT NULL AND trim(stripe_customer_id) <> ''`
  );
  return r.rows;
}

export async function hasBillingRow(tenantId: string, periodYyyymm: string): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM billing_period_charges WHERE tenant_id = $1 AND period_yyyymm = $2`, [
    tenantId,
    periodYyyymm
  ]);
  return (r.rowCount ?? 0) > 0;
}

export async function insertBillingCharge(params: {
  tenantId: string;
  periodYyyymm: string;
  amountUsd: number;
  stripeInvoiceId: string;
  ghlSynced: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO billing_period_charges (tenant_id, period_yyyymm, amount_usd, stripe_invoice_id, status, ghl_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.tenantId,
      params.periodYyyymm,
      params.amountUsd,
      params.stripeInvoiceId,
      'invoiced',
      params.ghlSynced ? new Date() : null
    ]
  );
}
