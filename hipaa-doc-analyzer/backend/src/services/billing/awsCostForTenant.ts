import {
  CostExplorerClient,
  GetCostAndUsageCommand
} from '@aws-sdk/client-cost-explorer';

const client = new CostExplorerClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Sum UnblendedCost for resources tagged with BILLING_COST_TAG_KEY = tenantUuid
 * over [startDate, endDate) (Cost Explorer end date is exclusive for daily/monthly in API).
 * Requires cost allocation tag activation in AWS Billing for this tag key.
 */
export async function getAllocatedAwsCostUsd(params: {
  tenantUuid: string;
  /** Inclusive start, YYYY-MM-DD */
  periodStart: string;
  /** Exclusive end, YYYY-MM-DD (first day of next month) */
  periodEnd: string;
}): Promise<number> {
  const tagKey = (process.env.BILLING_COST_TAG_KEY || 'tenant_id').trim();
  const res = await client.send(
    new GetCostAndUsageCommand({
      TimePeriod: {
        Start: params.periodStart,
        End: params.periodEnd
      },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
      Filter: {
        Tags: {
          Key: tagKey,
          Values: [params.tenantUuid]
        }
      }
    })
  );

  let total = 0;
  for (const r of res.ResultsByTime ?? []) {
    const amt = r.Total?.UnblendedCost?.Amount;
    if (amt != null) total += parseFloat(amt);
  }
  return Math.round(total * 100) / 100;
}
