import { useEffect, useState } from 'react';
import { fetchUserAttributes } from 'aws-amplify/auth';

type Attrs = Awaited<ReturnType<typeof fetchUserAttributes>>;

function initialsFromAttributes(attrs: Attrs): string {
  const name = attrs.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]![0];
      const b = parts[parts.length - 1]![0];
      return `${a}${b}`.toUpperCase();
    }
    if (parts.length === 1 && parts[0]!.length >= 2) {
      return parts[0]!.slice(0, 2).toUpperCase();
    }
    if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase() + '·';
  }
  const given = attrs.given_name?.trim();
  const family = attrs.family_name?.trim();
  if (given && family) return `${given[0]}${family[0]}`.toUpperCase();
  if (given && given.length >= 2) return given.slice(0, 2).toUpperCase();
  if (given) return `${given[0]!}`.toUpperCase() + '·';

  const email = attrs.email?.trim();
  if (email) {
    const local = email.split('@')[0] ?? '';
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    if (local.length === 1) return local.toUpperCase() + '·';
  }

  const preferred = attrs.preferred_username?.trim();
  if (preferred && preferred.length >= 2) return preferred.slice(0, 2).toUpperCase();
  if (preferred) return preferred.slice(0, 1).toUpperCase() + '·';

  return '?';
}

export function UserAvatar() {
  const [label, setLabel] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserAttributes()
      .then((attrs) => {
        if (cancelled) return;
        setLabel(initialsFromAttributes(attrs));
        const displayName =
          attrs.name?.trim() ||
          (attrs.given_name?.trim() && attrs.family_name?.trim()
            ? `${attrs.given_name.trim()} ${attrs.family_name.trim()}`
            : attrs.given_name?.trim() || attrs.family_name?.trim() || null);
        setName(displayName);
        setEmail(attrs.email?.trim() || null);
      })
      .catch(() => {
        if (!cancelled) {
          setLabel('?');
          setName(null);
          setEmail(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      {(name || email) && (
        <div className="flex flex-col">
          {name && (
            <span className="text-sm font-medium text-slate-800 leading-tight">{name}</span>
          )}
          {email && (
            <span className="text-xs text-slate-500 leading-tight">{email}</span>
          )}
        </div>
      )}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold uppercase tracking-tight text-blue-700 ring-2 ring-white ring-offset-0"
        title={name || email || 'Signed-in user'}
        aria-label={name || email || 'User avatar'}
      >
        {label === null ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-300" aria-hidden />
        ) : (
          label
        )}
      </div>
    </div>
  );
}
