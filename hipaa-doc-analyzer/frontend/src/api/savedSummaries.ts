import { fetchAuthSession } from 'aws-amplify/auth';
import type { AnalyzeResponse, SavedSummaryItem, SharedWithMeItem } from '../types';

async function authHeaders(): Promise<{ Authorization: string }> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

function apiBase(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error('API URL not configured');
  return base;
}

export async function fetchSavedSummaries(): Promise<{
  items: SavedSummaryItem[];
  sharedWithMe: SharedWithMeItem[];
}> {
  const res = await fetch(`${apiBase()}/saved-summaries`, {
    headers: { ...await authHeaders() }
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Failed to load saved summaries';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as {
    items?: SavedSummaryItem[];
    sharedWithMe?: SharedWithMeItem[];
  };
  return {
    items: data.items ?? [],
    sharedWithMe: data.sharedWithMe ?? []
  };
}

export async function saveSummaryToHistory(result: AnalyzeResponse, fileName: string): Promise<void> {
  const res = await fetch(`${apiBase()}/saved-summaries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders())
    },
    body: JSON.stringify({
      documentId: result.documentId,
      fileName: fileName || 'Document',
      summary: result.summary,
      analysisType: result.analysisType,
      phiDetected: result.phiDetected,
      entitiesRedacted: result.entitiesRedacted,
      modelUsed: result.modelUsed || 'unknown'
    })
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not save summary';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
}
