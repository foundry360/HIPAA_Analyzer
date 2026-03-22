import { fetchAuthSession } from 'aws-amplify/auth';
import { getApiBaseUrl } from '../config/apiBase';

async function authHeaders(): Promise<{ Authorization: string }> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

export type RedactedPreviewResponse = {
  preview: string | null;
  totalChars: number | null;
  truncated?: boolean;
  phiDetected?: boolean;
  entitiesRedacted?: number;
  message?: string;
  error?: string;
};

export async function fetchRedactedPreview(documentId: string): Promise<RedactedPreviewResponse> {
  const url = `${getApiBaseUrl()}/document/${encodeURIComponent(documentId)}/redacted-preview`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { ...(await authHeaders()) } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    if (msg === 'Failed to fetch') {
      throw new Error(
        `${msg}. Confirm VITE_API_BASE_URL in hipaa-doc-analyzer/frontend/.env.local matches your deployed API (including stage, e.g. /prod). If the route is missing, redeploy so GET /document/{documentId}/redacted-preview exists. For local dev, try VITE_DEV_API_PROXY=true (see .env.example).`
      );
    }
    throw e;
  }
  const t = await res.text();
  let data: RedactedPreviewResponse = { preview: null, totalChars: null };
  try {
    if (t) data = JSON.parse(t) as RedactedPreviewResponse;
  } catch {
    data = { preview: null, totalChars: null, error: t || 'Request failed' };
  }
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}
