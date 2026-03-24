/**
 * One-shot: insert a tenant row and create the first Cognito user with custom:tenant_id.
 * Invoke via AWS CLI only (no API Gateway). Same security model as RunDbSetup / DbInspect.
 *
 * Payload: { "tenantName": "Acme Clinic", "email": "admin@acme.com", "makeAdmin": true }
 * makeAdmin: optional; grants delegated admin if a primary admin exists in app_config / env.
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient
} from '@aws-sdk/client-cognito-identity-provider';
import {
  getOrComputePrimaryAdminSub,
  grantDelegatedAdmin,
  resolveSubForGrant
} from '../services/adminRoles';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl:
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  max: 2
});

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

function parseEvent(raw: unknown): Record<string, unknown> {
  if (Buffer.isBuffer(raw)) {
    const s = raw.toString('utf8');
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  }
  if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export const handler = async (
  event: unknown
): Promise<{ statusCode: number; body: string }> => {
  const e = parseEvent(event);
  const tenantName = typeof e.tenantName === 'string' ? e.tenantName.trim() : '';
  const emailRaw = typeof e.email === 'string' ? e.email.trim().toLowerCase() : '';
  const makeAdmin = e.makeAdmin === true;

  if (!tenantName || tenantName.length > 200) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'tenantName is required (max 200 characters)' })
    };
  }
  if (!emailRaw || !isValidEmail(emailRaw)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Valid email is required' })
    };
  }

  const poolId = process.env.COGNITO_USER_POOL_ID?.trim();
  if (!poolId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'COGNITO_USER_POOL_ID is not configured' })
    };
  }

  const tenantId = randomUUID();

  try {
    await pool.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [tenantId, tenantName]);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to insert tenant',
        detail: msg,
        code: code ?? undefined
      })
    };
  }

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: emailRaw,
        UserAttributes: [
          { Name: 'email', Value: emailRaw },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:tenant_id', Value: tenantId }
        ],
        DesiredDeliveryMediums: ['EMAIL']
      })
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Tenant was created but Cognito user creation failed',
        tenantId,
        tenantName,
        detail: msg,
        hint: 'Fix the issue (e.g. duplicate email) or delete the tenant row and retry.'
      })
    };
  }

  let adminGrant: string | undefined;
  if (makeAdmin) {
    const primary = await getOrComputePrimaryAdminSub();
    const targetSub = await resolveSubForGrant(emailRaw);
    if (primary && targetSub) {
      const g = await grantDelegatedAdmin({ targetSub, grantedBySub: primary });
      adminGrant =
        g.ok === true
          ? 'delegated_admin_granted'
          : g.code === 'ALREADY'
            ? 'already_admin'
            : `skipped_${g.code}`;
    } else {
      adminGrant = primary ? 'user_sub_not_resolved' : 'no_primary_admin_configured';
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Tenant and user created',
      tenantId,
      tenantName,
      email: emailRaw,
      makeAdmin,
      adminGrant
    })
  };
};
