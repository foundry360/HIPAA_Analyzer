import { Pool } from 'pg';
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { resolveEmailToSub } from './cognitoUserLookup';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl:
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  max: 5
});

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const PRIMARY_KEY = 'primary_admin_sub';

/** Lazily create admin tables on existing DBs that ran RunDbSetup before these were added. */
let ensureAdminTablesPromise: Promise<void> | null = null;

async function ensureAdminTables(): Promise<void> {
  if (!ensureAdminTablesPromise) {
    ensureAdminTablesPromise = (async () => {
      const stmts = [
        `CREATE TABLE IF NOT EXISTS app_config (
          key   VARCHAR(128) PRIMARY KEY,
          value TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS admin_grants (
          cognito_sub     VARCHAR(128) PRIMARY KEY,
          granted_by_sub  VARCHAR(128),
          created_at      TIMESTAMPTZ DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_admin_grants_created ON admin_grants (created_at)`
      ];
      for (const sql of stmts) {
        await pool.query(sql);
      }
    })();
  }
  await ensureAdminTablesPromise;
}

function escapeFilterValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function persistPrimaryAdminSub(sub: string): Promise<string> {
  const trimmed = sub.trim();
  if (!trimmed) return '';
  try {
    await pool.query(`INSERT INTO app_config (key, value) VALUES ($1, $2)`, [PRIMARY_KEY, trimmed]);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code !== '23505') throw e;
  }
  const again = await pool.query(`SELECT value FROM app_config WHERE key = $1`, [PRIMARY_KEY]);
  return (again.rows[0]?.value as string | undefined)?.trim() ?? trimmed;
}

/**
 * Primary administrator sub is stored in app_config, or bootstrapped once from env (never from
 * "earliest Cognito user" — that incorrectly made newly invited users the primary when they were
 * the only pool member or ordering was ambiguous).
 */
export async function getOrComputePrimaryAdminSub(): Promise<string | null> {
  await ensureAdminTables();
  const cached = await pool.query(`SELECT value FROM app_config WHERE key = $1`, [PRIMARY_KEY]);
  const v = cached.rows[0]?.value as string | undefined;
  if (v?.trim()) return v.trim();

  const envSub = process.env.PRIMARY_ADMIN_SUB?.trim();
  if (envSub) {
    return persistPrimaryAdminSub(envSub);
  }

  const envEmail = process.env.PRIMARY_ADMIN_EMAIL?.trim();
  if (envEmail) {
    const resolved = await resolveEmailToSub(envEmail);
    if (resolved) {
      return persistPrimaryAdminSub(resolved);
    }
  }

  return null;
}

function legacyEnvAdmin(email: string | undefined): boolean {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return false;
  const allowed = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  if (!email?.trim()) return false;
  return allowed.has(email.trim().toLowerCase());
}

/**
 * ADMIN_USERNAMES: comma-separated entries matched only against Cognito username or full email
 * (case-insensitive). Does not match email local-part — that was too easy to misconfigure and
 * accidentally grant admin to any user with e.g. firstname@company.com when the list contained `firstname`.
 */
function legacyEnvAdminUsernames(
  cognitoUsername: string | undefined,
  email: string | undefined
): boolean {
  const raw = process.env.ADMIN_USERNAMES?.trim();
  if (!raw) return false;
  const allowed = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;

  const un = cognitoUsername?.trim().toLowerCase();
  const em = email?.trim().toLowerCase();

  for (const a of allowed) {
    if (un && un === a) return true;
    if (em && em === a) return true;
  }
  return false;
}

export async function isAdminUser(
  sub: string | undefined,
  email: string | undefined,
  cognitoUsername?: string | undefined
): Promise<boolean> {
  if (!sub) return false;
  if (legacyEnvAdmin(email)) return true;
  if (legacyEnvAdminUsernames(cognitoUsername, email)) return true;

  const primary = await getOrComputePrimaryAdminSub();
  if (primary && sub === primary) return true;

  const r = await pool.query(`SELECT 1 FROM admin_grants WHERE cognito_sub = $1`, [sub]);
  return (r.rowCount ?? 0) > 0;
}

export async function getEmailForSub(sub: string): Promise<string | null> {
  const poolId = process.env.COGNITO_USER_POOL_ID?.trim();
  if (!poolId) return null;
  const res = await cognito.send(
    new ListUsersCommand({
      UserPoolId: poolId,
      Filter: `sub = "${escapeFilterValue(sub)}"`,
      Limit: 1
    })
  );
  const u = res.Users?.[0];
  if (!u) return null;
  const attrs = Object.fromEntries((u.Attributes ?? []).map((a) => [a.Name, a.Value]));
  return ((attrs.email as string) || u.Username || null) as string | null;
}

export async function listAdminDetails(): Promise<{
  primary: { sub: string; email: string | null } | null;
  delegates: { sub: string; email: string | null; granted_by_sub: string | null; created_at: string }[];
}> {
  const primarySub = await getOrComputePrimaryAdminSub();
  const primaryEmail = primarySub ? await getEmailForSub(primarySub) : null;
  const primary =
    primarySub != null ? { sub: primarySub, email: primaryEmail } : null;

  const rows = await pool.query<{
    cognito_sub: string;
    granted_by_sub: string | null;
    created_at: Date;
  }>(
    `SELECT cognito_sub, granted_by_sub, created_at FROM admin_grants ORDER BY created_at ASC`
  );

  const delegates: {
    sub: string;
    email: string | null;
    granted_by_sub: string | null;
    created_at: string;
  }[] = [];
  for (const row of rows.rows) {
    delegates.push({
      sub: row.cognito_sub,
      email: await getEmailForSub(row.cognito_sub),
      granted_by_sub: row.granted_by_sub,
      created_at: row.created_at.toISOString()
    });
  }

  return { primary, delegates };
}

export async function grantDelegatedAdmin(params: {
  targetSub: string;
  grantedBySub: string;
}): Promise<{ ok: true } | { ok: false; code: 'PRIMARY' | 'ALREADY' | 'SELF' }> {
  const primary = await getOrComputePrimaryAdminSub();
  if (primary && params.targetSub === primary) {
    return { ok: false, code: 'PRIMARY' };
  }
  if (params.targetSub === params.grantedBySub) {
    return { ok: false, code: 'SELF' };
  }

  const existing = await pool.query(`SELECT 1 FROM admin_grants WHERE cognito_sub = $1`, [
    params.targetSub
  ]);
  if ((existing.rowCount ?? 0) > 0) {
    return { ok: false, code: 'ALREADY' };
  }

  await pool.query(`INSERT INTO admin_grants (cognito_sub, granted_by_sub) VALUES ($1, $2)`, [
    params.targetSub,
    params.grantedBySub
  ]);
  return { ok: true };
}

export async function revokeDelegatedAdmin(targetSub: string): Promise<{ ok: true } | { ok: false; code: 'PRIMARY' | 'NOT_FOUND' }> {
  const primary = await getOrComputePrimaryAdminSub();
  if (primary && targetSub === primary) {
    return { ok: false, code: 'PRIMARY' };
  }
  const r = await pool.query(`DELETE FROM admin_grants WHERE cognito_sub = $1`, [targetSub]);
  if ((r.rowCount ?? 0) === 0) return { ok: false, code: 'NOT_FOUND' };
  return { ok: true };
}

/** Resolve email to sub for admin grant UI. */
export async function resolveSubForGrant(email: string): Promise<string | null> {
  return resolveEmailToSub(email);
}
