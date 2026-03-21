import {
  CognitoIdentityProviderClient,
  ListUsersCommand
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

/**
 * Resolve a user's Cognito `sub` by email (exact match in the user pool).
 * Returns null if no user or multiple matches.
 */
export async function resolveEmailToSub(email: string): Promise<string | null> {
  const poolId = process.env.COGNITO_USER_POOL_ID;
  if (!poolId?.trim()) {
    throw new Error('COGNITO_USER_POOL_ID is not configured');
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return null;
  }

  const res = await client.send(
    new ListUsersCommand({
      UserPoolId: poolId,
      Filter: `email = "${normalized.replace(/"/g, '')}"`,
      Limit: 2
    })
  );

  const users = res.Users ?? [];
  if (users.length !== 1) return null;

  const subAttr = users[0]!.Attributes?.find((a) => a.Name === 'sub');
  return subAttr?.Value ?? null;
}
