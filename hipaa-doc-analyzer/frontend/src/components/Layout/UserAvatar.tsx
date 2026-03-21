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

type UserAvatarProps = {
  /** Initials only, no name/email (rarely needed). */
  compact?: boolean;
};

export function UserAvatar({ compact = false }: UserAvatarProps) {
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

  const circle = (
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
  );

  if (compact) {
    return circle;
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {(name || email) && (
        <div className="flex min-w-0 flex-col text-right">
          {name && (
            <span className="truncate text-sm font-medium leading-tight text-slate-800">{name}</span>
          )}
          {email && (
            <span className="truncate text-xs leading-tight text-slate-500">{email}</span>
          )}
        </div>
      )}
      {circle}
    </div>
  );
}
