/**
 * Monthly job: allocated AWS cost (Cost Explorer + tenant cost tag) → Stripe invoice → GHL custom field → DB row.
 * Trigger: EventBridge schedule (1st of month) or manual Lambda invoke.
 *
 * Manual payload (optional): { "periodYyyymm": "2026-03", "dryRun": true }
 * Prerequisites:
 * - Cost allocation tag BILLING_COST_TAG_KEY (default tenant_id) activated in AWS Billing
 * - tenants.stripe_customer_id set for billable tenants
 * - STRIPE_SECRET_KEY; optional GHL_* for CRM sync
 */
import { getAllocatedAwsCostUsd } from '../services/billing/awsCostForTenant';
import { syncAwsUsageToGhl } from '../services/billing/ghlSync';
import {
  hasBillingRow,
  insertBillingCharge,
  listTenantsReadyForBilling
} from '../services/billing/tenantBillingRepo';
import { chargeAllocatedAwsUsage } from '../services/billing/stripeInvoice';

function parseEvent(raw: unknown): Record<string, unknown> {
  if (Buffer.isBuffer(raw)) {
    const s = raw.toString('utf8');
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  }
  if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function getPreviousCalendarMonth(): { start: string; end: string; periodYyyymm: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const firstCurrent = new Date(Date.UTC(y, m, 1));
  const end = firstCurrent.toISOString().slice(0, 10);
  const prev = new Date(Date.UTC(y, m - 1, 1));
  const start = prev.toISOString().slice(0, 10);
  const py = prev.getUTCFullYear();
  const pm = prev.getUTCMonth() + 1;
  const periodYyyymm = `${py}-${String(pm).padStart(2, '0')}`;
  return { start, end, periodYyyymm };
}

function periodToRange(periodYyyymm: string): { start: string; end: string } {
  const parts = periodYyyymm.split('-');
  if (parts.length !== 2) throw new Error(`Invalid periodYyyymm: ${periodYyyymm}`);
  const y = parseInt(parts[0]!, 10);
  const mo = parseInt(parts[1]!, 10);
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const MIN_CHARGE_USD = 0.01;

export const handler = async (event: unknown): Promise<{ statusCode: number; body: string }> => {
  const e = parseEvent(event);
  const dryRun = e.dryRun === true;
  let periodYyyymm: string;
  let range: { start: string; end: string };

  if (typeof e.periodYyyymm === 'string' && /^\d{4}-\d{2}$/.test(e.periodYyyymm)) {
    periodYyyymm = e.periodYyyymm;
    range = periodToRange(periodYyyymm);
  } else {
    const p = getPreviousCalendarMonth();
    periodYyyymm = p.periodYyyymm;
    range = { start: p.start, end: p.end };
  }

  const results: Array<{
    tenantId: string;
    amountUsd: number;
    skipped?: string;
    stripeInvoiceId?: string;
    error?: string;
  }> = [];

  const tenants = await listTenantsReadyForBilling();

  for (const t of tenants) {
    try {
      if (await hasBillingRow(t.id, periodYyyymm)) {
        results.push({ tenantId: t.id, amountUsd: 0, skipped: 'already_billed' });
        continue;
      }

      const amountUsd = await getAllocatedAwsCostUsd({
        tenantUuid: t.id,
        periodStart: range.start,
        periodEnd: range.end
      });

      if (amountUsd < MIN_CHARGE_USD) {
        results.push({ tenantId: t.id, amountUsd, skipped: 'below_minimum' });
        continue;
      }

      const desc = `AWS allocated usage ${periodYyyymm}`;

      if (dryRun) {
        results.push({ tenantId: t.id, amountUsd, skipped: 'dry_run' });
        continue;
      }

      if (!process.env.STRIPE_SECRET_KEY?.trim()) {
        results.push({ tenantId: t.id, amountUsd, error: 'STRIPE_SECRET_KEY not set' });
        continue;
      }

      const stripeInvoiceId = await chargeAllocatedAwsUsage({
        stripeCustomerId: t.stripe_customer_id!,
        amountUsd,
        description: desc
      });

      let ghlSynced = false;
      if (t.ghl_contact_id?.trim() && process.env.GHL_API_KEY?.trim()) {
        try {
          await syncAwsUsageToGhl({
            ghlContactId: t.ghl_contact_id.trim(),
            amountUsd,
            periodLabel: periodYyyymm
          });
          ghlSynced = true;
        } catch (gErr) {
          console.error(`GHL sync failed for tenant ${t.id}:`, gErr);
        }
      }

      await insertBillingCharge({
        tenantId: t.id,
        periodYyyymm,
        amountUsd,
        stripeInvoiceId,
        ghlSynced
      });

      results.push({ tenantId: t.id, amountUsd, stripeInvoiceId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Billing failed for tenant ${t.id}:`, err);
      results.push({ tenantId: t.id, amountUsd: 0, error: msg });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      periodYyyymm,
      periodStart: range.start,
      periodEnd: range.end,
      dryRun,
      tenantsProcessed: tenants.length,
      results
    })
  };
};
