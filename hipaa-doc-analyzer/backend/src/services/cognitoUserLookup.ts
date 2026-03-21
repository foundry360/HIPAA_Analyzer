import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

function subFromAttributes(attrs: { Name?: string; Value?: string }[] | undefined): string | null {
  const subAttr = attrs?.find((a) => a.Name === 'sub');
  return subAttr?.Value ?? null;
}

/**
 * Resolve a user's Cognito `sub` by email (exact match in the user pool).
 * Returns null if no user or multiple matches.
 *
 * Tries AdminGetUser (username = email) first — common for admin-created users — then ListUsers
 * by email attribute. ListUsers alone can fail or miss users depending on pool config.
 */
export async function resolveEmailToSub(email: string): Promise<string | null> {
  const poolId = process.env.COGNITO_USER_POOL_ID;
  if (!poolId?.trim()) {
    throw new Error('COGNITO_USER_POOL_ID is not configured');
  }
  const trimmed = email.trim();
  const normalized = trimmed.toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return null;
  }

  // 1) Username is often the email (case may match sign-up / admin invite)
  for (const candidate of new Set([normalized, trimmed])) {
    try {
      const got = await client.send(
        new AdminGetUserCommand({
          UserPoolId: poolId,
          Username: candidate
        })
      );
      const sub = subFromAttributes(got.UserAttributes);
      if (sub) return sub;
    } catch (e: unknown) {
      const err = e as { name?: string };
      if (err.name === 'UserNotFoundException') continue;
      throw e;
    }
  }

  // 2) List by email attribute (escape double quotes in filter value per Cognito rules)
  const safeForFilter = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  let res;
  try {
    res = await client.send(
      new ListUsersCommand({
        UserPoolId: poolId,
        Filter: `email = "${safeForFilter}"`,
        Limit: 2
      })
    );
  } catch (e: unknown) {
    console.error('ListUsers for email lookup failed:', e);
    throw e;
  }

  const users = res.Users ?? [];
  if (users.length !== 1) return null;

  return subFromAttributes(users[0]!.Attributes) ?? null;
}

/**
 * Resolve primary email for a Cognito `sub` (for display on share rows).
 */
export async function resolveSubToEmail(sub: string): Promise<string | null> {
  const poolId = process.env.COGNITO_USER_POOL_ID;
  if (!poolId?.trim() || !sub?.trim()) return null;
  const safe = sub.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  try {
    const res = await client.send(
      new ListUsersCommand({
        UserPoolId: poolId,
        Filter: `sub = "${safe}"`,
        Limit: 2
      })
    );
    const users = res.Users ?? [];
    if (users.length !== 1) return null;
    return users[0]!.Attributes?.find((a) => a.Name === 'email')?.Value ?? null;
  } catch (e) {
    console.error('resolveSubToEmail:', e);
    return null;
  }
}

export type UserSearchHit = { email: string; sub: string };

/**
 * Prefix search on sign-in email (Cognito `email ^= "prefix"`). Min 2 characters.
 */
export async function searchUsersByEmailPrefix(
  prefix: string,
  options?: { limit?: number; excludeSub?: string }
): Promise<UserSearchHit[]> {
  const poolId = process.env.COGNITO_USER_POOL_ID;
  if (!poolId?.trim()) {
    throw new Error('COGNITO_USER_POOL_ID is not configured');
  }
  const p = prefix.trim().toLowerCase();
  if (p.length < 2) return [];
  const safe = p.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const res = await client.send(
    new ListUsersCommand({
      UserPoolId: poolId,
      Filter: `email ^= "${safe}"`,
      Limit: Math.min(25, Math.max(1, options?.limit ?? 10))
    })
  );
  const out: UserSearchHit[] = [];
  const exclude = options?.excludeSub;
  for (const u of res.Users ?? []) {
    const sub = subFromAttributes(u.Attributes);
    const email = u.Attributes?.find((a) => a.Name === 'email')?.Value;
    if (!sub || !email) continue;
    if (exclude && sub === exclude) continue;
    out.push({ email, sub });
  }
  return out;
}
