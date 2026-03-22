import { fetchAuthSession } from 'aws-amplify/auth';
import { getApiBaseUrl } from '../config/apiBase';

async function authHeaders(): Promise<{ Authorization: string }> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

export interface DocumentShareRow {
  id: string;
  document_id: string;
  owner_user_id: string;
  shared_with_user_id: string;
  /** Sign-in email when available (from DB or Cognito). */
  shared_with_email?: string | null;
  file_name: string;
  created_at: string;
}

export type UserSearchHit = { email: string; sub: string };

export async function searchUsersForShare(query: string): Promise<UserSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(
    `${getApiBaseUrl()}/shares/user-search?q=${encodeURIComponent(q)}`,
    {
      headers: { ...(await authHeaders()) }
    }
  );
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not search users';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { users?: UserSearchHit[] };
  return data.users ?? [];
}

export async function fetchSharesForDocument(documentId: string): Promise<DocumentShareRow[]> {
  const q = new URLSearchParams({ documentId });
  const res = await fetch(`${getApiBaseUrl()}/shares?${q}`, {
    headers: { ...(await authHeaders()) }
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not load shares';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { shares: DocumentShareRow[] };
  return data.shares ?? [];
}

export async function createDocumentShare(params: {
  documentId: string;
  email: string;
  fileName: string;
}): Promise<DocumentShareRow> {
  const res = await fetch(`${getApiBaseUrl()}/shares`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders())
    },
    body: JSON.stringify({
      documentId: params.documentId,
      email: params.email.trim(),
      fileName: params.fileName
    })
  });
  const t = await res.text();
  if (!res.ok) {
    let msg = 'Share failed';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
  const data = JSON.parse(t) as { share: DocumentShareRow };
  return data.share;
}

export async function revokeDocumentShare(shareId: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/shares/${encodeURIComponent(shareId)}`, {
    method: 'DELETE',
    headers: { ...(await authHeaders()) }
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not remove share';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
}
