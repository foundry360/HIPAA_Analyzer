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
