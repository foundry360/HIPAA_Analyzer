/**
 * GoHighLevel (LeadConnector) — update contact custom field for last AWS passthrough amount.
 * No PHI. Optional: set GHL_API_KEY, GHL_LOCATION_ID, GHL_CUSTOM_FIELD_ID_AWS_USD, GHL_CONTACT_BASE_URL.
 */
const BASE = (process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com').replace(/\/$/, '');

export async function syncAwsUsageToGhl(params: {
  ghlContactId: string;
  amountUsd: number;
  periodLabel: string;
}): Promise<void> {
  const key = process.env.GHL_API_KEY?.trim();
  const fieldId = process.env.GHL_CUSTOM_FIELD_ID_AWS_USD?.trim();
  if (!key || !fieldId) {
    console.warn('GHL_API_KEY or GHL_CUSTOM_FIELD_ID_AWS_USD missing; skip GHL sync');
    return;
  }

  const value = params.amountUsd.toFixed(2);
  const url = `${BASE}/contacts/${params.ghlContactId}`;

  const loc = process.env.GHL_LOCATION_ID?.trim();
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Version: process.env.GHL_API_VERSION || '2021-07-28',
      ...(loc ? { 'Location-Id': loc } : {})
    },
    body: JSON.stringify({
      customFields: [{ id: fieldId, value }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL contact update failed ${res.status}: ${text}`);
  }
}
