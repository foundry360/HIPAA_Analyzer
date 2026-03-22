import { fetchAuthSession } from 'aws-amplify/auth';
import { getApiBaseUrl } from '../config/apiBase';

async function authHeaders(): Promise<{ Authorization: string }> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

export async function fetchAdminMe(): Promise<{ admin: boolean }> {
  const res = await fetch(`${getApiBaseUrl()}/admin/me`, {
    headers: { ...(await authHeaders()) }
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not verify admin status';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
  return (await res.json()) as { admin: boolean };
}

export interface AdminUserRow {
  sub: string;
  username: string;
  email: string;
  status: string;
  enabled: boolean;
  createdAt: string | null;
}

export interface AdminRoster {
  primary: { sub: string; email: string | null } | null;
  delegates: {
    sub: string;
    email: string | null;
    granted_by_sub: string | null;
    created_at: string;
  }[];
}

export async function fetchAdminRoster(): Promise<AdminRoster> {
  const res = await fetch(`${getApiBaseUrl()}/admin/admins`, {
    headers: { ...(await authHeaders()) }
  });
  const t = await res.text();
  if (!res.ok) {
    let msg = 'Could not load administrators';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
  return JSON.parse(t) as AdminRoster;
}

export async function grantDelegatedAdmin(email: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/admin/admins`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders())
    },
    body: JSON.stringify({ email: email.trim().toLowerCase() })
  });
  const t = await res.text();
  if (!res.ok) {
    let msg = 'Could not add administrator';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
}

export async function revokeDelegatedAdmin(sub: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/admin/admins/${encodeURIComponent(sub)}`, {
    method: 'DELETE',
    headers: { ...(await authHeaders()) }
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not remove administrator';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const res = await fetch(`${getApiBaseUrl()}/admin/users`, {
    headers: { ...(await authHeaders()) }
  });
  const t = await res.text();
  if (!res.ok) {
    let msg = 'Could not load users';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
  const data = JSON.parse(t) as { users?: AdminUserRow[] };
  return data.users ?? [];
}

export async function createAdminUser(
  email: string,
  options?: { makeAdmin?: boolean }
): Promise<{ message?: string }> {
  const res = await fetch(`${getApiBaseUrl()}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders())
    },
    body: JSON.stringify({
      email: email.trim(),
      ...(options?.makeAdmin === true ? { makeAdmin: true } : {})
    })
  });
  const t = await res.text();
  if (!res.ok) {
    let msg = 'Could not create user';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
  try {
    return JSON.parse(t) as { message?: string };
  } catch {
    return {};
  }
}

export async function deleteAdminUser(username: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: { ...(await authHeaders()) }
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not delete user';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
}

export async function setAdminUserEnabled(username: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders())
    },
    body: JSON.stringify({ enabled })
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = 'Could not update user';
    try {
      if (t) msg = (JSON.parse(t) as { error?: string }).error ?? t;
    } catch {
      msg = t || msg;
    }
    throw new Error(msg);
  }
}
