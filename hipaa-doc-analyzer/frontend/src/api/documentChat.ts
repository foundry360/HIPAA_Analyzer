import { fetchAuthSession } from 'aws-amplify/auth';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

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

export async function postDocumentChat(body: {
  documentId: string;
  fileName: string;
  messages: ChatTurn[];
}): Promise<{ reply: string }> {
  const res = await fetch(`${apiBase()}/document-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders())
    },
    body: JSON.stringify(body)
  });
  const t = await res.text();
  if (!res.ok) {
    let msg = 'Chat request failed';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
  const data = JSON.parse(t) as { reply?: string };
  if (!data.reply) throw new Error('No reply from assistant');
  return { reply: data.reply };
}
