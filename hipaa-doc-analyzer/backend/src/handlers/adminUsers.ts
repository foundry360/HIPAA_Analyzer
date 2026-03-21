import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType
} from '@aws-sdk/client-cognito-identity-provider';
import { CORS_HEADERS } from '../utils/cors';
import {
  getOrComputePrimaryAdminSub,
  grantDelegatedAdmin,
  isAdminUser,
  listAdminDetails,
  resolveSubForGrant,
  revokeDelegatedAdmin
} from '../services/adminRoles';

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

function getClaims(event: Parameters<APIGatewayProxyHandler>[0]) {
  return (event.requestContext as { authorizer?: { claims?: Record<string, string> } }).authorizer
    ?.claims;
}

function cognitoUsernameFromClaims(claims: Record<string, string> | undefined): string | undefined {
  if (!claims) return undefined;
  return (
    claims['cognito:username'] ??
    claims.username ??
    claims['cognito_username'] ??
    claims.preferred_username
  );
}

async function assertAdmin(
  event: Parameters<APIGatewayProxyHandler>[0]
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const claims = getClaims(event);
  const sub = claims?.sub;
  const email = claims?.email;
  if (await isAdminUser(sub, email, cognitoUsernameFromClaims(claims))) {
    return { ok: true };
  }
  return {
    ok: false,
    status: 403,
    body: JSON.stringify({ error: 'Forbidden', admin: false })
  };
}

function subFromAttributes(attrs: { Name?: string; Value?: string }[] | undefined): string | null {
  const subAttr = attrs?.find((a) => a.Name === 'sub');
  return subAttr?.Value ?? null;
}

function mapUser(u: UserType) {
  const attrs = Object.fromEntries((u.Attributes ?? []).map((a) => [a.Name, a.Value]));
  const email = (attrs.email as string) ?? u.Username ?? '';
  const sub = (attrs.sub as string) ?? '';
  return {
    sub,
    username: u.Username ?? '',
    email,
    status: u.UserStatus ?? 'UNKNOWN',
    enabled: u.Enabled !== false,
    createdAt: u.UserCreateDate?.toISOString() ?? null
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const poolId = process.env.COGNITO_USER_POOL_ID?.trim();
    if (!poolId) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'User pool not configured' })
      };
    }

    const method = event.httpMethod;
    const resource = event.resource ?? '';
    const path = event.path ?? '';

    const isAdminMe =
      (resource === '/admin/me' || path.includes('/admin/me')) && method === 'GET';
    const isAdminAdminsList =
      (resource === '/admin/admins' ||
        (path.includes('/admin/admins') && !path.match(/\/admin\/admins\/[^/]+$/))) &&
      (method === 'GET' || method === 'POST');
    const isAdminAdminsDelete =
      (resource === '/admin/admins/{sub}' || path.match(/\/admin\/admins\/[^/]+$/)) && method === 'DELETE';
    const isListOrCreate =
      (resource === '/admin/users' || (path.includes('/admin/users') && !path.match(/\/admin\/users\/[^/]+$/))) &&
      (method === 'GET' || method === 'POST');
    const isPatchUser =
      (resource === '/admin/users/{username}' || path.match(/\/admin\/users\/[^/]+$/)) && method === 'PATCH';
    const isDeleteUser =
      (resource === '/admin/users/{username}' || path.match(/\/admin\/users\/[^/]+$/)) && method === 'DELETE';

    if (isAdminMe) {
      const claims = getClaims(event);
      const admin = await isAdminUser(claims?.sub, claims?.email, cognitoUsernameFromClaims(claims));
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ admin })
      };
    }

    const gate = await assertAdmin(event);
    if (!gate.ok) {
      return { statusCode: gate.status, headers: CORS_HEADERS, body: gate.body };
    }

    if (isAdminAdminsList && method === 'GET') {
      const details = await listAdminDetails();
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(details)
      };
    }

    if (isAdminAdminsList && method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid JSON' })
        };
      }
      const o = body as Record<string, unknown>;
      const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : '';
      if (!email || !email.includes('@')) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Valid email is required' })
        };
      }
      const targetSub = await resolveSubForGrant(email);
      if (!targetSub) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'No user found with that email.' })
        };
      }
      const claims = getClaims(event);
      const grantedBySub = claims?.sub;
      if (!grantedBySub) {
        return {
          statusCode: 401,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Missing subject' })
        };
      }
      const result = await grantDelegatedAdmin({ targetSub, grantedBySub });
      if (!result.ok) {
        const msg =
          result.code === 'PRIMARY'
            ? 'That user is already the primary administrator.'
            : result.code === 'SELF'
              ? 'You cannot grant administrator to yourself.'
              : 'That user is already an administrator.';
        const status = result.code === 'PRIMARY' || result.code === 'SELF' ? 400 : 409;
        return {
          statusCode: status,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: msg })
        };
      }
      return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true })
      };
    }

    if (isAdminAdminsDelete) {
      const targetSub =
        event.pathParameters?.sub ??
        path.replace(/^.*\/admin\/admins\//, '').split('/')[0] ??
        '';
      const decoded = decodeURIComponent(targetSub);
      const result = await revokeDelegatedAdmin(decoded);
      if (!result.ok) {
        const msg =
          result.code === 'PRIMARY'
            ? 'The primary administrator cannot be removed.'
            : 'That user is not a delegated administrator.';
        const status = result.code === 'PRIMARY' ? 400 : 404;
        return {
          statusCode: status,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: msg })
        };
      }
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true })
      };
    }

    if (isListOrCreate && method === 'GET') {
      const users: ReturnType<typeof mapUser>[] = [];
      let paginationToken: string | undefined;
      do {
        const res = await client.send(
          new ListUsersCommand({
            UserPoolId: poolId,
            Limit: 60,
            PaginationToken: paginationToken
          })
        );
        for (const u of res.Users ?? []) {
          users.push(mapUser(u));
        }
        paginationToken = res.PaginationToken;
      } while (paginationToken && users.length < 500);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ users })
      };
    }

    if (isListOrCreate && method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid JSON' })
        };
      }
      const o = body as Record<string, unknown>;
      const email = typeof o.email === 'string' ? o.email.trim().toLowerCase() : '';
      if (!email || !email.includes('@')) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Valid email is required' })
        };
      }

      const makeAdmin = o.makeAdmin === true;

      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: poolId,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' }
          ],
          DesiredDeliveryMediums: ['EMAIL']
        })
      );

      let delegateMessage: string | undefined;
      if (makeAdmin) {
        const targetSub = await resolveSubForGrant(email);
        const claims = getClaims(event);
        const grantedBySub = claims?.sub;
        if (!grantedBySub) {
          delegateMessage = 'User created; could not assign admin (missing session).';
        } else if (!targetSub) {
          delegateMessage = 'User created; could not assign admin (user lookup failed).';
        } else {
          const result = await grantDelegatedAdmin({ targetSub, grantedBySub });
          if (!result.ok) {
            delegateMessage =
              result.code === 'PRIMARY'
                ? 'User created; that account is the primary administrator.'
                : result.code === 'SELF'
                  ? 'User created; cannot grant admin to yourself.'
                  : result.code === 'ALREADY'
                    ? 'User created; already an administrator.'
                    : 'User created.';
          } else {
            delegateMessage =
              'User created with administrator role. Cognito will email a temporary password if the pool is configured to send messages.';
          }
        }
      }

      return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          message:
            delegateMessage ??
            'User created. Cognito will email a temporary password if the pool is configured to send messages.'
        })
      };
    }

    if (isPatchUser) {
      const username =
        event.pathParameters?.username ??
        path.replace(/^.*\/admin\/users\//, '').split('/')[0] ??
        '';
      const decoded = decodeURIComponent(username);

      let body: unknown;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid JSON' })
        };
      }
      const enabled = Boolean((body as { enabled?: unknown }).enabled);
      if (enabled) {
        await client.send(
          new AdminEnableUserCommand({ UserPoolId: poolId, Username: decoded })
        );
      } else {
        await client.send(
          new AdminDisableUserCommand({ UserPoolId: poolId, Username: decoded })
        );
      }
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true })
      };
    }

    if (isDeleteUser) {
      const username =
        event.pathParameters?.username ??
        path.replace(/^.*\/admin\/users\//, '').split('/')[0] ??
        '';
      const decoded = decodeURIComponent(username);

      const claims = getClaims(event);
      const callerSub = claims?.sub;

      let targetSub: string | null = null;
      try {
        const got = await client.send(
          new AdminGetUserCommand({ UserPoolId: poolId, Username: decoded })
        );
        targetSub = subFromAttributes(got.UserAttributes);
      } catch (e: unknown) {
        const err = e as { name?: string };
        if (err.name === 'UserNotFoundException') {
          return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'User not found.' })
          };
        }
        throw e;
      }

      if (!targetSub) {
        return {
          statusCode: 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Could not read user id.' })
        };
      }
      if (callerSub && targetSub === callerSub) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'You cannot delete your own account.' })
        };
      }

      const primarySub = await getOrComputePrimaryAdminSub();
      if (primarySub && targetSub === primarySub) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error:
              'Cannot delete the primary administrator. Assign another primary in the database or deployment settings first.'
          })
        };
      }

      const rev = await revokeDelegatedAdmin(targetSub);
      if (!rev.ok && rev.code !== 'NOT_FOUND') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Could not remove administrator grant before delete.' })
        };
      }

      await client.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: decoded }));

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true })
      };
    }

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  } catch (error) {
    const err = error as Error & { name?: string };
    console.error('adminUsers error:', err?.message ?? error);
    if (err.name === 'UsernameExistsException') {
      return {
        statusCode: 409,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'A user with this email already exists.' })
      };
    }
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err?.message ?? 'Internal server error' })
    };
  }
};
