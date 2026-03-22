import { fetchAuthSession } from 'aws-amplify/auth';
import type { AnalyzeResponse, SavedSummaryItem, SharedWithMeItem } from '../types';
import { getApiBaseUrl } from '../config/apiBase';

async function authHeaders(): Promise<{ Authorization: string }> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

export async function fetchSavedSummaries(): Promise<{
  items: SavedSummaryItem[];
  sharedWithMe: SharedWithMeItem[];
}> {
  const res = await fetch(`${getApiBaseUrl()}/saved-summaries`, {
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
  const res = await fetch(`${getApiBaseUrl()}/saved-summaries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders())
    },
    body: JSON.stringify({
      documentId: result.documentId,
      fileName: fileName || 'Document',
      summary: typeof result.summary === 'string' ? result.summary : '',
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

export async function renameSavedSummary(documentId: string, fileName: string): Promise<void> {
  const trimmed = fileName.trim();
  if (!trimmed) throw new Error('Name is required');
  /** POST (not PATCH) to same URL as save — same CORS preflight; avoids "Failed to fetch" when sub-routes aren’t deployed. */
  const res = await fetch(`${getApiBaseUrl()}/saved-summaries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders())
    },
    body: JSON.stringify({ op: 'rename', documentId, fileName: trimmed })
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not rename';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
}

export async function deleteSavedSummary(documentId: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/saved-summaries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders())
    },
    body: JSON.stringify({ op: 'delete', documentId })
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not delete';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
}
