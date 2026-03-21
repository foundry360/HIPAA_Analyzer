import { fetchAuthSession } from 'aws-amplify/auth';

export async function getDocumentViewUrl(documentId: string, fileName: string): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (!apiBase) throw new Error('API URL not configured');

  const q = new URLSearchParams({ fileName });
  const res = await fetch(
    `${apiBase}/document/${encodeURIComponent(documentId)}/view-url?${q.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not open document';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as { url: string };
  if (!data.url) throw new Error('No document URL returned');
  return data.url;
}
